/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证分批测试在失败、取消、重启后恢复及完整参考验收的边界。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createComposition } from '../../src/interfaces/runner/Composition.ts';
import { ProjectWorkflowStages } from '../../src/application/services/AutomatedProjectWorkflow.ts';
import { TrustedProjectEvaluator } from '../../src/infrastructure/evaluation/project/TrustedProjectEvaluator.ts';
import { JsonSchemaAgentContractValidator } from '../../src/infrastructure/agentAdapters/contracts/JsonSchemaAgentContractValidator.ts';
import { assertModelOutput } from '../../src/infrastructure/agentAdapters/ModelExecution.ts';
import { NODE_BY_AGENT } from '../../src/domain/workflow/AgentDefinitions.ts';
import type { WorkflowStageInput } from '../../src/application/ports/ApplicationPorts.ts';
import { cppScenario, cppTestOutput, orchestratorOutput } from '../helpers/CppScenario.ts';

for (const failure of ['timeout', 'invalid-batch'] as const) test(`TestGen preserves committed batches after ${failure}, reopens and validates the complete suite`, async () => {
  const fixture = cppScenario();
  const runtimeDir = mkdtempSync(join(tmpdir(), 'testgen-progress-'));
  let c = createComposition({ runtimeDir, agentProviderMode: 'fixture' });
  const controller = new AbortController();
  const calls: string[] = [];
  let fail = true;
  const cases = Array.from({ length: 5 }, (_, index) => ({ ...cppTestOutput().cases[0]!, caseId: `case-${index + 1}`, entryPoint: `test_case_${index + 1}` }));
  const stages = () => new ProjectWorkflowStages({ flywheel: c.service, evalRunner: c.apps.evalRunner,
    evaluator: new TrustedProjectEvaluator(c.artifacts), nodeByAgent: NODE_BY_AGENT,
    contracts: new JsonSchemaAgentContractValidator('docs/specs/schemas'),
    modelFactory: ({ command }) => ({ assertOutput: assertModelOutput, execute: async (request) => {
      if (command.agentType === 'orchestrator') return orchestratorOutput(fixture.scenario.moduleId);
      const step = request.generationStep!; calls.push(step);
      if (step === 'plan') return { sharedFiles: [{ path: 'tests/generated.cpp', content: 'int calculate();' }], cases };
      if (step === 'batch-2' && fail) {
        if (failure === 'invalid-batch') return { files: [] };
        controller.abort(new Error('test role deadline'));
        // A late model completion after cancellation must not be committed.
      }
      const batch = cases.slice(step === 'batch-1' ? 0 : 4, step === 'batch-1' ? 4 : 5);
      return { files: [{ path: 'tests/generated.cpp', content: batch.map(item => `int ${item.entryPoint}(void) { return calculate() == 4 ? 0 : 1; }`).join('\n') }] };
    } }),
  });
  try {
    const run = c.service.createRun(fixture.scenario.moduleId, 'batch-tests');
    const stage: WorkflowStageInput = { runId: run.runId, nodeId: 'orchestrator', agentId: 'orchestrator', iteration: 0, attempt: 1,
      maxIterations: 1, workerCount: 0, prompt: 'Generate source behavior tests', context: { scenario: fixture.scenario,
        gatePolicy: { policyId: 'batch-tests', maxIterations: 1, minimumStability: 1, requireAllTests: true } } };
    Object.assign(stage.context, (await stages().execute(stage)).context);
    const testStage = { ...stage, nodeId: 'test_gen', agentId: 'test-gen' as const };
    const key = `${run.runId}:test_gen:0:main:contract-v12`;
    const progressKey = (step: string) => `${key}:testgen-${step}:batches-v1`;
    await assert.rejects(stages().execute({ ...testStage, signal: controller.signal }), /AGENT_CANCELLED|AGENT_OUTPUT_INVALID/);
    assert.deepEqual(calls, ['plan', 'batch-1', 'batch-2']);
    assert.equal(c.repository.getCheckpoint(key)?.status, 'FAILED');
    assert.equal(c.repository.getCheckpoint(progressKey('plan'))?.status, 'COMMITTED');
    const firstBatch = c.repository.getCheckpoint(progressKey('batch-1'))!;
    assert.equal(firstBatch.status, 'COMMITTED');
    assert.equal(c.repository.getCheckpoint(progressKey('batch-2'))?.status, 'FAILED');
    assert.equal(c.service.status().publications, 0);
    assert.equal(Object.keys(stage.context).some(key => key.startsWith('validatedTestSuiteRef')), false);
    c.close();
    c = createComposition({ runtimeDir, agentProviderMode: 'fixture' });
    fail = false;
    await assert.rejects(stages().execute({ ...testStage, prompt: 'changed prompt' }), /checkpoint.*scope|generation.*input|DOMAIN_INVARIANT/i);
    assert.equal(calls.length, 3, 'different frozen request cannot silently reuse a saved plan');
    Object.assign(stage.context, (await stages().execute(testStage)).context);
    assert.deepEqual(calls, ['plan', 'batch-1', 'batch-2', 'batch-2']);
    assert.deepEqual(c.repository.getCheckpoint(progressKey('batch-1')), firstBatch);
    const validated = await stages().execute({ ...stage, nodeId: 'oracle_validation' });
    assert.ok(validated.context?.['validatedTestSuiteRef:0'], 'only the assembled five-case suite passes real reference compilation/execution');
    assert.equal(c.service.status().publications, 0, 'reference qualification alone cannot publish knowledge');
  } finally { c.close(); fixture.cleanup(); rmSync(runtimeDir, { recursive: true, force: true }); }
});
