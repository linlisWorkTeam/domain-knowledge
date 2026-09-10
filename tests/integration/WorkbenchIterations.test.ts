/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证跨轮次历史、无进展暂停及修订中的取消和恢复。
 */
import test from 'node:test';
import { sourceInput, sourceResult } from '../helpers/WorkbenchSourceFixture.ts';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkbenchPipelines } from '../../src/application/services/WorkbenchPipelines.ts';
import { WorkbenchStages } from '../../src/application/services/WorkbenchStages.ts';
import { SqliteStageTasks } from '../../src/infrastructure/sqlite/SqliteStageTasks.ts';
import { SqliteWorkbenchPipelines } from '../../src/infrastructure/sqlite/SqliteWorkbenchPipelines.ts';
import type { StageInput, StageResult, WorkbenchStage } from '../../src/domain/services/workbench/StageTask.ts';
function fixture(target: number, stagnant = false) {
  const directory = mkdtempSync(join(tmpdir(), 'pipeline-rounds-')), db = join(directory, 'workbench.sqlite');
  let blocked = false, revisionStarted = false, calls = 0; let selectedVersions: string[] | undefined;
  const input = (stage: WorkbenchStage, round = 0, versionIds = ['v1'], operation?: string): StageInput => ({ projectId: 'p', stage, cardVersionIds: versionIds, configurationDigest: 'cfg', sourceRevision: 'fixed', sourceDigest: 'src', parameters: { snapshotId: 's', round, ...(operation ? { operation } : {}) } });
  const open = () => {
    const store = new SqliteWorkbenchPipelines(db), stageStore = new SqliteStageTasks(db);
    const stages = new WorkbenchStages(stageStore, {
      GENERATE: async context => { calls++; context.account('call', { modelCalls: 1 }); return { artifactRefs: [], summary: { cards: [{ versionId: 'v1' }] } }; },
      INDEX: async context => { calls++; context.account('call', { modelCalls: 1 }); return { artifactRefs: [], summary: { failed: 0 } }; },
      FLYWHEEL: async (context): Promise<StageResult> => {
        calls++; context.account('call', { modelCalls: 1 }); const round = Number(context.task.input.parameters.round);
        if (context.task.input.parameters.operation) {
          revisionStarted = true;
          if (blocked) await new Promise((_, reject) => context.signal.addEventListener('abort', () => reject(context.signal.reason), { once: true }));
          return { artifactRefs: [], summary: { outcome: 'REVISED_INDEXED', versionIds: [`v${round + 1}`] } };
        }
        return { artifactRefs: [], summary: { modules: [{ interfaceComparison: { compatible: true } }] } };
      },
      EVALUATE: async context => { if (context.task.input.parameters.operation === 'KNOWLEDGE_SOURCE_VERIFICATION') return sourceResult(context.task.input); calls++; context.account('call', { modelCalls: 1 }); return { artifactRefs: [], summary: { completedModules: 1, requestedModules: 1,
        modules: [{ interfaceCompatible: true, status: !stagnant && Number(context.task.input.parameters.round) >= target ? 'BEHAVIOR_PASSED' : 'BEHAVIOR_FAILED' }] } }; },
      ASSOCIATE: async context => { calls++; context.account('call', { modelCalls: 1 }); return { artifactRefs: [], summary: { relations: 0 } }; },
    });
    const app = new WorkbenchPipelines({ store, stages, materials: { get: () => null }, environment: async () => 'environment',
      generation: { prepare: async () => input('GENERATE') }, index: { prepare: versions => input('INDEX', 0, versions), currentVersions: (_snapshot, versions) => selectedVersions ?? versions },
      reconstruction: { prepare: async (_snapshot, versions, options) => {
        const round = options?.retryEvaluationTaskId ? Number(stages.get(options.retryEvaluationTaskId).input.parameters.round) + 1 : 1;
        assert.deepEqual(versions, selectedVersions ?? [`v${round}`]); return input('FLYWHEEL', round, versions);
      } },
      evaluation: { prepare: async codeId => { const code = stages.get(codeId); return input('EVALUATE', Number(code.input.parameters.round), code.input.cardVersionIds); },
        progress: async id => { const round = Number(stages.get(id).input.parameters.round); const failed = stagnant ? ['unchanged'] : Array.from({ length: Math.max(0, target - round) }, (_, i) => `case-${i}`); return { total: target, passed: target - failed.length, failed }; } },
      revision: { prepare: async id => { const task = stages.get(id); return input('FLYWHEEL', Number(task.input.parameters.round), task.input.cardVersionIds, 'KNOWLEDGE_REVISION'); } },
      sourceVerification: { prepare: async id => sourceInput(stages.get(id)) },
      associations: { prepare: versions => input('ASSOCIATE', 0, versions) },
    });
    return { app, store, stageStore, stages, close: async () => { await app.shutdown(); await stages.shutdown(); store.close(); stageStore.close(); } };
  };
  return { open, directory, select: (ids: string[]) => { selectedVersions = ids; }, block: (value: boolean) => { blocked = value; }, started: () => revisionStarted, calls: () => calls };
}
test('automatic repair can exceed three rounds with behavior progress and preserves unique usage', async () => {
  const f = fixture(6), r = f.open();
  try {
    const value = await r.app.start('s'); const done = await r.app.wait(value.pipelineId);
    assert.equal(done.status, 'SUCCEEDED', done.reasonCode ?? ''); assert.equal(done.iterations?.length, 6);
    assert.equal(done.iterations?.filter(round => round.revision).length, 5);
    assert.deepEqual(done.children.ASSOCIATE!.input.cardVersionIds, ['v6']);
    const detail = r.app.detail(value.pipelineId);
    assert.equal(detail.tasks.length, 21); assert.equal(detail.usage.modelCalls, 20); assert.equal(f.calls(), 20);
    assert.equal(new Set(done.iterations!.map(round => round.evaluation!.taskId)).size, 6);
    assert.equal((await r.app.start('s')).pipelineId, value.pipelineId); assert.equal(f.calls(), 20);
  } finally { await r.close(); rmSync(f.directory, { recursive: true, force: true }); }
});
test('changed card versions cannot reset the no-behavior-progress pause and resume cannot reset usage', async () => {
  const f = fixture(99, true), r = f.open();
  try {
    const value = await r.app.start('s'); const stopped = await r.app.wait(value.pipelineId);
    assert.equal(stopped.reasonCode, 'PIPELINE_NO_BEHAVIOR_PROGRESS'); assert.equal(stopped.iterations?.length, 4);
    assert.equal(stopped.children.ASSOCIATE, undefined); const calls = f.calls(); const usage = r.app.detail(value.pipelineId).usage;
    r.app.resume(value.pipelineId, value.inputDigest);
    assert.equal((await r.app.wait(value.pipelineId)).reasonCode, 'PIPELINE_NO_BEHAVIOR_PROGRESS');
    assert.equal(f.calls(), calls); assert.deepEqual(r.app.detail(value.pipelineId).usage, usage);
  } finally { await r.close(); rmSync(f.directory, { recursive: true, force: true }); }
});
test('cancellation reaches the revision task, and restart resumes it without losing completed inputs', async () => {
  const f = fixture(2); let r = f.open(); f.block(true);
  try {
    const value = await r.app.start('s'); while (!f.started()) await new Promise(resolve => setTimeout(resolve, 10));
    const active = r.app.get(value.pipelineId); const revisionId = active.iterations![0]!.revision!.taskId;
    assert.equal(active.activeTaskId, revisionId); assert.notEqual(active.children.FLYWHEEL!.taskId, revisionId);
    r.app.cancel(value.pipelineId); assert.equal((await r.app.wait(value.pipelineId)).status, 'CANCELLED');
    assert.equal(r.stages.get(revisionId).status, 'CANCELLED'); assert.equal(r.stages.get(active.children.FLYWHEEL!.taskId).status, 'SUCCEEDED');
    await r.close(); r = f.open(); f.block(false); r.app.resume(value.pipelineId, value.inputDigest);
    const done = await r.app.wait(value.pipelineId); assert.equal(done.status, 'SUCCEEDED', done.reasonCode ?? '');
    assert.equal(done.iterations![0]!.revision!.taskId, revisionId); assert.equal(r.stages.get(revisionId).usage.modelCalls, 2);
    assert.equal(done.iterations!.length, 2);
  } finally { await r.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test('starting after a card revision freezes new input while preserving generation and prior pipeline', async () => {
  const f = fixture(1), r = f.open();
  try {
    const first = await r.app.start('s'); assert.equal((await r.app.wait(first.pipelineId)).status, 'SUCCEEDED');
    f.select(['v2']);
    const second = await r.app.start('s'); assert.notEqual(second.pipelineId, first.pipelineId);
    assert.deepEqual(second.initialVersionIds, ['v2']);
    const done = await r.app.wait(second.pipelineId); assert.equal(done.status, 'SUCCEEDED', done.reasonCode ?? '');
    assert.equal(done.children.GENERATE!.taskId, first.children.GENERATE!.taskId);
    assert.deepEqual(done.children.INDEX!.input.cardVersionIds, ['v2']);
    assert.deepEqual(done.iterations![0]!.versionIds, ['v2']);
    assert.deepEqual(done.children.ASSOCIATE!.input.cardVersionIds, ['v2']);
    assert.deepEqual(r.app.get(first.pipelineId).iterations![0]!.versionIds, ['v1']);
    assert.equal((await r.app.start('s')).pipelineId, second.pipelineId);
  } finally { await r.close(); rmSync(f.directory, { recursive: true, force: true }); }
});
