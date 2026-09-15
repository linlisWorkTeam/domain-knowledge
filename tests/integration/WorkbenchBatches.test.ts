/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证可读批次编号、幂等创建与跨连接模块租约。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { batchExecution, batchSchedule } from '../../src/domain/workbench/WorkbenchBatch.ts';
import { SqliteWorkbenchBatches } from '../../src/infrastructure/sqlite/SqliteWorkbenchBatches.ts';

test('readable batch sequence survives restart and creation retries do not allocate extra batches', () => {
  const root = mkdtempSync(join(tmpdir(), 'batch-identities-'));
  let store = new SqliteWorkbenchBatches(join(root, 'batches.sqlite'));
  const input = { projectId: 'project-a', snapshotId: 'snapshot-a', moduleId: 'markdown-lite', schedule: { enabled: false, intervalMinutes: null } };
  try {
    const first = store.create(input, 'create-1', '2026-09-13T16:00:00.000Z');
    assert.equal(first.batchId, 'markdown-lite-20260914-1'); assert.equal(first.status, 'READY'); assert.equal(first.rounds.length, 0);
    assert.deepEqual(store.create(input, 'create-1', '2026-09-15T00:00:00.000Z'), first);
    assert.throws(() => store.create({ ...input, moduleId: 'other' }, 'create-1', first.createdAt), /IDEMPOTENCY_CONFLICT/);
    store.close(); store = new SqliteWorkbenchBatches(join(root, 'batches.sqlite'));
    assert.equal(store.create(input, 'create-2', '2026-09-14T15:59:59.000Z').batchId, 'markdown-lite-20260914-2');
    assert.equal(store.create(input, 'create-3', '2026-09-14T16:00:00.000Z').batchId, 'markdown-lite-20260915-1');
    assert.equal(store.list('project-a').length, 3);
    assert.throws(() => batchSchedule({ enabled: true, intervalMinutes: 0 }), /BATCH_SCHEDULE_INVALID/);
    assert.throws(() => batchSchedule({ enabled: false, intervalMinutes: 1 }), /BATCH_SCHEDULE_INVALID/);
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});

test('module leases serialize same-module batches across connections and permit different modules', () => {
  const root = mkdtempSync(join(tmpdir(), 'batch-module-leases-'));
  const path = join(root, 'batches.sqlite'), first = new SqliteWorkbenchBatches(path), second = new SqliteWorkbenchBatches(path);
  const now = '2026-09-14T01:00:00.000Z';
  const input = { projectId: 'project-a', snapshotId: 'snapshot-a', moduleId: 'parser', schedule: { enabled: true, intervalMinutes: 60 } };
  try {
    const a = first.create(input, 'a', now), b = second.create(input, 'b', now);
    const c = second.create({ ...input, moduleId: 'xml' }, 'c', now);
    const leaseA = first.claim(a.batchId, now)!; assert.ok(leaseA);
    assert.equal(second.claim(a.batchId, now), null); assert.equal(second.claim(b.batchId, now), null);
    assert.ok(second.claim(c.batchId, now));
    assert.throws(() => first.enqueue(a.batchId, now), /BATCH_ROUND_ACTIVE/);
    assert.throws(() => second.save(leaseA.batch, 'wrong-lease', false), /BATCH_LEASE_LOST/);
    assert.throws(() => first.save(leaseA.batch, leaseA.leaseId, true), /BATCH_ROUND_INVALID/);
    assert.throws(() => first.save({ ...leaseA.batch, moduleId: 'xml' }, leaseA.leaseId, false), /BATCH_INPUT_CHANGED/);
    leaseA.batch.status = 'SUCCEEDED'; leaseA.batch.rounds[0]!.status = 'SUCCEEDED'; leaseA.batch.rounds[0]!.completedAt = now;
    first.save(leaseA.batch, leaseA.leaseId, true);
    assert.ok(second.claim(b.batchId, now));
    const next = first.enqueue(a.batchId, now); assert.equal(next.rounds.length, 2);
    assert.equal(next.rounds[0]!.status, 'SUCCEEDED'); assert.notEqual(next.rounds[0]!.executionKey, next.rounds[1]!.executionKey);
    assert.equal(first.claim(a.batchId, now), null);
  } finally { first.close(); second.close(); rmSync(root, { recursive: true, force: true }); }
});

test('new round commands remain idempotent after the original round finishes', () => {
  const root = mkdtempSync(join(tmpdir(), 'batch-round-commands-')), store = new SqliteWorkbenchBatches(join(root, 'batches.sqlite'));
  const now = '2026-09-14T00:00:00.000Z';
  try {
    const batch = store.create({ projectId: 'p', snapshotId: 's', moduleId: 'parser', schedule: { enabled: false, intervalMinutes: null } }, 'create', now);
    store.enqueue(batch.batchId, now, 'round-command'); const lease = store.claim(batch.batchId, now)!;
    lease.batch.status = 'SUCCEEDED'; lease.batch.rounds[0]!.status = 'SUCCEEDED'; store.save(lease.batch, lease.leaseId, true);
    assert.equal(store.enqueue(batch.batchId, now, 'round-command').rounds.length, 1);
    assert.equal(store.enqueue(batch.batchId, now, 'another-round').rounds.length, 2);
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});


test('only a confirmed exited batch owner can be recovered and the same round identity is retained', () => {
  const root = mkdtempSync(join(tmpdir(), 'batch-owner-recovery-')), path = join(root, 'batches.sqlite'), store = new SqliteWorkbenchBatches(path);
  const now = '2026-09-14T00:00:00.000Z';
  try {
    const input = { projectId: 'p', snapshotId: 's', moduleId: 'parser', schedule: { enabled: true, intervalMinutes: 10 } };
    const dead = store.create(input, 'dead', now), live = store.create({ ...input, moduleId: 'live' }, 'live', now);
    const active = store.claim(live.batchId, now)!;
    execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { SqliteWorkbenchBatches } from './src/infrastructure/sqlite/SqliteWorkbenchBatches.ts';
      const store = new SqliteWorkbenchBatches(process.argv[1]); const lease = store.claim(process.argv[2], process.argv[3]);
      lease.batch.rounds[0].pipelineId = 'existing-pipeline'; store.save(lease.batch, lease.leaseId, false); store.close();
    `, path, dead.batchId, now], { cwd: process.cwd(), stdio: 'pipe' });
    store.recover(now);
    const recovered = store.get(dead.batchId)!;
    assert.equal(recovered.status, 'QUEUED'); assert.equal(recovered.rounds.length, 1);
    assert.equal(recovered.rounds[0]!.executionKey, dead.rounds[0]!.executionKey);
    assert.equal(recovered.rounds[0]!.pipelineId, 'existing-pipeline');
    assert.equal(store.get(live.batchId)!.status, 'RUNNING');
    assert.equal(store.claim(active.batch.batchId, now), null);
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});


test('resume retains the same round and control retries cannot cancel a resumed run', () => {
  const root = mkdtempSync(join(tmpdir(), 'batch-resume-controls-')), store = new SqliteWorkbenchBatches(join(root, 'batches.sqlite'));
  const now = '2026-09-14T00:00:00.000Z';
  try {
    const batch = store.create({ projectId: 'p', snapshotId: 's', moduleId: 'parser', schedule: { enabled: true, intervalMinutes: 60 } }, 'create', now);
    const lease = store.claim(batch.batchId, now)!; lease.batch.rounds[0]!.pipelineId = 'original-pipeline';
    lease.batch.status = 'PAUSED'; lease.batch.rounds[0]!.status = 'PAUSED'; store.save(lease.batch, lease.leaseId, true);
    store.cancel(batch.batchId, now, 'cancel-original');
    const resumed = store.resume(batch.batchId, now, 'resume-original');
    assert.equal(resumed.rounds.length, 1); assert.equal(resumed.rounds[0]!.pipelineId, 'original-pipeline');
    assert.equal(resumed.rounds[0]!.executionKey, batch.rounds[0]!.executionKey); assert.equal(resumed.rounds[0]!.resumeRequested, true);
    const active = store.claim(batch.batchId, now)!;
    assert.equal(store.cancel(batch.batchId, now, 'cancel-original').cancelRequested, false);
    assert.equal(store.resume(batch.batchId, now, 'resume-original').status, 'RUNNING');
    assert.equal(store.get(active.batch.batchId)!.rounds.length, 1);
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});


test('batch execution inputs survive restart, bind idempotency and cannot change during a round', () => {
  const root = mkdtempSync(join(tmpdir(), 'batch-inputs-')), path = join(root, 'batches.sqlite');
  let store = new SqliteWorkbenchBatches(path);
  const now = '2026-09-14T00:00:00.000Z';
  const execution = batchExecution({ schemaVersion: 'module-execution-v1', scope: { entryPath: 'parser.h', astFilter: 'Parser', symbols: ['parse'] }, materialIds: ['material-b', 'material-a'], fixedSuite: { schemaVersion: 'native-cases-v1', cases: [{ caseId: 'fixed' }] } })!;
  try {
    const input = { projectId: 'p', snapshotId: 's', moduleId: 'parser', schedule: { enabled: false, intervalMinutes: null }, execution };
    const batch = store.create(input, 'create', now);
    execution.materialIds.push('not-frozen');
    assert.deepEqual(store.get(batch.batchId)!.execution!.materialIds, ['material-a', 'material-b']);
    store.close(); store = new SqliteWorkbenchBatches(path);
    assert.equal(store.get(batch.batchId)!.execution!.fixedSuite!.cases[0]!.caseId, 'fixed');
    assert.throws(() => store.create(input, 'create', now), /IDEMPOTENCY_CONFLICT/);
    store.enqueue(batch.batchId, now); const lease = store.claim(batch.batchId, now)!;
    lease.batch.execution!.fixedSuite!.cases[0]!.caseId = 'changed';
    assert.throws(() => store.save(lease.batch, lease.leaseId, false), /BATCH_INPUT_CHANGED/);
    assert.throws(() => batchExecution({ schemaVersion: 'unknown' }), /BATCH_EXECUTION_INVALID/);
    assert.throws(() => batchExecution({ schemaVersion: 'module-execution-v1', scope: { entryPath: '../private' } }), /BATCH_EXECUTION_INVALID/);
    assert.throws(() => batchExecution({ schemaVersion: 'module-execution-v1', materialIds: ['a', 'a'] }), /BATCH_EXECUTION_INVALID/);
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});
