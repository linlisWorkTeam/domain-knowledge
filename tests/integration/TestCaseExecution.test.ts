/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验收 AC-AGENT-103 固定清单逐用例执行，拒绝汇总冒充或提前退出。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestComposition } from '../helpers/Fixture.ts';
import { cppScenario } from '../helpers/CppScenario.ts';
import { TrustedProjectEvaluator } from '../../src/infrastructure/evaluation/project/TrustedProjectEvaluator.ts';

const manifest = [1,2,3].map(n=>({caseId:`case-${n}`,entryPoint:`test_case_${n}`,testPath:'tests/generated.cpp',target:`behavior ${n}`,input:'calculate()',expected:'4',sourceEvidence:['src/module.cpp']}));
for (const kind of ['complete','legacy-counts','early-exit','missing-entry','failure'] as const) test(`AC-AGENT-103: ${kind} cannot bypass fixed case invocation`,async()=>{
  const c=createTestComposition(),f=cppScenario();
  try{
    const evaluator=new TrustedProjectEvaluator(c.artifacts),snapshot=await evaluator.inspect(f.scenario);
    const content=kind==='legacy-counts' ? '#include <cstdio>\nint main(){puts("1..3\\nok 1\\nok 2\\nok 3");}\n' :
      '#include <cstdio>\n#include <cstdlib>\nint calculate();\n'+[1,2,3].filter(n=>kind!=='missing-entry'||n!==3).map(n=>
        `int test_case_${n}(void){${kind==='early-exit'&&n===2?'exit(0);':''}puts("CALLED-${n}");return ${kind==='failure'&&n===2?'1':'calculate()==4?0:1'};}`).join('\n');
    const suite={files:[{path:'tests/generated.cpp',content}],cases:manifest};
    f.scenario.referenceCommands[1]!.repetitions=2;
    const result=await evaluator.evaluate({label:`case-${kind}`,snapshot,generatedFiles:suite.files,testSuite:suite,prepareCommands:[],commands:f.scenario.referenceCommands});
    assert.equal(result.passed,kind==='complete');
    const evidence=JSON.parse(Buffer.from(await c.artifacts.get(result.evidenceRef)).toString());
    assert.equal(evidence.caseExecution.version,'native-cases-v2-supervised');
    assert.deepEqual(evidence.caseExecution.cases,manifest);
    assert.ok(evidence.caseExecution.manifestSha256);
    if(kind==='complete') {
      assert.equal(result.testsTotal,6);assert.equal(result.testsPassed,6);
      assert.equal(evidence.caseExecution.records.length,6);
      assert.deepEqual(new Set(evidence.caseExecution.records.map((r:any)=>r.caseId)),new Set(manifest.map(c=>c.caseId)));
    }
    if(kind==='early-exit') assert.ok(evidence.caseExecution.failures.some((f:string)=>f.includes('EXIT_BEFORE_RETURN')));
    if(kind==='failure') assert.equal(evidence.caseExecution.records.length,3,'runner must call remaining cases after an ordinary failure return');
  }finally{f.cleanup();c.dispose();}
});

test('AC-AGENT-103: native C runner executes separate entries with helper headers and ignores unrelated counts',async()=>{
  const c=createTestComposition(),f=cppScenario();
  try{
    const evaluator=new TrustedProjectEvaluator(c.artifacts),snapshot=await evaluator.inspect(f.scenario);
    const cases=manifest.map((c,i)=>({...c,testPath:i===0?'tests/first.c':'tests/rest.c'}));
    const suite={cases,files:[{path:'tests/helper.h',content:'#define RESULT 4\n'},
      {path:'tests/first.c',content:'#include "helper.h"\nint test_case_1(void){return RESULT==4?0:1;}'},
      {path:'tests/rest.c',content:'int test_case_2(void){return 0;}\nint test_case_3(void){return 0;}'}]};
    const result=await evaluator.evaluate({label:'native-c-cases',snapshot,testSuite:suite,generatedFiles:suite.files,prepareCommands:[],commands:[
      {tool:'node',purpose:'test',args:['-e','console.log("1..99\\n"+Array.from({length:99},(_,i)=>"ok "+(i+1)).join("\\n"))']},
      {tool:'gcc',purpose:'check',args:['-std=c17','tests/first.c','tests/rest.c','-o','cases']},
      {tool:'binary',purpose:'test',args:['cases']} ]});
    assert.equal(result.passed,true);assert.equal(result.testsTotal,3);assert.equal(result.testsPassed,3);
  }finally{f.cleanup();c.dispose();}
});

import { readSupervisedReturn } from '../../src/infrastructure/evaluation/project/CaseRunner.ts';
for (const channel of ['', '{}', '{"entered":false,"returned":true,"value":0,"reason":"RETURNED"}',
  '{"entered":true,"returned":true,"value":0,"reason":"RETURNED"}\n{"entered":true,"returned":true,"value":0,"reason":"RETURNED"}']) {
  test('AC-AGENT-103-R1: missing, invalid or duplicate supervision channel fails closed',()=>{
    assert.equal(readSupervisedReturn(channel).returned,false);
  });
}

import { agentScenario } from '../helpers/AgentScenario.ts';
import { cppTestOutput } from '../helpers/CppScenario.ts';
import { sourceIdentity } from '../../src/domain/agents/testGenAgent/TestSuitePolicy.ts';
test('AC-AGENT-103: old protocol cache stops for migration without regenerating unchanged-source tests',async()=>{
  const env=await agentScenario();
  try{
    const snapshot=await new TrustedProjectEvaluator(env.c.artifacts).inspect(env.f.scenario);
    const source=JSON.parse(Buffer.from(await env.c.artifacts.get(snapshot.manifestRef)).toString());
    const key=sourceIdentity(env.f.scenario.moduleId,env.f.scenario.sourcePaths,source.files);
    const output=cppTestOutput();
    const validationEvidenceRef=await env.c.artifacts.put(Buffer.from(JSON.stringify({passed:true,infrastructureFailure:false,testsTotal:1})), 'application/json');
    const ref=await env.c.artifacts.put(Buffer.from(JSON.stringify({sourceKey:key,output,validationEvidenceRef})), 'application/json');
    await env.c.service.saveValidatedTestSuite(key,ref);
    const {result}=await env.start(1);
    assert.equal(result.route,'STOPPED',result.error??'');
    assert.equal(env.calls.filter(c=>c.role==='test-gen').length,0);
    assert.equal(env.c.service.status().publications,0);
    const stop=env.routes.at(-1)!.context.testValidationRequired as {evidenceRef:any};
    assert.match(Buffer.from(await env.c.artifacts.get(stop.evidenceRef)).toString(),/TEST_CASE_PROTOCOL_INCOMPATIBLE/);
  }finally{env.dispose();}
});
