/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验收 AC-AGENT-102 项目编译参数保留及不可绑定配置的人工停止。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { agentScenario } from '../helpers/AgentScenario.ts';

test('AC-AGENT-102: configured define, include, link and runtime arguments survive test binding', async () => {
  const env = await agentScenario();
  try {
    const root = env.f.scenario.repositoryRoot;
    mkdirSync(join(root,'include'));
    writeFileSync(join(root,'include/settings.h'),'#define RESULT 4\n');
    writeFileSync(join(root,'src/module.cpp'),'#include <settings.h>\n#ifndef PROJECT_FEATURE\n#error required project define missing\n#endif\nint calculate(){return RESULT;}\n');
    execFileSync('git',['add','.'],{cwd:root});
    execFileSync('git',['-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','configured build'],{cwd:root});
    env.f.scenario.referenceCommands[0]!.args.unshift('-DPROJECT_FEATURE=1','-Iinclude','-pthread');
    env.f.scenario.referenceCommands[1]!.args.push('runtime-argument');
    env.f.scenario.referenceCommands[1]!.timeoutMs=3000;
    env.f.scenario.referenceCommands.push({tool:'node',purpose:'check',args:['-e','console.log("independent-check")']});
    const {result}=await env.start(2);
    assert.equal(result.route,'PASS',result.error??'');
    assert.equal(env.calls.filter(c=>c.role==='test-gen').length,1);
    const context=env.routes.at(-1)!.context;
    const evidence=JSON.parse(Buffer.from(await env.c.artifacts.get(context['oracleEvidenceRef:0'] as any)).toString());
    assert.ok(evidence.results.some((r:any)=>r.stdout.includes('independent-check')));
    assert.equal(evidence.results.filter((r:any)=>r.tool==='g++').length,1);
    assert.ok(evidence.results.some((r:any)=>r.args.includes('-DPROJECT_FEATURE=1')));
    assert.ok(evidence.results.some((r:any)=>r.args.includes('runtime-argument')));
  } finally {env.dispose();}
});

for(const missing of ['entry','binary','opaque'] as const) test(`AC-AGENT-102: ${missing} binding stops without model repair`,async()=>{
  const env=await agentScenario();
  try{
    if(missing==='entry') env.f.scenario.referenceCommands[0]!.args= ['src/module.cpp','-o','test-bin'];
    if(missing==='binary') env.f.scenario.referenceCommands[1]!.args=['unrelated-bin'];
    if(missing==='opaque') env.f.scenario.referenceCommands=[{tool:'node',purpose:'test',args:['-e','console.log("1..1\\nok 1")']}];
    const {result}=await env.start(1);
    assert.equal(result.route,'STOPPED',result.error??'');
    assert.equal(env.calls.filter(c=>c.role==='test-gen').length,1);
    const stopped=env.routes.at(-1)!.context.testValidationRequired as {evidenceRef:any};
    const evidence=JSON.parse(Buffer.from(await env.c.artifacts.get(stopped.evidenceRef)).toString());
    assert.match(evidence.configurationFailure,/TEST_BUILD_CONFIGURATION_INVALID/);
    assert.equal(env.c.service.status().publications,0);
  }finally{env.dispose();}
});

import { createTestComposition } from '../helpers/Fixture.ts';
import { cppScenario, cppTestOutput } from '../helpers/CppScenario.ts';
import { TrustedProjectEvaluator } from '../../src/infrastructure/evaluation/project/TrustedProjectEvaluator.ts';
import { nativeTestBindings } from '../../src/domain/agents/testGenAgent/TestExecutionPlan.ts';
for (const binaryCwd of ['build', '.']) test(`AC-AGENT-102-R1: build-relative input/output execute from ${binaryCwd}`, async () => {
  const c = createTestComposition(), f = cppScenario();
  try {
    mkdirSync(join(f.scenario.repositoryRoot, 'build'));
    writeFileSync(join(f.scenario.repositoryRoot, 'build/.keep'), '');
    execFileSync('git',['add','.'],{cwd:f.scenario.repositoryRoot});
    execFileSync('git',['-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','build directory'],{cwd:f.scenario.repositoryRoot});
    const commands = [ {tool:'g++' as const,purpose:'check' as const,cwd:'./build',args:['-std=c++17','../src/module.cpp','../tests/generated.cpp','-o','test-bin']},
      {tool:'binary' as const,purpose:'test' as const,cwd:binaryCwd,args:[binaryCwd === 'build' ? './test-bin' : 'build/test-bin']} ];
    const before = JSON.stringify(commands), suite = cppTestOutput();
    assert.equal(nativeTestBindings(commands,suite).length,1);
    const evaluator = new TrustedProjectEvaluator(c.artifacts), snapshot = await evaluator.inspect(f.scenario);
    const result = await evaluator.evaluate({label:'cwd-binding',snapshot,generatedFiles:suite.files,testSuite:suite,prepareCommands:[],commands});
    assert.equal(result.passed,true); assert.equal(JSON.stringify(commands),before);
    assert.throws(()=>nativeTestBindings([{...commands[0]!,args:['../../tests/generated.cpp','-o','test-bin']},commands[1]!],suite),/PATH|CONFIGURATION/);
    await assert.rejects(evaluator.evaluate({label:'cwd-escape',snapshot,generatedFiles:suite.files,testSuite:suite,prepareCommands:[],commands:[commands[0]!,{...commands[1]!,cwd:'../outside'}]}).then(r=>{if(r.configurationFailure) throw new Error(r.configurationFailure);}),/PATH|CONFIGURATION/);
  } finally { f.cleanup();c.dispose(); }
});
