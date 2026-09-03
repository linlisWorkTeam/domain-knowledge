import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import type {
  AgentCommand, AgentContractValidator, AgentProvider, ProjectSnapshot,
} from '../../src/application/ports/index.ts';
import type { ArtifactRef } from '../../src/domain/index.ts';
import type { KnowledgeFlywheelService } from '../../src/application/services/index.ts';
import {
  OhMyWorkPanelWorkflowExecutor, type AutomatedProjectScenario,
} from '../../src/application/services/automated-project-workflow.ts';
import { JsonSchemaAgentContractValidator } from '../../src/infrastructure/agents/contracts/index.ts';

const artifactRef: ArtifactRef = {
  artifactId: `sha256:${'a'.repeat(64)}`,
  mediaType: 'application/json',
  sha256: 'a'.repeat(64),
  size: 1,
};

test('versioned AgentCommand schema rejects unknown fields and role payload mismatch', () => {
  const contracts = new JsonSchemaAgentContractValidator(join(process.cwd(), 'specs', 'schemas'));
  const command: AgentCommand = {
    schemaVersion: '1.0', commandId: 'command-1', runId: 'run-1',
    agentType: 'orchestrator', generationKey: 'generation-key-0001',
    payload: { policyRef: artifactRef, moduleRefs: [artifactRef] },
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
    assets: {
      knowledgeV1: '', knowledgeV2: '', codeV1: '', codeV2: '', correction: '',
      generatedPath: 'src/out.ts', title: 'title', description: 'description',
    },
  };
  const executor = new OhMyWorkPanelWorkflowExecutor({
    flywheel,
    evalRunner: {} as never,
    evaluator: { inspect: async () => snapshot, evaluate: async () => { throw new Error('unused'); } },
    assetRoot: process.cwd(),
    contracts: rejectingContracts,
    agent: provider,
    agentWorkspaces: { materialize: async () => ({ workspaceRoot: '/tmp/source', readablePaths: [] }) },
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
