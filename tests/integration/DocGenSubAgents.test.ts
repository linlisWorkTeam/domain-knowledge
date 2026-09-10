/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证 DocGen 组合入口、子任务持久化、材料隔离和恢复。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createTestComposition } from '../helpers/Fixture.ts';
import { DocWorkerExecutionService } from '../../src/application/services/DocWorkerExecution.ts';
import type { AgentExampleInput } from '../../src/application/services/AgentExample.ts';
import { NODE_BY_AGENT } from '../../src/domain/services/workflow/AgentDefinitions.ts';
import { ConcurrentTasks } from '../../src/infrastructure/agentAdapters/ConcurrentTasks.ts';
import { assertModelOutput } from '../../src/infrastructure/agentAdapters/ModelExecution.ts';
import { JsonSchemaAgentContractValidator } from '../../src/infrastructure/agentAdapters/contracts/JsonSchemaAgentContractValidator.ts';
import { agents, subAgents } from '../../src/domain/agents/AgentRegistry.ts';

const samplePath = 'src/domain/agents/docGenAgent/examples/DocGenWithWorkersSample.json';

test('DocGen standalone composition commits children before its candidate and exposes their lineage', async () => {
  const composition = createTestComposition();
  try {
    assert.equal('doc-worker' in agents, false);
    assert.equal(subAgents['doc-worker'].parentAgentId, 'doc-gen');
    const sample = JSON.parse(readFileSync(samplePath, 'utf8')) as AgentExampleInput;
    const result = await composition.apps.agentExample.run('doc-gen', sample);
    const refs = result.result.payload['workerResultRefs'] as import('../../src/domain/Domain.ts').ArtifactRef[];
    assert.equal(refs.length, 2);
    for (const ref of refs) {
      const worker = JSON.parse(Buffer.from(await composition.artifacts.get(ref)).toString('utf8'));
      const command = JSON.parse(Buffer.from(await composition.artifacts.get(worker.commandRef)).toString('utf8'));
      assert.equal(worker.agentType, 'doc-worker');
      assert.equal(worker.runId, result.runId);
      assert.equal(command.payload.assignedSourcePaths.length, 1);
      assert.equal(command.payload.baseKnowledgeRef, undefined);
      assert.equal(command.payload.corrections, undefined);
      assert.equal(await composition.artifacts.verify(worker.payload.chunkRef), true);
    }
    const projections = composition.repository.listWorkflowNodeProjections(result.runId);
    assert.equal(projections.filter((item) => item.agentId === 'doc-worker' && item.status === 'COMPLETED').length, 2);
    assert.ok(projections.some((item) => item.nodeId === 'doc_gen/doc_worker:worker-1'));
    assert.equal(composition.service.status().publications, 0);
  } finally { composition.dispose(); }
});

test('failed internal worker prevents DocGen from committing a candidate', async () => {
  const composition = createTestComposition();
  try {
    const sample = JSON.parse(readFileSync(samplePath, 'utf8')) as AgentExampleInput;
    sample.workerModelOutputs!['worker-2'] = {};
    let runId = '';
    const capture = composition.runConfiguration.capture.bind(composition.runConfiguration);
    composition.runConfiguration.capture = async (id) => { runId = id; return capture(id); };
    await assert.rejects(composition.apps.agentExample.run('doc-gen', sample), /AGENT_OUTPUT_INVALID/);
    const checkpoint = composition.repository.getCheckpoint(`${runId}:doc_gen:0:development-v1`);
    assert.ok(checkpoint);
    assert.notEqual(checkpoint.status, 'COMMITTED');
    assert.equal(checkpoint.outputRefs.length, 0);
    assert.equal(composition.repository.getRun(runId)?.state, 'FAILED');
    assert.equal(composition.service.listKnowledgeVersions().length, 0);
    assert.equal(composition.service.status().publications, 0);
  } finally { composition.dispose(); }
});

test('internal retries reuse committed workers with frozen prompts and scoped materials', async () => {
  const composition = createTestComposition();
  try {
    composition.agents.updatePromptAddon('doc-worker', 'WORKER_FROZEN_ADDON');
    const run = composition.service.createRun('subagent-recovery', 'local-v1');
    await composition.runConfiguration.capture(run.runId);
    composition.agents.updatePromptAddon('doc-worker', 'LATER_ADDON_MUST_NOT_LEAK');
    const source = await composition.service.putArtifact(Buffer.from('{"commit":"fixed"}'), 'application/json');
    const correction = await composition.service.putArtifact(Buffer.from('PRIVATE_CORRECTION'), 'text/plain');
    const calls: Record<string, number> = {};
    const requests: import('../../src/domain/agents/AgentExecution.ts').ModelRequest[] = [];
    const service = new DocWorkerExecutionService({
      parent: { moduleId: run.moduleId, payload: { moduleId: run.moduleId, sourceRefs: [source], publicInterfaceRefs: [source],
        corrections: [{ evidenceRefs: [correction] }] }, sourcePaths: ['a.ts', 'b.ts'], publicInterfacePaths: ['public.d.ts'],
        materials: [{ ref: source, content: { commit: 'fixed' } }, { ref: correction, content: 'PRIVATE_CORRECTION' }], provenance: [source] },
      stage: { runId: run.runId, nodeId: 'doc_gen', agentId: 'doc-gen', iteration: 0, attempt: 1,
        maxIterations: 3, workerCount: 2, prompt: 'parent prompt', context: {} },
      flywheel: composition.service, contracts: new JsonSchemaAgentContractValidator('docs/specs/schemas'),
      nodeByAgent: NODE_BY_AGENT, prompts: composition.runConfiguration, observer: { record: () => undefined },
      tasks: new ConcurrentTasks(1),
      model: (_command, stage) => ({ assertOutput: assertModelOutput, execute: async (request) => {
        requests.push(request);
        const id = stage.workerId!; calls[id] = (calls[id] ?? 0) + 1;
        if (id === 'worker-2' && calls[id] === 1) throw new Error('temporary extraction failure');
        return { workerId: id, fragment: `A complete source fragment for ${id}.`, provenance: request.readablePaths };
      } }),
    });
    const tasks = [{ workerId: 'worker-1', sourcePaths: ['a.ts'] }, { workerId: 'worker-2', sourcePaths: ['b.ts'] }];
    await assert.rejects(service.run(tasks), /temporary extraction failure/);
    const fragments = await service.run(tasks);
    assert.equal(fragments.length, 2);
    assert.deepEqual(calls, { 'worker-1': 1, 'worker-2': 2 });
    service.dependencies.stage.iteration = 1;
    assert.deepEqual(await service.run(tasks), fragments);
    assert.deepEqual(calls, { 'worker-1': 1, 'worker-2': 2 });
    assert.deepEqual(requests[0]!.readablePaths, ['a.ts', 'public.d.ts']);
    for (const request of requests) {
      assert.match(request.prompt, /WORKER_FROZEN_ADDON/);
      assert.doesNotMatch(request.prompt, /PRIVATE_CORRECTION|LATER_ADDON_MUST_NOT_LEAK/);
    }
  } finally { composition.dispose(); }
});
