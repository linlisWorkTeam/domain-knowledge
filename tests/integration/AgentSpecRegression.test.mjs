/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：复现并防止 Agent Spec 审查发现的跨角色证据缺口。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createTestComposition, GOOD_BODY } from '../helpers/Fixture.ts';
import { cppScenario, cppTestOutput, orchestratorOutput } from '../helpers/CppScenario.ts';
import { roleExample } from '../helpers/RoleExample.ts';
import { ProjectWorkflowStages } from '../../src/application/services/AutomatedProjectWorkflow.ts';
import { TrustedProjectEvaluator } from '../../src/infrastructure/evaluation/project/TrustedProjectEvaluator.ts';
import { JsonSchemaAgentContractValidator } from '../../src/infrastructure/agentAdapters/contracts/JsonSchemaAgentContractValidator.ts';
import { assertModelOutput } from '../../src/infrastructure/agentAdapters/ModelExecution.ts';
import { NODE_BY_AGENT } from '../../src/domain/workflow/AgentDefinitions.ts';
import { execute as review } from '../../src/domain/agents/reviewAgent/ReviewAgent.ts';
import { execute as check } from '../../src/domain/agents/checkAgent/CheckAgent.ts';
import { validateRevision } from '../../src/domain/agents/docGenAgent/DocGenRevision.ts';
const observations = [];
async function scenarioProbe(name, setup, steps) { return test(name, async () => {
  const c = createTestComposition(), fixture = cppScenario();
  const env = { c, fixture, scenario: fixture.scenario, testCalls: 0, prompts: [], testOutput: () => cppTestOutput(), code: 'int calculate() { return 4; }\n' };
  try {
    await setup(env);
    const stages = new ProjectWorkflowStages({ flywheel: c.service, evalRunner: c.apps.evalRunner,
      evaluator: new TrustedProjectEvaluator(c.artifacts), nodeByAgent: NODE_BY_AGENT,
      contracts: new JsonSchemaAgentContractValidator('docs/specs/schemas'),
      modelFactory: ({ command }) => ({ assertOutput: assertModelOutput, execute: async (request) => {
        env.prompts.push({ role: command.agentType, ...request });
        switch (command.agentType) {
          case 'orchestrator': return orchestratorOutput(env.planModule ?? env.scenario.moduleId);
          case 'test-gen': return env.testOutput(++env.testCalls);
          case 'doc-gen': return { title: 'Module knowledge', description: 'Reference module behavior', keywords: ['module'], body: GOOD_BODY };
          case 'code': return { files: [{ path: 'src/module.cpp', content: env.code }] };
          case 'check': return { blocking: false, findings: [], scope: ['src/module.cpp'] };
          case 'review': return env.reviewOutput ?? { blocking: false, corrections: [] };
          default: throw new Error(command.agentType);
        }
      } }),
    });
    const run = c.service.createRun(env.scenario.moduleId, 'spec-probe');
    const stage = { runId: run.runId, nodeId: 'orchestrator', agentId: 'orchestrator', iteration: 0, attempt: 1,
      maxIterations: 2, workerCount: 0, prompt: 'Execute the role', context: { scenario: env.scenario,
        gatePolicy: { policyId: 'spec-probe', maxIterations: 2, minimumStability: 1, requireAllTests: true } } };
    env.step = async (nodeId) => {
      const agentId = Object.entries(NODE_BY_AGENT).find(([, node]) => node === nodeId)?.[0];
      const result = await stages.execute({ ...stage, nodeId, agentId });
      Object.assign(stage.context, result.context);
      return result;
    };
    env.stage = stage;
    const result = await steps(env);
    observations.push({ name, ...result });
  } finally { fixture.cleanup(); c.dispose(); }
}); }
function commit(root) { execFileSync('git', ['add', '.'], { cwd: root }); execFileSync('git', ['-c', 'user.name=Probe', '-c', 'user.email=probe@example.invalid', 'commit', '-qm', 'probe'], { cwd: root }); }
const prefix = ['orchestrator', 'test_gen', 'oracle_validation', 'doc_gen', 'candidate_knowledge', 'code', 'check'];
await scenarioProbe('uncompiled generated tests cannot be promoted', async (e) => {
  writeFileSync(join(e.scenario.repositoryRoot, 'tests/legacy.cpp'), cppTestOutput().files[0].content);
  commit(e.scenario.repositoryRoot);
  e.scenario.referenceCommands[0].args = ['-std=c++17', 'src/module.cpp', 'tests/legacy.cpp', '-o', 'test-bin'];
  e.testOutput = () => { const output = cppTestOutput(); output.files[0].content = '#error This generated test cannot compile\n'; return output; };
}, async (e) => {
  for (const id of ['orchestrator', 'test_gen', 'oracle_validation']) await e.step(id);
  assert.equal(e.stage.context['validatedTestSuiteRef:0'], undefined);
  assert.ok(e.stage.context.testValidationRequired);
  assert.equal(e.c.service.status().publications, 0);
});
await scenarioProbe('missing reconstructed file prevents publication', async (e) => {
  writeFileSync(join(e.scenario.repositoryRoot, 'src/helper.cpp'), 'int helper() { return 4; }\n');
  writeFileSync(join(e.scenario.repositoryRoot, 'src/module.cpp'), 'int helper(); int calculate() { return helper(); }\n');
  commit(e.scenario.repositoryRoot);
  e.scenario.sourcePaths.push('src/helper.cpp'); e.scenario.allowedGeneratedPaths.push('src/helper.cpp');
  e.scenario.referenceCommands[0].args.splice(2, 0, 'src/helper.cpp');
  e.code = 'int helper(); int calculate() { return helper(); }\n';
}, async (e) => {
  for (const id of prefix.slice(0, -2)) await e.step(id);
  await assert.rejects(e.step('code'), /CODE_RECONSTRUCTION_INCOMPLETE/);
  const evaluator = new TrustedProjectEvaluator(e.c.artifacts);
  await assert.rejects(evaluator.evaluate({ label: 'missing-target', snapshot: e.stage.context.snapshot,
    generatedFiles: [{ path: 'src/module.cpp', content: e.code }], replaceSourcePaths: e.scenario.sourcePaths,
    prepareCommands: [], commands: e.scenario.finalCommands }), /PROJECT_RECONSTRUCTION_INCOMPLETE/);
  assert.equal(e.c.service.status().publications, 0);
});
await scenarioProbe('repair receives previous test source and cases', async (e) => {
  e.testOutput = (call) => { const output = cppTestOutput(call === 1 ? 3 : 4); output.files[0].content += '// unique-prior-test-marker-78421\n'; return output; };
}, async (e) => {
  for (const id of ['orchestrator', 'test_gen', 'oracle_validation']) await e.step(id);
  const repair = e.prompts.filter((r) => r.role === 'test-gen')[1];
  assert.ok(repair); assert.equal(repair.prompt.includes('unique-prior-test-marker-78421'), true);
  assert.equal(repair.readablePaths.includes('tests/generated.cpp'), false);
  return { repairCalls: 1, previousTestContentVisible: false, previousTestFileReadable: false };
});
await scenarioProbe('generated timeout records evidence and stops', async (e) => {
  e.code = 'int calculate() { for (;;) {} }\n';
  e.scenario.finalCommands[1].timeoutMs = 100;
}, async (e) => {
  for (const id of prefix) await e.step(id);
  const result = await e.step('evaluation');
  assert.equal(result.route, 'STOPPED');
  assert.ok(e.stage.context['evaluationEvidenceRef:0']);
  assert.equal(e.c.service.status().publications, 0);
});
await test('Review excerpt resolves to a DocGen revision section', async () => {
  const sample = roleExample('review');
  sample.output.corrections[0].knowledgePath = 'The documented result is 3.';
  const result = await review(sample.input, sample.context);
  const doc = roleExample('doc-gen');
  doc.input.payload.baseKnowledgeRef = sample.input.payload.knowledgeRef;
  doc.input.payload.corrections = result.payload.corrections;
  doc.input.materials.push(...sample.input.materials);
  validateRevision(doc.input);
});
await test('Check rejects invented source evidence', async () => {
  const sample = roleExample('check');
  sample.output.findings[0].original = 'THIS ORIGINAL SOURCE NEVER EXISTED';
  await assert.rejects(check(sample.input, sample.context), /CHECK_EVIDENCE_INVALID/);
});

