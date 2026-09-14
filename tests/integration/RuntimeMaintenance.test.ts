/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证真实HTTP入口在维护及持久恢复期间拒绝数据读写而保持状态可读。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createKnowledgeServer } from '../../src/interfaces/runner/Server.ts';
import { deletionRecoveryPending } from '../../src/infrastructure/sqlite/DeletionRecoveryPending.ts';

test('HTTP data routes are blocked during maintenance and work again after release', async () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), 'maintenance-http-'));
  const instance = createKnowledgeServer({ runtimeDir, anonymousAccess: true });
  instance.server.listen(0, '127.0.0.1'); await once(instance.server, 'listening');
  const address = instance.server.address(); assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  let finish!: () => void;
  const operation = instance.composition.apps.maintenance.enter();
  const maintenance = operation.exclusive(async () => { await new Promise<void>(resolve => { finish = resolve; }); });
  try {
    assert.equal((await fetch(base)).status, 200);
    assert.deepEqual(await (await fetch(`${base}/api/v1/maintenance`)).json(), { status: 'MAINTENANCE' });
    const blocked = await fetch(`${base}/api/v1/runs`); assert.equal(blocked.status, 503);
    assert.equal((await blocked.json()).error.code, 'RUNTIME_MAINTENANCE');
    assert.equal((await fetch(`${base}/api/v1/generations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 503);
    finish(); await maintenance; operation.release();
    assert.equal((await fetch(`${base}/api/v1/runs`)).status, 200);
  } finally {
    finish?.(); await maintenance; operation.release();
    await instance.composition.shutdown(); instance.server.closeAllConnections(); instance.server.close(); await once(instance.server, 'close');
    rmSync(runtimeDir, { recursive: true, force: true });
  }
});
test('a restart with pending deletion does not expose data or start queued batch work', async () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), 'maintenance-restart-'));
  const journal = new DatabaseSync(join(runtimeDir, 'deletion-recovery.sqlite'));
  journal.exec("CREATE TABLE deletion_recovery_intents(plan_id TEXT PRIMARY KEY,phase TEXT); INSERT INTO deletion_recovery_intents VALUES('old','PREPARED')"); journal.close();
  const instance = createKnowledgeServer({ runtimeDir, anonymousAccess: true });
  const batch = instance.composition.apps.workbenchBatches.store.create({ projectId: 'p', snapshotId: 's', moduleId: 'parser',
    schedule: { enabled: true, intervalMinutes: 60 } }, 'queued-before-recovery', '2026-09-14T00:00:00Z');
  instance.composition.apps.workbenchBatches.tick();
  instance.server.listen(0, '127.0.0.1'); await once(instance.server, 'listening');
  const address = instance.server.address(); assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    assert.equal((await fetch(base)).status, 200);
    assert.deepEqual(await (await fetch(`${base}/api/v1/maintenance`)).json(), { status: 'RECOVERY_REQUIRED' });
    const response = await fetch(`${base}/api/v1/runs`);
    assert.equal(response.status, 503); assert.equal((await response.json()).error.code, 'DELETION_RECOVERY_REQUIRED');
    assert.equal(instance.composition.apps.workbenchBatches.idle, true);
    assert.equal(instance.composition.apps.workbenchStages.idle, true);
    assert.equal(instance.composition.apps.workbenchBatches.store.get(batch.batchId)!.status, 'QUEUED');
  } finally {
    await instance.composition.shutdown(); instance.server.closeAllConnections(); instance.server.close(); await once(instance.server, 'close');
    rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test('an already connected activity stream pauses database polling during maintenance', async t => {
  const runtimeDir = mkdtempSync(join(tmpdir(), 'maintenance-stream-'));
  const instance = createKnowledgeServer({ runtimeDir, anonymousAccess: true });
  const reads = t.mock.method(instance.composition.apps.flywheel, 'listActivities');
  instance.server.listen(0, '127.0.0.1'); await once(instance.server, 'listening');
  const address = instance.server.address(); assert.ok(address && typeof address === 'object');
  const abort = new AbortController();
  const stream = await fetch(`http://127.0.0.1:${address.port}/api/v1/activity/stream`, { signal: abort.signal });
  assert.equal(stream.status, 200);
  const operation = instance.composition.apps.maintenance.enter(); let finish!: () => void;
  const maintenance = operation.exclusive(async () => { await new Promise<void>(resolve => { finish = resolve; }); });
  try {
    const before = reads.mock.callCount(); assert.ok(before > 0);
    await new Promise(resolve => setTimeout(resolve, 350));
    assert.equal(reads.mock.callCount(), before);
    finish(); await maintenance; operation.release();
    await new Promise(resolve => setTimeout(resolve, 350));
    assert.ok(reads.mock.callCount() > before);
  } finally {
    finish?.(); await maintenance; operation.release(); abort.abort();
    await instance.composition.shutdown(); instance.server.closeAllConnections(); instance.server.close(); await once(instance.server, 'close');
    rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test('a persisted execution outside the current task map still prevents exclusive maintenance', async () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), 'maintenance-lease-'));
  const instance = createKnowledgeServer({ runtimeDir, anonymousAccess: true });
  const database = new DatabaseSync(join(runtimeDir, 'workbench.sqlite'));
  const operation = instance.composition.apps.maintenance.enter();
  try {
    assert.equal(instance.composition.apps.workbenchStages.idle, true);
    database.exec(`INSERT INTO wb_stage_tasks(task_id,status,lease_id,snapshot) VALUES('external','RUNNING','other-owner','{}')`);
    await assert.rejects(operation.exclusive(async () => assert.fail('live persisted lease must block')), /RUNTIME_OPERATIONS_ACTIVE/);
    database.exec("UPDATE wb_stage_tasks SET status='UNKNOWN_FUTURE_STATE',lease_id=NULL");
    await assert.rejects(operation.exclusive(async () => assert.fail('unknown state must not be idle')), /RUNTIME_OPERATIONS_ACTIVE/);
    database.exec('DELETE FROM wb_stage_tasks');
    await operation.exclusive(async () => {});
  } finally {
    operation.release(); database.close(); await instance.composition.shutdown(); await instance.composition.close();
    rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test('missing recovery tables and unknown phases do not silently reopen the service', () => {
  const root = mkdtempSync(join(tmpdir(), 'maintenance-log-')), path = join(root, 'recovery.sqlite');
  assert.equal(deletionRecoveryPending(path), false);
  const database = new DatabaseSync(path);
  try {
    assert.equal(deletionRecoveryPending(path), true);
    database.exec("CREATE TABLE deletion_recovery_intents(phase TEXT); INSERT INTO deletion_recovery_intents VALUES(NULL)");
    assert.equal(deletionRecoveryPending(path), true);
    database.exec("UPDATE deletion_recovery_intents SET phase='FUTURE'");
    assert.equal(deletionRecoveryPending(path), true);
    database.exec("UPDATE deletion_recovery_intents SET phase='COMPLETE'");
    assert.equal(deletionRecoveryPending(path), false);
  } finally { database.close(); rmSync(root, { recursive: true, force: true }); }
});

test('composition uses raw workflow status under maintenance without rewriting the legacy business phase', async t => {
  const runtimeDir = mkdtempSync(join(tmpdir(), 'maintenance-run-status-'));
  const instance = createKnowledgeServer({ runtimeDir, anonymousAccess: true });
  const run = instance.composition.apps.flywheel.createRun('legacy-module', 'local-v1');
  instance.composition.apps.flywheel.transition(run.runId, 'PLANNED');
  instance.composition.apps.flywheel.transition(run.runId, 'GENERATING');
  const workflow = await instance.composition.apps.orchestrator.workflow();
  let executionStatus: 'FAILED' | 'RUNNING' | 'STOPPED' = 'FAILED';
  const status = t.mock.method(workflow.workflow, 'status', async (runId: string) => {
    assert.equal(instance.composition.apps.maintenance.status, 'MAINTENANCE');
    return { runId, executionStatus, currentNode: 'doc_gen', iteration: 0, maxIterations: 1, route: null, error: null };
  });
  const operation = instance.composition.apps.maintenance.enter();
  try {
    await operation.exclusive(async () => {});
    assert.equal(status.mock.callCount(), 1);
    executionStatus = 'RUNNING';
    await assert.rejects(operation.exclusive(async () => assert.fail('running')), /RUNTIME_OPERATIONS_ACTIVE/);
    executionStatus = 'STOPPED';
    await operation.exclusive(async () => {});
    assert.equal(instance.composition.apps.flywheel.getRun(run.runId)!.state, 'GENERATING');
  } finally {
    operation.release(); await instance.composition.shutdown(); await instance.composition.close();
    rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test('composition peers share normal access but prevent maintenance until the peer closes', async () => {
  const { createComposition } = await import('../../src/interfaces/runner/Composition.ts');
  const runtimeDir = mkdtempSync(join(tmpdir(), 'maintenance-peers-'));
  const first = createComposition({ runtimeDir }), second = createComposition({ runtimeDir });
  const operation = first.apps.maintenance.enter();
  let secondClosed = false;
  try {
    await assert.rejects(operation.exclusive(async () => assert.fail('peer still owns runtime')), /RUNTIME_OTHER_WRITERS/);
    assert.equal(first.apps.maintenance.available, true);
    await second.shutdown(); await second.close(); secondClosed = true;
    assert.equal(await operation.exclusive(async () => {
      assert.throws(() => createComposition({ runtimeDir }), /RUNTIME_MAINTENANCE/);
      return 'exclusive';
    }), 'exclusive');
  } finally {
    operation.release();
    if (!secondClosed) { await second.shutdown(); await second.close(); }
    await first.shutdown(); await first.close(); rmSync(runtimeDir, { recursive: true, force: true });
  }
});
