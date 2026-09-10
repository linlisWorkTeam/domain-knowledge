/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证生成 C++ 测试的参考执行、有限修复与跨 Run 复用。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestComposition } from '../helpers/Fixture.ts';
import { cppScenario, cppTestOutput, orchestratorOutput } from '../helpers/CppScenario.ts';
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
        if (command.agentType === 'orchestrator') return orchestratorOutput(fixture.scenario.moduleId);
        calls++;
        if (command.payload.validationFailureRef) assert.match(request.prompt, /validationFailureRef/);
        return cppTestOutput(fix && calls > 1 ? 4 : 3);
      } }),
    });
    let lastStage: WorkflowStageInput;
    const runOnce = async () => {
      const run = c.service.createRun(fixture.scenario.moduleId, 'cpp-tests');
      const stage: WorkflowStageInput = { runId: run.runId, nodeId: 'orchestrator', agentId: 'orchestrator', iteration: 0, attempt: 1,
        maxIterations: 2, workerCount: 0, prompt: 'Generate C++ tests', context: { scenario: fixture.scenario,
          gatePolicy: { policyId: 'cpp-tests', maxIterations: 2, minimumStability: 1, requireAllTests: true } } };
      Object.assign(stage.context, (await stages.execute(stage)).context);
      Object.assign(stage.context, (await stages.execute({ ...stage, nodeId: 'test_gen', agentId: 'test-gen' })).context);
      lastStage = { ...stage, nodeId: 'oracle_validation' };
      return stages.execute(lastStage);
    };
    const result = await runOnce();
    assert.equal(calls, 2);
    if (!fix) { assert.equal(result.route, 'STOPPED'); assert.ok(result.context?.testValidationRequired); return; }
    assert.ok(result.context?.['validatedTestSuiteRef:0']);
    const replay = await stages.execute(lastStage!);
    assert.ok(replay.context?.['validatedTestSuiteRef:0']);
    fixture.scenario.agentConfiguration!.testPaths = ['tests/renamed.cpp'];
    fixture.scenario.agentConfiguration!.constraints = ['Changed configuration must not regenerate tests'];
    await runOnce();
    assert.equal(calls, 2);
  } finally { fixture.cleanup(); c.dispose(); }
});

for (const fault of ['compile', 'environment', 'missing-binary'] as const) test(`reference ${fault} failure follows its own repair policy`, async () => {
  const c = createTestComposition(); const fixture = cppScenario(); let calls = 0;
  if (fault === 'environment') fixture.scenario.prepareCommands = [{ tool: 'node', purpose: 'setup', args: ['-e', 'process.exit(1)'] }];
  if (fault === 'missing-binary') fixture.scenario.referenceCommands = [{ tool: 'binary', purpose: 'test', args: ['missing-test-bin'] }];
  try {
    const stages = new ProjectWorkflowStages({ flywheel: c.service, evalRunner: c.apps.evalRunner,
      evaluator: new TrustedProjectEvaluator(c.artifacts), nodeByAgent: NODE_BY_AGENT,
      contracts: new JsonSchemaAgentContractValidator('docs/specs/schemas'),
      modelFactory: ({ command }) => ({ assertOutput: assertModelOutput, execute: async () => {
        if (command.agentType === 'orchestrator') return orchestratorOutput(fixture.scenario.moduleId);
        calls++; const output = cppTestOutput();
        if (fault === 'compile' && calls === 1) output.files[0]!.content = 'invalid C++ source';
        return output;
      } }),
    });
    const run = c.service.createRun(fixture.scenario.moduleId, 'cpp-tests');
    const stage: WorkflowStageInput = { runId: run.runId, nodeId: 'orchestrator', agentId: 'orchestrator', iteration: 0, attempt: 1,
      maxIterations: 2, workerCount: 0, prompt: 'Generate tests', context: { scenario: fixture.scenario,
        gatePolicy: { policyId: 'cpp-tests', maxIterations: 2, minimumStability: 1, requireAllTests: true } } };
    Object.assign(stage.context, (await stages.execute(stage)).context);
    Object.assign(stage.context, (await stages.execute({ ...stage, nodeId: 'test_gen', agentId: 'test-gen' })).context);
    const result = await stages.execute({ ...stage, nodeId: 'oracle_validation' });
    assert.equal(calls, fault === 'compile' ? 2 : 1);
    if (fault === 'compile') assert.ok(result.context?.['validatedTestSuiteRef:0']);
    else {
      assert.equal(result.route, 'STOPPED');
      Object.assign(stage.context, result.context);
      assert.equal((await stages.execute({ ...stage, nodeId: 'evaluation' })).route, 'STOPPED');
      assert.equal((await stages.execute({ ...stage, nodeId: 'workflow_router' })).route, 'STOPPED');
      assert.equal(c.service.status().publications, 0);
    }
  } finally { fixture.cleanup(); c.dispose(); }
});

for (const passing of [true, false]) test(`native C TAP ${passing ? 'success' : 'failure'} is respected even with exit zero`, async () => {
  const c = createTestComposition(); const fixture = cppScenario();
  try {
    const evaluator = new TrustedProjectEvaluator(c.artifacts);
    const snapshot = await evaluator.inspect(fixture.scenario);
    const evaluation = await evaluator.evaluate({ label: 'native-c', snapshot,
      generatedFiles: [{ path: 'tests/generated.c', content: `#include <assert.h>\n#include <stdio.h>\nint calculate(void);\nint main(void) { assert(calculate() == 4); puts("1..1\\n${passing ? 'ok' : 'not ok'} 1 - result"); return 0; }\n` }],
      prepareCommands: [], commands: [
        { tool: 'gcc', purpose: 'check', args: ['-x', 'c', '-std=c17', 'src/module.cpp', 'tests/generated.c', '-o', 'test-bin'] },
        { tool: 'binary', purpose: 'test', args: ['test-bin'] },
      ],
    });
    assert.equal(evaluation.passed, passing);
    assert.equal(evaluation.testsPassed, passing ? 1 : 0);
  } finally { fixture.cleanup(); c.dispose(); }
});
