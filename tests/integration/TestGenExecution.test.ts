/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证生成 C++ 测试的参考执行、有限修复与跨 Run 复用。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestComposition } from '../helpers/Fixture.ts';
import { cppScenario, cppTestOutput } from '../helpers/CppScenario.ts';
import { roleExample } from '../helpers/RoleExample.ts';
import { ProjectWorkflowStages } from '../../src/application/services/AutomatedProjectWorkflow.ts';
import { TrustedProjectEvaluator } from '../../src/infrastructure/evaluation/project/TrustedProjectEvaluator.ts';
import { JsonSchemaAgentContractValidator } from '../../src/infrastructure/agentAdapters/contracts/JsonSchemaAgentContractValidator.ts';
import { assertModelOutput } from '../../src/infrastructure/agentAdapters/ModelExecution.ts';
import { NODE_BY_AGENT } from '../../src/domain/workflow/AgentDefinitions.ts';
import type { WorkflowStageInput } from '../../src/application/ports/ApplicationPorts.ts';

for (const fix of [true, false]) test(`C++ first-test validation repairs once and ${fix ? 'reuses success across runs' : 'stops after exhaustion'}`, async () => {
  const c = createTestComposition(); const fixture = cppScenario();
  let calls = 0;
  try {
    const stages = new ProjectWorkflowStages({ flywheel: c.service, evalRunner: c.apps.evalRunner,
      evaluator: new TrustedProjectEvaluator(c.artifacts), nodeByAgent: NODE_BY_AGENT,
      contracts: new JsonSchemaAgentContractValidator('docs/specs/schemas'),
      modelFactory: ({ command }) => ({ assertOutput: assertModelOutput, execute: async (request) => {
        if (command.agentType === 'orchestrator') return roleExample('orchestrator').output;
        calls++;
        if (calls > 1) assert.match(request.prompt, /validationFailureRef/);
        return cppTestOutput(fix && calls > 1 ? 4 : 3);
      } }),
    });
    const runOnce = async () => {
      const run = c.service.createRun(fixture.scenario.moduleId, 'cpp-tests');
      const stage: WorkflowStageInput = { runId: run.runId, nodeId: 'orchestrator', agentId: 'orchestrator', iteration: 0, attempt: 1,
        maxIterations: 2, workerCount: 0, prompt: 'Generate C++ tests', context: { scenario: fixture.scenario,
          gatePolicy: { policyId: 'cpp-tests', maxIterations: 2, minimumStability: 1, requireAllTests: true } } };
      Object.assign(stage.context, (await stages.execute(stage)).context);
      Object.assign(stage.context, (await stages.execute({ ...stage, nodeId: 'test_gen', agentId: 'test-gen' })).context);
      return stages.execute({ ...stage, nodeId: 'oracle_validation' });
    };
    const result = await runOnce();
    assert.equal(calls, 2);
    if (!fix) { assert.equal(result.route, 'STOPPED'); assert.ok(result.context?.testValidationRequired); return; }
    assert.ok(result.context?.['validatedTestSuiteRef:0']);
    fixture.scenario.agentConfiguration!.constraints = ['Changed configuration must not regenerate tests'];
    await runOnce();
    assert.equal(calls, 2);
  } finally { fixture.cleanup(); c.dispose(); }
});
