/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证角色契约的行为、约束及失败场景。
 */
import { NODE_BY_AGENT } from '../../src/domain/workflow/AgentDefinitions.ts';
import { modelExecutionFactory } from '../../src/infrastructure/agentAdapters/ModelExecution.ts';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import type {
  AgentCommand, AgentContractValidator, AgentProvider, AgentResult, ProjectSnapshot,
} from '../../src/application/ports/ApplicationPorts.ts';
import type { ArtifactRef } from '../../src/domain/Domain.ts';
import type { KnowledgeFlywheelService } from '../../src/application/services/ApplicationServices.ts';
import {
  assertAgentResultBinding, ProjectWorkflowStages, type AutomatedProjectScenario,
} from '../../src/application/services/AutomatedProjectWorkflow.ts';
import { createTestComposition } from '../helpers/Fixture.ts';
import { JsonSchemaAgentContractValidator } from '../../src/infrastructure/agentAdapters/contracts/JsonSchemaAgentContractValidator.ts';

const artifactRef: ArtifactRef = {
  artifactId: `sha256:${'a'.repeat(64)}`,
  mediaType: 'application/json',
  sha256: 'a'.repeat(64),
  size: 1,
};

test('versioned AgentCommand schema rejects unknown fields and role payload mismatch', () => {
  const contracts = new JsonSchemaAgentContractValidator(join(process.cwd(), 'docs', 'specs', 'schemas'));
  const command: AgentCommand = {
    schemaVersion: '1.0', commandId: 'command-1', runId: 'run-1',
    agentType: 'orchestrator', generationKey: 'generation-key-0001',
    payload: { policyRef: artifactRef, moduleRefs: [artifactRef], businessGoalRef: artifactRef, projectConfigurationRef: artifactRef, progressRef: artifactRef },
  };
  contracts.assertCommand(command);
  assert.throws(() => contracts.assertCommand({
    ...command,
    payload: { moduleId: 'wrong-role', sourceRefs: [artifactRef], publicInterfaceRefs: [artifactRef] },
  }), /AGENT_COMMAND_INVALID/);
  assert.throws(() => contracts.assertCommand({ ...command, extra: true } as AgentCommand), /AGENT_COMMAND_INVALID/);
});

test('command validation runs before checkpoint dispatch and provider invocation', async () => {
  let providerRuns = 0;
  let checkpointClaims = 0;
  let state = 'CREATED';
  const flywheel = {
    getRun: () => ({ state }),
    transition: (_runId: string, next: string) => { state = next; },
    putArtifact: async () => artifactRef,
    executeNode: async () => { checkpointClaims += 1; throw new Error('checkpoint must not run'); },
  } as unknown as KnowledgeFlywheelService;
  const provider: AgentProvider = {
    run: async () => { providerRuns += 1; return {}; },
  };
  const rejectingContracts: AgentContractValidator = {
    assertCommand: () => { throw new Error('AGENT_COMMAND_INVALID: forced'); },
    assertResult: () => undefined,
  };
  const snapshot: ProjectSnapshot = {
    repositoryRoot: '/tmp/source', remote: '', checkoutHead: 'head', commit: 'commit', dirty: false,
    sourcePaths: ['src/a.ts'], publicInterfacePaths: ['src/a.ts'], manifestRef: artifactRef,
  };
  const scenario: AutomatedProjectScenario = {
    schemaVersion: '1.0', name: 'contract-order', moduleId: 'module', repositoryRoot: '/tmp/source',
    sourcePaths: ['src/a.ts'], publicInterfacePaths: ['src/a.ts'], allowedGeneratedPaths: ['src/out.ts'],
    prepareCommands: [], referenceCommands: [], firstIterationCommands: [], finalCommands: [],
  };
  const executor = new ProjectWorkflowStages({
    nodeByAgent: NODE_BY_AGENT,
    flywheel,
    evalRunner: {} as never,
    evaluator: { inspect: async () => snapshot, evaluate: async () => { throw new Error('unused'); } },
    contracts: rejectingContracts,
    agent: provider,
    modelFactory: modelExecutionFactory({ materialize: async () => ({ workspaceRoot: '/tmp/source', readablePaths: [] }) }),

  });
  await assert.rejects(executor.execute({
    runId: 'run-1', nodeId: 'orchestrator', agentId: 'orchestrator', iteration: 0,
    maxIterations: 1, attempt: 1, prompt: 'plan', context: {
      scenario, gatePolicy: { policyId: 'policy', minimumStability: 1, requireAllTests: true, maxIterations: 1 },
    }, workerCount: 1,
  }), /AGENT_COMMAND_INVALID/);
  assert.equal(checkpointClaims, 0);
  assert.equal(providerRuns, 0);
});

