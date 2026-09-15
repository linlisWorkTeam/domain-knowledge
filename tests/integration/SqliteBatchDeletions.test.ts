/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证统一删除应用的互斥、提交失败、持久文件恢复及并发重试。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BatchDeletions } from '../../src/application/services/BatchDeletions.ts';
import { RuntimeMaintenance } from '../../src/application/services/RuntimeMaintenance.ts';
import { SqliteBatchDeletions } from '../../src/infrastructure/sqlite/SqliteBatchDeletions.ts';
import { SqliteDeletionRecovery } from '../../src/infrastructure/sqlite/SqliteDeletionRecovery.ts';
import type { DeletionNode } from '../../src/domain/workbench/BatchDeletion.ts';
import type { BatchDeletionStore } from '../../src/application/ports/BatchDeletionPorts.ts';
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'unified-deletion-')), filename = join(root, 'records.sqlite'), journalFile = join(root, 'journal.sqlite');
  let db = new DatabaseSync(filename), journal = new DatabaseSync(journalFile);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE items(id TEXT PRIMARY KEY, record TEXT NOT NULL)');
  const nodes: DeletionNode[] = [{ id: 'batch', kind: 'batch', revision: '1', ownedBy: [], references: [] },
    { id: 'files/artifact', kind: 'artifact', revision: '1', ownedBy: ['batch'], references: [], bytes: 4 }];
  for (const node of nodes) db.prepare('INSERT INTO items VALUES(?,?)').run(node.id, JSON.stringify(node));
  const path = join(root, 'derived.txt'); writeFileSync(path, 'data');
  let failCleanup = false, removals = 0, cleanups = 0, captures = 0;
  const inventory = () => db.prepare('SELECT record FROM items').all().map(row => JSON.parse(String(row.record)) as DeletionNode);
  const open = () => {
    const recovery = new SqliteDeletionRecovery(journal, [{ name: 'records', contract: 'items-v1', database: db,
      capture: () => inventory(), remove: (_plan, witness) => { removals++; for (const node of witness as DeletionNode[]) db.prepare('DELETE FROM items WHERE id=?').run(node.id); } }],
      [{ name: 'files', contract: 'test-file-v1', scope: root, capture: () => { captures++; return { file: 'derived.txt' }; },
        clean: (_plan, witness) => { cleanups++; assert.deepEqual(witness, { file: 'derived.txt' });
          if (failCleanup) throw new Error('sensitive detail must not be persisted'); rmSync(path, { force: true }); } }]);
    const maintenance = new RuntimeMaintenance({ needsRecovery: () => recovery.pending().length > 0, idle: () => true });
    let tail = Promise.resolve();
    const exclusive: BatchDeletionStore['exclusive'] = (work, resume) => {
      const operation = tail.then(async () => {
        if (resume) return maintenance.recover(work);
        const request = maintenance.enter();
        try { return await request.exclusive(work); } finally { request.release(); }
      });
      tail = operation.then(() => {}, () => {}); return operation;
    };
    const store = new SqliteBatchDeletions({ recovery, exclusive, inventory: async () => {
      assert.equal(maintenance.status, 'MAINTENANCE'); return inventory();
    } });
    return { store, app: new BatchDeletions(store), maintenance };
  };
  return { root, path, open, inventory, get db() { return db; }, get journal() { return journal; },
    fail: (value: boolean) => { failCleanup = value; }, counts: () => ({ removals, cleanups, captures }),
    reopen: () => { db.close(); journal.close(); db = new DatabaseSync(filename); journal = new DatabaseSync(journalFile); },
    close: () => { db.close(); journal.close(); rmSync(root, { recursive: true, force: true }); } };
}
test('intent persistence failure leaves records and files untouched', async () => {
  const f = setup();
  try {
    const { store, app } = f.open(), plan = await app.preview('batch');
    f.journal.exec("CREATE TRIGGER reject_intent BEFORE INSERT ON deletion_recovery_intents BEGIN SELECT RAISE(ABORT,'controlled storage failure'); END");
    await assert.rejects(app.confirm('batch', { planId: plan.planId, confirmed: true }), /controlled storage failure/);
    assert.equal(f.inventory().length, 2); assert.equal(store.receipt(plan.planId), null);
    assert.equal(f.counts().removals, 0); assert.equal(f.counts().cleanups, 0); assert.equal(existsSync(f.path), true);
  } finally { f.close(); }
});
test('reopening resumes files under the same intent and concurrent recovery never repeats record removal', async () => {
  const f = setup();
  try {
    const first = f.open(), plan = await first.app.preview('batch'); f.fail(true);
    const pending = await first.app.confirm('batch', { planId: plan.planId, confirmed: true });
    assert.equal(pending.status, 'CLEANUP_PENDING'); assert.equal(first.store.pending().length, 1);
    assert.equal(existsSync(f.path), true); assert.equal(f.inventory().length, 0);
    assert.equal(first.maintenance.status, 'RECOVERY_REQUIRED');
    assert.doesNotMatch(JSON.stringify(pending), /sensitive detail/);
    assert.doesNotMatch(JSON.stringify(f.journal.prepare('SELECT * FROM deletion_recovery_intents').all()), /sensitive detail/);
    f.reopen(); f.fail(false); const resumed = f.open();
    const results = await Promise.all([resumed.app.recover('batch', plan.planId), resumed.app.confirm('batch', { planId: plan.planId, confirmed: true })]);
    assert.ok(results.every(receipt => receipt.status === 'DELETED')); assert.equal(existsSync(f.path), false);
    assert.equal(results[0]!.committedAt, pending.committedAt); assert.equal(results[0]!.preparedAt, pending.preparedAt);
    assert.ok(results[0]!.completedAt); assert.deepEqual(f.counts(), { removals: 1, cleanups: 2, captures: 1 });
    assert.equal(resumed.store.pending().length, 0); assert.equal(resumed.maintenance.status, 'AVAILABLE');
  } finally { f.close(); }
});
test('participant transaction rollback leaves an explicit records-pending intent and no file cleanup', async () => {
  const f = setup();
  try {
    const { app, maintenance } = f.open(), plan = await app.preview('batch');
    f.db.exec("CREATE TRIGGER reject_receipt BEFORE INSERT ON deletion_participant_receipts BEGIN SELECT RAISE(ABORT,'controlled receipt failure'); END");
    const pending = await app.confirm('batch', { planId: plan.planId, confirmed: true });
    assert.equal(pending.status, 'RECORDS_PENDING'); assert.equal(pending.committedAt, null);
    assert.equal(f.inventory().length, 2); assert.equal(f.counts().cleanups, 0); assert.equal(existsSync(f.path), true);
    assert.equal(maintenance.status, 'RECOVERY_REQUIRED');
    f.db.exec('DROP TRIGGER reject_receipt');
    assert.equal((await app.recover('batch', plan.planId)).status, 'DELETED');
  } finally { f.close(); }
});