await scenarioProbe('missing comparison rules cannot publish', async (e) => { delete e.scenario.comparisonRules; }, async (e) => {
  for (const id of prefix.slice(0, -1)) await e.step(id);
  await assert.rejects(e.step('check'), /CHECK_RULES_REQUIRED/);
  assert.equal(e.c.service.status().publications, 0);
});

await scenarioProbe('Orchestrator module selection drives actual knowledge publication', async (e) => {
  const first = { ...e.scenario, moduleId: 'first-module', name: 'not urgent' };
  const second = { ...e.scenario, moduleId: 'second-module', name: 'urgent result contract' };
  e.scenario.modules = [first, second];
  e.scenario.businessGoal = 'Document the urgent result contract first';
  e.planModule = 'second-module';
}, async (e) => {
  for (const id of [...prefix, 'evaluation', 'review', 'workflow_router', 'publication']) await e.step(id);
  assert.equal(e.c.service.getRun(e.stage.runId).moduleId, 'second-module');
  assert.equal(e.c.service.listKnowledgeVersions().find((item) => item.status === 'VERIFIED').moduleId, 'second-module');
  assert.match(e.prompts.find((item) => item.role === 'orchestrator').prompt, /urgent result contract/);
  assert.equal(e.stage.context.scenario.modules, undefined);
});
await scenarioProbe('stopped review creates an actionable evidence handoff', async (e) => {
  e.code = 'int calculate() { for (;;) {} }';
  e.scenario.finalCommands[1].timeoutMs = 100;
  e.reviewOutput = { blocking: true, corrections: [{ correctionId: 'COR-0001', knowledgePath: '设计要点', problem: '需要补全验证依据', suggestion: '补全行为验证的前提', evidence: ['evaluation'] }] };
}, async (e) => {
  for (const id of [...prefix, 'evaluation', 'review']) await e.step(id);
  const result = await e.step('workflow_router');
  assert.equal(result.route, 'STOPPED');
  const event = e.c.repository.listEvents(e.stage.runId).find((item) => item.eventType === 'ReviewHandoffPrepared');
  assert.ok(event);
  assert.match(event.payload.summary, /补全行为验证的前提/);
  assert.ok(event.payload.evidenceRefs.length >= 3);
  const items = e.c.service.listActionItems();
  assert.ok(items.some((item) => String(item.summary).includes('补全行为验证的前提')));
  await e.step('workflow_router');
  assert.equal(e.c.repository.listEvents(e.stage.runId).filter((item) => item.eventType === 'ReviewHandoffPrepared').length, 1);
});