test('AgentResult binding rejects cross-Run and wrong-command reuse', () => {
  const command: AgentCommand = {
    schemaVersion: '1.0', commandId: 'command-1', runId: 'run-1',
    agentType: 'code', generationKey: 'run-1:code:0:main:contract-v7',
    payload: {
      knowledgeRef: artifactRef, publicInterfaceRefs: [artifactRef], languageId: 'typescript',
      buildContractRef: artifactRef, allowedGeneratedPaths: ['src/out.ts'],
    },
  };
  const result: AgentResult = {
    schemaVersion: '1.0', commandId: command.commandId, commandRef: artifactRef,
    runId: command.runId, agentType: command.agentType, status: 'SUCCEEDED',
    outputRefs: [artifactRef], payload: { resultKind: 'codeArtifact', codeRef: artifactRef },
  };
  const expected = { runId: 'run-1', agentId: 'code' as const, generationKey: command.generationKey };
  assert.doesNotThrow(() => assertAgentResultBinding(result, command, expected));
  assert.throws(() => assertAgentResultBinding({ ...result, runId: 'run-2' }, command, expected),
    /AGENT_RESULT_ROLE_MISMATCH/);
  assert.throws(() => assertAgentResultBinding(result, { ...command, commandId: 'command-2' }, expected),
    /AGENT_RESULT_COMMAND_MISMATCH/);
  assert.throws(() => assertAgentResultBinding(result, { ...command, generationKey: 'wrong-generation-key' }, expected),
    /AGENT_RESULT_COMMAND_MISMATCH/);
});

test('generic stages require a provider and do not commit results after cancellation', async () => {
  for (const mode of ['missing', 'cancelled'] as const) {
    const controller = new AbortController();
    let committed = 0;
    const flywheel = {
      getRun: () => ({ state: 'GENERATING' }),
      putArtifact: async () => artifactRef,
      getArtifact: async () => Buffer.from('{}'),
      executeNode: async (_input: unknown, operation: () => Promise<ArtifactRef[]>) => {
        const outputRefs = await operation();
        committed += 1;
        return { outputRefs };
      },
    } as unknown as KnowledgeFlywheelService;
    const stages = new ProjectWorkflowStages({
    nodeByAgent: NODE_BY_AGENT,
      flywheel, evalRunner: {} as never, evaluator: {} as never,
      contracts: { assertCommand: () => undefined, assertResult: () => undefined },
      modelFactory: modelExecutionFactory({ materialize: async () => ({ workspaceRoot: '/tmp/source', readablePaths: [] }) }),

      ...(mode === 'cancelled' ? { agent: { run: async () => {
        controller.abort();
        return { strategy: 'late result', iteration: 0, parallel: ['documentation'] };
      } } } : {}),
    });
    const scenario: AutomatedProjectScenario = {
      schemaVersion: '1.0', name: 'no-assets', moduleId: 'module', repositoryRoot: '/tmp/source',
      sourcePaths: [], publicInterfacePaths: [], allowedGeneratedPaths: ['generated.ts'],
      prepareCommands: [], referenceCommands: [], firstIterationCommands: [], finalCommands: [],
    };
    await assert.rejects(stages.execute({
      runId: 'run', nodeId: 'orchestrator', agentId: 'orchestrator', iteration: 0,
      attempt: 1, maxIterations: 1, workerCount: 0, prompt: 'plan', signal: controller.signal,
      context: {
        scenario, scenarioRef: artifactRef, gatePolicy: { policyId: 'test' },
        snapshot: { repositoryRoot: '/tmp/source', commit: 'test', manifestRef: artifactRef },
      },
    }), mode === 'missing' ? /WORKFLOW_LIVE_AGENT_UNAVAILABLE/ : /AGENT_CANCELLED/);
    assert.equal(committed, 0);
  }
});


test('committed node output lookup refuses cross-run and uncommitted scenario checkpoints', async () => {
  const composition = createTestComposition();
  try {
    const run = composition.service.createRun('scenario-owner', 'local-v1');
    const other = composition.service.createRun('another-module', 'local-v1');
    const input = { runId: run.runId, nodeId: 'project-scenario', generationKey: `${run.runId}:project-scenario` };
    assert.equal(composition.service.getCommittedNodeOutputs(input), null);
    const ref = await composition.service.putArtifact(Buffer.from('{}'), 'application/json');
    await assert.rejects(composition.service.executeNode({ ...input, inputRefs: [ref] }, async () => {
      throw new Error('interrupted');
    }), /interrupted/);
    assert.equal(composition.service.getCommittedNodeOutputs(input), null);
    await composition.service.executeNode({ ...input, inputRefs: [ref] }, async () => [ref]);
    assert.deepEqual(composition.service.getCommittedNodeOutputs(input), [ref]);
    assert.throws(() => composition.service.getCommittedNodeOutputs({ ...input, runId: other.runId }), /scope mismatch/);
    assert.throws(() => composition.service.getCommittedNodeOutputs({ ...input, nodeId: 'another-node' }), /scope mismatch/);
  } finally { composition.dispose(); }
});


test('orchestrator plans cannot promote the internal DocWorker to an outer role', () => {
  const contracts = new JsonSchemaAgentContractValidator(join(process.cwd(), 'docs', 'specs', 'schemas'));
  const result: AgentResult = { schemaVersion: '1.0', commandId: 'plan', commandRef: artifactRef,
    runId: 'run', agentType: 'orchestrator', status: 'SUCCEEDED', outputRefs: [], payload: {
      resultKind: 'plan', nodes: [{ nodeId: 'doc_worker', agentType: 'doc-worker', dependsOn: [],
        generationKey: 'invalid-outer-worker', inputSchema: 'https://example.com/input',
        outputSchema: 'https://example.com/output', resourceClaims: ['source:read'], artifactExpectations: ['knowledge-chunk'] }],
    } };
  assert.throws(() => contracts.assertResult(result), /AGENT_RESULT_INVALID/);
});
