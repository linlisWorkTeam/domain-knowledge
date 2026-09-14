/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证删除事务回滚、磁盘回执重启恢复及并发清理幂等性。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BatchDeletions } from '../../src/application/services/BatchDeletions.ts';
import { SqliteBatchDeletions, type DeletionProjection } from '../../src/infrastructure/sqlite/SqliteBatchDeletions.ts';
import type { DeletionNode } from '../../src/domain/workbench/BatchDeletion.ts';
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'sqlite-deletion-')), filename = join(root, 'records.sqlite');
  const db = new DatabaseSync(filename); db.exec('PRAGMA journal_mode=WAL; CREATE TABLE items(id TEXT PRIMARY KEY, record TEXT NOT NULL)');
  const rows: DeletionNode[] = [{ id: 'batch', kind: 'batch', revision: '1', ownedBy: [], references: [] },
    { id: 'artifact', kind: 'artifact', revision: '1', ownedBy: ['batch'], references: [], bytes: 4 }];
  for (const row of rows) db.prepare('INSERT INTO items VALUES(?,?)').run(row.id, JSON.stringify(row));
  const projection: DeletionProjection = {
    inventory: database => database.prepare('SELECT record FROM items').all().map(row => JSON.parse(String(row.record)) as DeletionNode),
    remove: (database, plan) => { for (const id of plan.deleteIds) database.prepare('DELETE FROM items WHERE id=?').run(id); },
  };
  return { root, filename, db, projection };
}
test('record removal and deletion receipt roll back together on storage failure', async () => {
  const f = setup();
  try {
    const store = new SqliteBatchDeletions(f.db, f.projection, async () => { assert.fail('cleanup must not run after rollback'); });
    f.db.exec("CREATE TRIGGER reject_receipt BEFORE INSERT ON wb_deletion_receipts BEGIN SELECT RAISE(ABORT,'controlled storage failure'); END");
    const app = new BatchDeletions(store), plan = app.preview('batch');
    await assert.rejects(app.confirm('batch', { planId: plan.planId, confirmed: true }), /controlled storage failure/);
    assert.equal(f.projection.inventory(f.db).length, 2); assert.equal(store.receipt(plan.planId), null);
  } finally { f.db.close(); rmSync(f.root, { recursive: true, force: true }); }
});
test('reopening the database resumes pending file cleanup without deleting records again', async () => {
  const f = setup(); let db = f.db;
  try {
    const file = join(f.root, 'derived.txt'); writeFileSync(file, 'data');
    const first = new SqliteBatchDeletions(db, f.projection, async () => { throw new Error('sensitive detail must not be persisted'); });
    const app = new BatchDeletions(first), plan = app.preview('batch');
    const pending = await app.confirm('batch', { planId: plan.planId, confirmed: true });
    assert.equal(pending.status, 'CLEANUP_PENDING'); assert.equal(first.pending().length, 1);
    assert.equal(existsSync(file), true); assert.equal(f.projection.inventory(db).length, 0);
    assert.equal(db.prepare('SELECT last_error FROM wb_deletion_receipts').get()!.last_error, 'DELETION_CLEANUP_FAILED');
    db.close(); db = new DatabaseSync(f.filename);
    let cleanupCalls = 0, finish!: () => void;
    const resumed = new SqliteBatchDeletions(db, { ...f.projection, remove: () => assert.fail('records already removed') }, async () => {
      cleanupCalls++; await new Promise<void>(resolve => { finish = resolve; }); rmSync(file, { force: true });
    });
    const recoveredApp = new BatchDeletions(resumed);
    const a = recoveredApp.recover('batch', plan.planId), b = recoveredApp.confirm('batch', { planId: plan.planId, confirmed: true });
    finish(); const results = await Promise.all([a, b]);
    assert.equal(cleanupCalls, 1); assert.equal(existsSync(file), false);
    assert.ok(results.every(receipt => receipt.status === 'DELETED'));
    assert.equal(results[0]!.committedAt, pending.committedAt); assert.equal(resumed.pending().length, 0);
    assert.equal(db.prepare('SELECT cleanup_attempts FROM wb_deletion_receipts').get()!.cleanup_attempts, 2);
  } finally { db.close(); rmSync(f.root, { recursive: true, force: true }); }
});
