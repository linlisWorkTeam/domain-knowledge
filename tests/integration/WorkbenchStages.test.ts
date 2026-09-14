/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证阶段任务跨进程恢复、幂等提交、累计用量和取消串行槽。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { WorkbenchStages } from '../../src/application/services/WorkbenchStages.ts';
import { SqliteStageTasks } from '../../src/infrastructure/sqlite/SqliteStageTasks.ts';
import { createStageTask, type StageInput, type StageResult } from '../../src/domain/workbench/StageTask.ts';

const input: StageInput = { projectId: 'repository-a', stage: 'GENERATE', sourceRevision: 'commit-1',
  sourceDigest: 'source-sha', cardVersionIds: [], configurationDigest: 'configuration-sha', parameters: {} };
const result: StageResult = { artifactRefs: [], summary: { cards: 2 } };
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>((done) => { resolve = done; }); return { promise, resolve }; };

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'workbench-stages-'));
  const filename = join(directory, 'stages.sqlite');
  return { directory, filename, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}

test('stage retries retain completed cards, attempts and cumulative usage; successful startup is read-only reuse', async () => {
  const env = fixture(); const store = new SqliteStageTasks(env.filename);
  let fail = true; let generated = 0;
  const app = new WorkbenchStages(store, { GENERATE: async (context) => {
    await context.step('first-card', async (key) => {
      assert.match(key, /:first-card$/); generated += 1;
      context.account('model-card-one', { modelCalls: 1, reservedTokens: 64 });
      context.account('model-card-one', { modelCalls: 1, reservedTokens: 64 });
      context.account('model-card-one-result', { tokens: 25 });
      return result;
    });
    if (fail) throw new Error('MODEL_TEMPORARY_FAILURE');
    return result;
  } });
  try {
    const task = app.start(input, { modelCalls: 2 });
    input.parameters.changedLater = true;
    assert.deepEqual(task.input.parameters, {});
    delete input.parameters.changedLater;
    const first = await app.wait(task.taskId, AbortSignal.timeout(5000));
    assert.equal(first.status, 'FAILED'); assert.equal(first.usage.modelCalls, 1);
    assert.equal(first.usage.reservedTokens, 64); assert.equal(first.usage.tokens, 25);
    assert.throws(() => app.resume(task.taskId, 'changed-digest'), /STAGE_INPUT_CHANGED/);
    fail = false; app.resume(task.taskId, task.inputDigest);
    const resumed = await app.wait(task.taskId, AbortSignal.timeout(5000));
    assert.equal(resumed.status, 'SUCCEEDED'); assert.equal(resumed.attempt, 2);
    assert.equal(resumed.usage.modelCalls, 1); assert.ok(resumed.usage.elapsedMs >= first.usage.elapsedMs);
    assert.equal(generated, 1); assert.equal(app.start(input, { modelCalls: 2 }).attempt, 2);
    assert.equal(store.checkpoints(task.taskId).length, 1);
    assert.ok(store.events(task.taskId).some((event) => event.kind === 'RESUMED'));
  } finally { await app.shutdown(); store.close(); env.cleanup(); }
});

test('cross-instance cancellation retains the execution slot until the handler and its cleanup have exited', async () => {
  const env = fixture(); const one = new SqliteStageTasks(env.filename); const two = new SqliteStageTasks(env.filename);
  const started = deferred(); const cancelling = deferred(); const cleanup = deferred(); let secondStarted = false;
  const app1 = new WorkbenchStages(one, { GENERATE: async ({ signal }) => {
    started.resolve();
    await new Promise<void>((done) => signal.addEventListener('abort', () => { cancelling.resolve(); done(); }, { once: true }));
    await cleanup.promise; return result;
  } });
  const app2 = new WorkbenchStages(two, { INDEX: async () => { secondStarted = true; return result; } });
  try {
    const first = app1.start(input); await started.promise;
    const next = app2.start({ ...input, stage: 'INDEX' });
    assert.equal(two.recoverOrphans(), 0, 'live execution owner must not be reclaimed');
    app2.cancel(first.taskId); await cancelling.promise;
    assert.equal(one.get(first.taskId)?.status, 'RUNNING'); assert.equal(secondStarted, false);
    cleanup.resolve();
    assert.equal((await app1.wait(first.taskId, AbortSignal.timeout(5000))).status, 'CANCELLED');
    assert.equal((await app2.wait(next.taskId, AbortSignal.timeout(5000))).status, 'SUCCEEDED');
    assert.equal(secondStarted, true);
  } finally { cleanup.resolve(); await app1.shutdown(); await app2.shutdown(); one.close(); two.close(); env.cleanup(); }
});

