/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证持久化五阶段协调的幂等、取消、恢复及业务门禁。
 */
import test from 'node:test';
import { sourceInput, sourceResult } from '../helpers/WorkbenchSourceFixture.ts';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { WorkbenchPipelines } from '../../src/application/services/WorkbenchPipelines.ts';
import { WorkbenchStages } from '../../src/application/services/WorkbenchStages.ts';
import { SqliteStageTasks } from '../../src/infrastructure/sqlite/SqliteStageTasks.ts';
import { SqliteWorkbenchPipelines } from '../../src/infrastructure/sqlite/SqliteWorkbenchPipelines.ts';
import { createPipeline } from '../../src/domain/workbench/WorkbenchPipeline.ts';
import { WORKBENCH_STAGES, type StageInput, type WorkbenchStage } from '../../src/domain/workbench/StageTask.ts';
const input = (stage: WorkbenchStage): StageInput => ({ projectId: 'test', stage, sourceRevision: 'pinned', sourceDigest: 'source', configurationDigest: 'config', cardVersionIds: [], parameters: { snapshotId: 'snapshot' } });
test('pipeline preserves children and usage across failure, restart, cancellation and business rejection', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pipeline-')); const db = join(directory, 'workbench.sqlite');
  const calls = new Map<WorkbenchStage, number>(); let failIndex = true, block = false, behavior = false, aborted = false;
  const open = () => {
    const store = new SqliteWorkbenchPipelines(db), stageStore = new SqliteStageTasks(db);
    const stages = new WorkbenchStages(stageStore, Object.fromEntries(WORKBENCH_STAGES.map((stage) => [stage, async (context: import('../../src/application/services/WorkbenchStages.ts').StageExecutionContext) => {
      calls.set(stage, (calls.get(stage) ?? 0) + 1); context.account('model', { modelCalls: 1, tokens: 10 });
      if (stage === 'INDEX' && failIndex) throw new Error('TEST_INDEX_FAILED');
      if (stage === 'FLYWHEEL' && block) await new Promise((_, reject) => context.signal.addEventListener('abort', () => { aborted = true; reject(context.signal.reason); }, { once: true }));
      return { artifactRefs: [], summary: stage === 'GENERATE' ? { cards: [{ versionId: 'card-v1' }] } : stage === 'FLYWHEEL' ? { modules: [{ interfaceComparison: { compatible: true } }] }
        : stage === 'EVALUATE' ? { completedModules: 1, requestedModules: 1, modules: [{ status: behavior ? 'BEHAVIOR_PASSED' : 'BEHAVIOR_FAILED', interfaceCompatible: true }] } : { failed: 0 } };
    }])));
    const app = new WorkbenchPipelines({ materials: { get: () => null }, environment: async () => 'environment', store, stages, generation: { prepare: async () => input('GENERATE') }, index: { prepare: () => input('INDEX') },
      reconstruction: { prepare: async (_snapshot, versions, options) => { assert.deepEqual(versions, ['card-v1']); assert.equal(options?.configurationDigest, 'config'); return { ...input('FLYWHEEL'), cardVersionIds: versions }; } },
      evaluation: { prepare: async id => ({ ...input('EVALUATE'), cardVersionIds: stages.get(id).input.cardVersionIds }) }, sourceVerification: { prepare: async id => sourceInput(stages.get(id)) }, associations: { prepare: () => input('ASSOCIATE') } });
    return { app, store, stages, stageStore, close: async () => { await app.shutdown(); await stages.shutdown(); store.close(); stageStore.close(); } };
  };
  let runtime = open();
  try {
    const started = await runtime.app.start('snapshot');
    assert.equal((await runtime.app.wait(started.pipelineId)).reasonCode, 'TEST_INDEX_FAILED');
    assert.deepEqual(runtime.app.get(started.pipelineId).completed, ['GENERATE']);
    assert.equal((await runtime.app.start('snapshot')).pipelineId, started.pipelineId); assert.equal(calls.get('GENERATE'), 1);
    assert.throws(() => runtime.app.resume(started.pipelineId, 'wrong'), /PIPELINE_INPUT_CHANGED/);
    await runtime.close(); runtime = open(); failIndex = false; block = true;
    runtime.app.resume(started.pipelineId, started.inputDigest);
    while (!calls.get('FLYWHEEL')) await new Promise((resolve) => setTimeout(resolve, 10));
    runtime.app.cancel(started.pipelineId); assert.equal((await runtime.app.wait(started.pipelineId)).status, 'CANCELLED');
    await runtime.close(); assert.equal(aborted, true); runtime = open(); block = false;
    runtime.app.resume(started.pipelineId, started.inputDigest);
    const rejected = await runtime.app.wait(started.pipelineId);
    assert.equal(rejected.reasonCode, 'PIPELINE_BEHAVIOR_FAILED'); assert.equal(calls.get('ASSOCIATE'), undefined);
    assert.equal(runtime.app.detail(started.pipelineId).usage.modelCalls, 6);
    assert.equal(calls.get('GENERATE'), 1); assert.equal(calls.get('INDEX'), 2); assert.equal(calls.get('FLYWHEEL'), 2);
    runtime.app.resume(started.pipelineId, started.inputDigest); await runtime.app.wait(started.pipelineId);
    assert.equal(calls.get('EVALUATE'), 1, 'a completed but rejected result must not be silently overwritten');
    runtime.app.dependencies.environment = async () => 'changed';
    runtime.app.resume(started.pipelineId, started.inputDigest);
    assert.equal((await runtime.app.wait(started.pipelineId)).reasonCode, 'PIPELINE_ENVIRONMENT_CHANGED');
    const changed = await runtime.app.start('snapshot');
    assert.notEqual(changed.pipelineId, started.pipelineId);
    await runtime.app.wait(changed.pipelineId);
  } finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
});
test('pipeline recovers a persisted handoff before child insertion and reuses successful stages', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pipeline-handoff-')), db = join(directory, 'workbench.sqlite');
  const store = new SqliteWorkbenchPipelines(db), stageStore = new SqliteStageTasks(db);
  let starts = 0;
  const stages = new WorkbenchStages(stageStore, { GENERATE: async () => ({ artifactRefs: [], summary: { cards: [{ versionId: 'v1' }] } }) });
  const original = stages.start.bind(stages); stages.start = (...args) => { starts++; if (starts === 1) throw new Error('TEST_INTERRUPTED_BEFORE_INSERT'); return original(...args); };
  const prepare = async () => { throw new Error('TEST_NEXT_STAGE_STOP'); };
  const app = new WorkbenchPipelines({ materials: { get: () => null }, environment: async () => 'environment', store, stages, generation: { prepare: async () => input('GENERATE') }, reconstruction: { prepare }, evaluation: { prepare }, index: { prepare: () => { throw new Error('TEST_NEXT_STAGE_STOP'); } }, associations: { prepare: () => input('ASSOCIATE') } });
  try {
    const first = await app.start('snapshot'); assert.equal((await app.wait(first.pipelineId)).reasonCode, 'TEST_INTERRUPTED_BEFORE_INSERT');
    const child = app.get(first.pipelineId).children.GENERATE!; assert.equal(stageStore.get(child.taskId), null);
    app.resume(first.pipelineId, first.inputDigest); assert.equal((await app.wait(first.pipelineId)).reasonCode, 'TEST_NEXT_STAGE_STOP');
    assert.equal(stageStore.get(child.taskId)?.status, 'SUCCEEDED'); assert.equal(starts, 2);
  } finally { await app.shutdown(); await stages.shutdown(); store.close(); stageStore.close(); rmSync(directory, { recursive: true, force: true }); }
});
test('dead coordinator owners pause without losing the frozen generation task', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pipeline-owner-')), db = join(directory, 'workbench.sqlite');
  const value = createPipeline(input('GENERATE'), new Date().toISOString(), 'environment');
  const store = new SqliteWorkbenchPipelines(db); store.insert(value); store.close();
  execFileSync(process.execPath, ['--input-type=module', '-e', `import { SqliteWorkbenchPipelines } from ${JSON.stringify(new URL('../../src/infrastructure/sqlite/SqliteWorkbenchPipelines.ts', import.meta.url).href)}; const s=new SqliteWorkbenchPipelines(process.argv[1]); s.claim(process.argv[2]); s.close();`, db, value.pipelineId]);
  const recovered = new SqliteWorkbenchPipelines(db);
  try { recovered.recover(); const current = recovered.get(value.pipelineId)!;
    assert.equal(current.status, 'PAUSED'); assert.equal(current.reasonCode, 'PIPELINE_PROCESS_EXITED'); assert.deepEqual(current.children, value.children);
  } finally { recovered.close(); rmSync(directory, { recursive: true, force: true }); }
});
test('successful one-click execution reaches all five stages and reuses task identities', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pipeline-all-')), db = join(directory, 'workbench.sqlite');
  const store = new SqliteWorkbenchPipelines(db), stageStore = new SqliteStageTasks(db); const seen: WorkbenchStage[] = [];
  const stages = new WorkbenchStages(stageStore, Object.fromEntries(WORKBENCH_STAGES.map((stage) => [stage, async (context: import('../../src/application/services/WorkbenchStages.ts').StageExecutionContext) => {
    if (context.task.input.parameters.operation === 'KNOWLEDGE_SOURCE_VERIFICATION') return sourceResult(context.task.input);
    seen.push(stage); return { artifactRefs: [], summary: stage === 'GENERATE' ? { cards: [{ versionId: 'v1' }] } : stage === 'FLYWHEEL' ? { modules: [{ interfaceComparison: { compatible: true } }] }
      : stage === 'EVALUATE' ? { completedModules: 1, requestedModules: 1, modules: [{ interfaceCompatible: true, status: 'BEHAVIOR_PASSED' }] } : { failed: 0, relations: 0 } };
  }])));
  const app = new WorkbenchPipelines({ materials: { get: () => null }, environment: async () => 'environment', store, stages, generation: { prepare: async () => input('GENERATE') }, reconstruction: { prepare: async (_snapshot, versions) => ({ ...input('FLYWHEEL'), cardVersionIds: versions }) }, evaluation: { prepare: async id => ({ ...input('EVALUATE'), cardVersionIds: stages.get(id).input.cardVersionIds }) }, sourceVerification: { prepare: async id => sourceInput(stages.get(id)) }, index: { prepare: () => input('INDEX') }, associations: { prepare: () => input('ASSOCIATE') } });
  try {
    const first = await app.start('snapshot'); assert.equal((await app.wait(first.pipelineId)).status, 'SUCCEEDED');
    assert.deepEqual(seen, [...WORKBENCH_STAGES]); assert.equal(app.detail(first.pipelineId).publicationVerified, false);
    assert.equal((await app.start('snapshot')).pipelineId, first.pipelineId); assert.equal(seen.length, 5);
    for (const task of app.detail(first.pipelineId).tasks) assert.equal(stages.start(task.input).taskId, task.taskId);
    await assert.rejects(app.start('snapshot', {}, ['missing']), /MATERIAL_NOT_FOUND/);
    const ref = { artifactId: 'fixture', sha256: 'a'.repeat(64), size: 1, mediaType: 'text/plain' };
    app.dependencies.materials = { get: (id) => ({ materialId: id, contractVersion: 'external-material-v1', sourceId: 'source', sourceRevision: `sha256:${ref.sha256}`, locator: 'guide.md', title: 'Guide', applicability: 'Scoped', rawRef: ref, textRef: ref, capturedAt: 'fixed' }) };
    app.dependencies.associations.prepare = (_versions, materialIds) => ({ ...input('ASSOCIATE'), parameters: { materialIds: materialIds ?? [] } });
    const ids = ['material-b', 'material-a'];
    const pending = app.start('snapshot', {}, ids); ids.push('late-material');
    const withMaterials = await pending;
    assert.notEqual(withMaterials.pipelineId, first.pipelineId);
    assert.deepEqual(withMaterials.materialIds, ['material-a', 'material-b']);
    const done = await app.wait(withMaterials.pipelineId); assert.equal(done.status, 'SUCCEEDED');
    assert.deepEqual(done.children.ASSOCIATE!.input.parameters.materialIds, ['material-a', 'material-b']);
    assert.equal(seen.length, 6, 'material selection reruns only association, all prior stages reused');
    assert.equal((await app.start('snapshot', {}, ['material-a', 'material-b'])).pipelineId, done.pipelineId);
    const legacy = { ...createPipeline(input('GENERATE'), new Date().toISOString(), 'legacy'), contractVersion: 'knowledge-pipeline-v1', status: 'PAUSED' as const };
    store.insert(legacy);
    assert.throws(() => app.resume(legacy.pipelineId, legacy.inputDigest), /PIPELINE_CONTRACT_INCOMPATIBLE/);
    assert.throws(() => app.cancel(legacy.pipelineId), /PIPELINE_CONTRACT_INCOMPATIBLE/);
    assert.deepEqual(app.get(legacy.pipelineId), legacy);
    const prior = { ...createPipeline(input('GENERATE'), new Date().toISOString(), 'prior-v15'), contractVersion: 'knowledge-pipeline-v15', status: 'PAUSED' as const };
    store.insert(prior);
    assert.throws(() => app.resume(prior.pipelineId, prior.inputDigest), /PIPELINE_CONTRACT_INCOMPATIBLE/);
    assert.throws(() => app.cancel(prior.pipelineId), /PIPELINE_CONTRACT_INCOMPATIBLE/);
    assert.deepEqual(app.get(prior.pipelineId), prior);
    const v16 = { ...createPipeline(input('GENERATE'), new Date().toISOString(), 'prior-v16'), contractVersion: 'knowledge-pipeline-v16', status: 'PAUSED' as const };
    store.insert(v16);
    assert.throws(() => app.resume(v16.pipelineId, v16.inputDigest), /PIPELINE_CONTRACT_INCOMPATIBLE/);
    assert.throws(() => app.cancel(v16.pipelineId), /PIPELINE_CONTRACT_INCOMPATIBLE/);
    assert.deepEqual(app.get(v16.pipelineId), v16);

  } finally { await app.shutdown(); await stages.shutdown(); store.close(); stageStore.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('batch execution key reuses frozen pipeline after restart even when current configuration changes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pipeline-batch-key-')), db = join(directory, 'workbench.sqlite');
  let configurations = 0, calls = 0;
  const open = () => {
    const store = new SqliteWorkbenchPipelines(db), stageStore = new SqliteStageTasks(db);
    const stages = new WorkbenchStages(stageStore, { GENERATE: async context => {
      calls++; context.account('model', { modelCalls: 1, tokens: 42 }); throw new Error('TEST_STOP_AFTER_CALL');
    } });
    const app = new WorkbenchPipelines({ store, stages, materials: { get: () => null }, environment: async () => 'environment',
      generation: { prepare: async () => ({ ...input('GENERATE'), configurationDigest: `config-${++configurations}` }) },
      index: { prepare: () => input('INDEX') }, reconstruction: { prepare: async () => input('FLYWHEEL') },
      evaluation: { prepare: async () => input('EVALUATE') }, associations: { prepare: () => input('ASSOCIATE') } });
    return { app, close: async () => { await app.shutdown(); await stages.shutdown(); store.close(); stageStore.close(); } };
  };
  let runtime = open();
  try {
    const first = await runtime.app.start('snapshot', {}, [], [], 'batch/round/1'); await runtime.app.wait(first.pipelineId);
    assert.equal(calls, 1); assert.equal(configurations, 1);
    await runtime.close(); runtime = open();
    const replay = await runtime.app.start('snapshot', {}, [], [], 'batch/round/1');
    assert.equal(replay.pipelineId, first.pipelineId); assert.equal(configurations, 1); assert.equal(calls, 1);
    assert.equal(runtime.app.detail(replay.pipelineId).usage.tokens, 42);
    await assert.rejects(runtime.app.start('another-snapshot', {}, [], [], 'batch/round/1'), /IDEMPOTENCY_CONFLICT/);
    const next = await runtime.app.start('snapshot', {}, [], [], 'batch/round/2'); await runtime.app.wait(next.pipelineId);
    assert.notEqual(next.pipelineId, first.pipelineId); assert.equal(calls, 2);
  } finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
});
