/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证来源修订的一键多轮、无进展暂停和取消后持久化恢复。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkbenchPipelines } from '../../src/application/services/WorkbenchPipelines.ts';
import { WorkbenchStages } from '../../src/application/services/WorkbenchStages.ts';
import { SqliteStageTasks } from '../../src/infrastructure/sqlite/SqliteStageTasks.ts';
import { SqliteWorkbenchPipelines } from '../../src/infrastructure/sqlite/SqliteWorkbenchPipelines.ts';
import { SOURCE_REVISION_CONTRACT } from '../../src/domain/services/knowledge/SourceRevision.ts';
import type { StageInput, StageResult, WorkbenchStage } from '../../src/domain/services/workbench/StageTask.ts';
import { sourceInput, sourceResult } from '../helpers/WorkbenchSourceFixture.ts';
function fixture(target: number, stagnant = false, unknown = false) {
  const directory = mkdtempSync(join(tmpdir(), 'source-pipeline-')), db = join(directory, 'state.sqlite');
  let blocked = false, started = false;
  const input = (stage: WorkbenchStage, versions = ['v1']): StageInput => ({ stage, projectId: 'p', sourceRevision: 'r', sourceDigest: 's', configurationDigest: 'c', cardVersionIds: versions, parameters: { snapshotId: 'snapshot' } });
  const open = () => {
    const store = new SqliteWorkbenchPipelines(db), stageStore = new SqliteStageTasks(db);
    const stages = new WorkbenchStages(stageStore, {
      GENERATE: async context => { context.account('call', { modelCalls: 1 }); return { artifactRefs: [], summary: { cards: [{ versionId: 'v1' }] } }; },
      INDEX: async context => { context.account('call', { modelCalls: 1 }); return { artifactRefs: [], summary: { failed: 0 } }; },
      FLYWHEEL: async (context): Promise<StageResult> => {
        context.account('call', { modelCalls: 1 }); const n = Number(context.task.input.cardVersionIds[0]!.slice(1));
        if (context.task.input.parameters.operation === 'KNOWLEDGE_SOURCE_REVISION') {
          started = true;
          if (blocked) await new Promise((_, reject) => context.signal.addEventListener('abort', () => reject(context.signal.reason), { once: true }));
          return { artifactRefs: [], summary: { outcome: 'REVISED_INDEXED', versionIds: [`v${n + 1}`], cards: [{ cardId: 'card-0', baseVersionId: `v${n}`, versionId: `v${n + 1}`, heading: stagnant ? 'Same heading' : `Heading ${n}`, quality: 'ACCEPTED', outcome: 'REVISED' }] } };
        }
        return { artifactRefs: [], summary: { modules: [{ interfaceComparison: { compatible: true } }] } };
      },
      EVALUATE: async context => {
        context.account('call', { modelCalls: 1 });
        if (context.task.input.parameters.operation === 'KNOWLEDGE_SOURCE_VERIFICATION') return sourceResult(context.task.input, unknown ? 'UNRESOLVED' : Number(context.task.input.cardVersionIds[0]!.slice(1)) >= target ? 'SOURCE_MATCHED' : 'SOURCE_MISMATCH');
        return { artifactRefs: [], summary: { completedModules: 1, requestedModules: 1, modules: [{ status: 'BEHAVIOR_PASSED', interfaceCompatible: true }] } };
      },
      ASSOCIATE: async context => { context.account('call', { modelCalls: 1 }); return { artifactRefs: [], summary: { relations: 0 } }; },
    });
    const app = new WorkbenchPipelines({ store, stages, environment: async () => 'fixed', materials: { get: () => null },
      generation: { prepare: async () => input('GENERATE') }, index: { prepare: versions => input('INDEX', versions) },
      reconstruction: { prepare: async (_snapshot, versions, options) => { assert.equal(options?.retryEvaluationTaskId, undefined, 'source correction cannot fabricate a behavioral retry'); return input('FLYWHEEL', versions); } },
      evaluation: { prepare: async id => input('EVALUATE', stages.get(id).input.cardVersionIds), progress: async () => ({ passed: 1, total: 1, failed: [] }) },
      sourceVerification: { prepare: async id => sourceInput(stages.get(id)) },
      sourceRevision: { prepare: async id => ({ ...input('FLYWHEEL', stages.get(id).input.cardVersionIds), parameters: { operation: 'KNOWLEDGE_SOURCE_REVISION', revisionContract: SOURCE_REVISION_CONTRACT, sourceVerificationTaskId: id } }) },
      associations: { prepare: versions => input('ASSOCIATE', versions) },
    });
    return { app, stages, close: async () => { await app.shutdown(); await stages.shutdown(); store.close(); stageStore.close(); } };
  };
  return { open, directory, block: (value: boolean) => { blocked = value; }, started: () => started };
}
test('source repair can progress through six rounds after behavior already passes', async () => {
  const f = fixture(6), r = f.open();
  try {
    const first = await r.app.start('snapshot'), done = await r.app.wait(first.pipelineId);
    assert.equal(done.status, 'SUCCEEDED', done.reasonCode ?? ''); assert.equal(done.iterations!.length, 6);
    assert.ok(done.iterations!.every(round => round.progress!.failed.length === 0 && round.sourceVerification));
    assert.equal(done.iterations!.filter(round => round.sourceRepairs).length, 5);
    assert.deepEqual(done.children.ASSOCIATE!.input.cardVersionIds, ['v6']);
    assert.equal(r.app.detail(first.pipelineId).tasks.length, 26); assert.equal(r.app.detail(first.pipelineId).usage.modelCalls, 26);
    assert.equal((await r.app.start('snapshot')).pipelineId, first.pipelineId);
  } finally { await r.close(); rmSync(f.directory, { recursive: true, force: true }); }
});
test('rewriting the same source problem cannot manufacture progress or reset consumed calls', async () => {
  const f = fixture(99, true), r = f.open();
  try {
    const first = await r.app.start('snapshot'), stopped = await r.app.wait(first.pipelineId);
    assert.equal(stopped.reasonCode, 'PIPELINE_NO_SOURCE_PROGRESS'); assert.equal(stopped.iterations!.length, 5);
    assert.equal(stopped.children.ASSOCIATE, undefined); const usage = r.app.detail(first.pipelineId).usage;
    r.app.resume(first.pipelineId, first.inputDigest); assert.equal((await r.app.wait(first.pipelineId)).reasonCode, 'PIPELINE_NO_SOURCE_PROGRESS');
    assert.deepEqual(r.app.detail(first.pipelineId).usage, usage);
  } finally { await r.close(); rmSync(f.directory, { recursive: true, force: true }); }
});
test('cancelling source repair and restarting preserves the source check and resumes the same child', async () => {
  const f = fixture(2); let r = f.open(); f.block(true);
  try {
    const first = await r.app.start('snapshot'); while (!f.started()) await new Promise(resolve => setTimeout(resolve, 10));
    const round = r.app.get(first.pipelineId).iterations![0]!; const child = round.revision!.taskId;
    assert.equal(r.app.get(first.pipelineId).activeTaskId, child);
    r.app.cancel(first.pipelineId); assert.equal((await r.app.wait(first.pipelineId)).status, 'CANCELLED');
    await r.close(); r = f.open(); f.block(false); r.app.resume(first.pipelineId, first.inputDigest);
    const done = await r.app.wait(first.pipelineId); assert.equal(done.status, 'SUCCEEDED', done.reasonCode ?? '');
    assert.equal(done.iterations![0]!.revision!.taskId, child); assert.equal(r.stages.get(child).usage.modelCalls, 2);
    assert.equal(r.stages.get(round.sourceVerification!.taskId).usage.modelCalls, 1);
  } finally { await r.close(); rmSync(f.directory, { recursive: true, force: true }); }
});
test('unknown source evidence and a missing source executor both prevent association', async () => {
  for (const missing of [false, true]) {
    const f = fixture(1, false, true), r = f.open();
    try {
      if (missing) delete r.app.dependencies.sourceVerification;
      const first = await r.app.start('snapshot'), done = await r.app.wait(first.pipelineId);
      assert.equal(done.reasonCode, missing ? 'PIPELINE_SOURCE_VERIFICATION_REQUIRED' : 'PIPELINE_SOURCE_UNRESOLVED');
      assert.equal(done.children.ASSOCIATE, undefined);
    } finally { await r.close(); rmSync(f.directory, { recursive: true, force: true }); }
  }
});