test('budget exhaustion pauses before another call and retries cannot reset the consumed budget', async () => {
  const env = fixture(); const store = new SqliteStageTasks(env.filename);
  let calls = 0;
  const app = new WorkbenchStages(store, { GENERATE: async (context) => {
    context.account('first', { modelCalls: 1, reservedTokens: 80 }); calls += 1;
    context.account('reported', { tokens: 10 });
    context.account('second', { modelCalls: 1, reservedTokens: 80 }); calls += 1;
    return result;
  } });
  try {
    const task = app.start(input, { modelCalls: 1, reservedTokens: 100 });
    const final = await app.wait(task.taskId, AbortSignal.timeout(5000));
    assert.equal(final.status, 'PAUSED'); assert.equal(final.reasonCode, 'STAGE_BUDGET_EXHAUSTED');
    assert.equal(calls, 1); assert.equal(final.usage.tokens, 10);
    assert.throws(() => app.resume(task.taskId, task.inputDigest), /STAGE_BUDGET_EXHAUSTED/);
    assert.equal(app.start(input, { modelCalls: 1, reservedTokens: 100 }).usage.modelCalls, 1);
  } finally { await app.shutdown(); store.close(); env.cleanup(); }
});

test('actual owner exit recovers to paused, preserving checkpoint and usage across database reopen', () => {
  const env = fixture();
  const stageModule = resolve('src/domain/workbench/StageTask.ts');
  const storeModule = resolve('src/infrastructure/sqlite/SqliteStageTasks.ts');
  const script = `import { createStageTask } from ${JSON.stringify(stageModule)};
    import { SqliteStageTasks } from ${JSON.stringify(storeModule)};
    const store = new SqliteStageTasks(process.argv[1]);
    const task = store.insert(createStageTask(${JSON.stringify(input)}, {}, new Date().toISOString()));
    const { leaseId } = store.claim(task.taskId);
    store.addUsage(task.taskId, leaseId, 'call-1', { modelCalls: 1, reservedTokens: 80 });
    store.checkpoint(task.taskId, leaseId, 'card-one', ${JSON.stringify(result)});
    process.stdout.write(task.taskId); store.close();`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script, env.filename], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  const store = new SqliteStageTasks(env.filename);
  try {
    const taskId = child.stdout.trim();
    assert.equal(store.get(taskId)?.status, 'RUNNING'); assert.equal(store.recoverOrphans(), 1);
    const task = store.get(taskId)!;
    assert.equal(task.status, 'PAUSED'); assert.equal(task.reasonCode, 'STAGE_PROCESS_EXITED');
    assert.equal(task.usage.modelCalls, 1); assert.equal(store.checkpoints(taskId).length, 1);
    store.resume(taskId, task.inputDigest); const lease = store.claim(taskId)!;
    assert.equal(lease.task.attempt, 2);
    store.finish(taskId, lease.leaseId, 'SUCCEEDED', result, null);
    assert.throws(() => store.checkpoint(taskId, lease.leaseId, 'late-write', result), /STAGE_LEASE_LOST/);
  } finally { store.close(); env.cleanup(); }
});

test('old execution contracts are readable but cannot claim or resume', () => {
  const env = fixture(); const store = new SqliteStageTasks(env.filename);
  try {
    const task = createStageTask(input, {}, new Date().toISOString());
    task.contractVersion = 'knowledge-workbench-v0'; task.status = 'RUNNING'; store.insert(task);
    assert.equal(store.get(task.taskId)?.contractVersion, 'knowledge-workbench-v0');
    store.recoverOrphans();
    assert.equal(store.get(task.taskId)?.status, 'RUNNING', 'legacy execution facts remain read-only');
    const next = store.insert(createStageTask({ ...input, projectId: 'another' }, {}, new Date().toISOString()));
    const lease = store.claim(next.taskId)!;
    assert.ok(lease);
    store.finish(next.taskId, lease.leaseId, 'SUCCEEDED', result, null);
    assert.throws(() => store.resume(task.taskId, task.inputDigest), /STAGE_CONTRACT_INCOMPATIBLE/);
    assert.throws(() => store.claim(task.taskId), /STAGE_CONTRACT_INCOMPATIBLE/);
  } finally { store.close(); env.cleanup(); }
});
