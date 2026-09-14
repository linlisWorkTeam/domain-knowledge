/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证跨库删除的部分提交、进度丢失和重启恢复，不把多库提交当作原子事务。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { planBatchDeletion } from '../../src/domain/workbench/BatchDeletion.ts';
import { SqliteDeletionRecovery } from '../../src/infrastructure/sqlite/SqliteDeletionRecovery.ts';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'deletion-recovery-'));
  const open = () => ['journal', 'registry', 'workbench'].map(name => new DatabaseSync(join(root, `${name}.sqlite`)));
  let [journal, registry, workbench] = open() as [DatabaseSync, DatabaseSync, DatabaseSync];
  for (const db of [registry, workbench]) db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE result(id TEXT PRIMARY KEY,value TEXT); INSERT INTO result VALUES('old','derived');
    CREATE TABLE budget(used INTEGER,removals INTEGER); INSERT INTO budget VALUES(17,0)`);
  const plan = planBatchDeletion('batch', [{ id: 'batch', kind: 'batch', revision: '1', ownedBy: [], references: [] }]);
  let failSecond = true;
  const coordinator = (contract = 'v1') => new SqliteDeletionRecovery(journal, [
    { name: 'registry', contract, database: registry, capture: () => ({ id: 'old' }), remove: () => {
      registry.exec("DELETE FROM result WHERE id='old'; UPDATE budget SET removals=removals+1");
    } },
    { name: 'workbench', contract, database: workbench, capture: () => ({ id: 'old' }), remove: () => {
      workbench.exec("DELETE FROM result WHERE id='old'; UPDATE budget SET removals=removals+1");
      if (failSecond) throw new Error('controlled second database failure');
    } },
  ]);
  const close = () => { journal.close(); registry.close(); workbench.close(); };
  return { plan, coordinator, get journal() { return journal; }, get registry() { return registry; }, get workbench() { return workbench; },
    allowSecond: () => { failSecond = false; },
    reopen: () => { close(); [journal, registry, workbench] = open() as [DatabaseSync, DatabaseSync, DatabaseSync]; },
    finish: () => { close(); rmSync(root, { recursive: true, force: true }); } };
}

test('a second-database failure leaves durable recovery and reopening skips the first committed participant', () => {
  const f = fixture();
  try {
    const first = f.coordinator(); first.prepare(f.plan);
    assert.throws(() => first.completeAfterFiles(f.plan.planId), /DELETION_RECORDS_NOT_COMMITTED/);
    assert.throws(() => first.applyRecords(f.plan.planId), /controlled second database failure/);
    assert.equal(f.registry.prepare('SELECT COUNT(*) AS n FROM result').get()!.n, 0);
    assert.equal(f.workbench.prepare('SELECT COUNT(*) AS n FROM result').get()!.n, 1);
    assert.throws(() => first.assertAvailable(), /DELETION_RECOVERY_REQUIRED/);
    f.reopen(); f.allowSecond(); const resumed = f.coordinator();
    assert.equal(resumed.pending().length, 1);
    assert.equal(resumed.applyRecords(f.plan.planId).phase, 'RECORDS_COMMITTED');
    for (const db of [f.registry, f.workbench]) {
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM result').get()!.n, 0);
      assert.deepEqual({ ...db.prepare('SELECT * FROM budget').get() }, { used: 17, removals: 1 });
    }
    // 记录完成并不代表文件已清理；未确认文件完成时恢复屏障仍在。
    assert.throws(() => resumed.assertAvailable(), /DELETION_RECOVERY_REQUIRED/);
    resumed.completeAfterFiles(f.plan.planId); resumed.assertAvailable();
    assert.equal(resumed.applyRecords(f.plan.planId).phase, 'COMPLETE');
  } finally { f.finish(); }
});

test('losing the central acknowledgement does not repeat committed database mutations', () => {
  const f = fixture();
  try {
    f.allowSecond(); const first = f.coordinator(); first.prepare(f.plan);
    f.journal.exec("CREATE TRIGGER reject_progress BEFORE UPDATE ON deletion_recovery_intents BEGIN SELECT RAISE(ABORT,'lost progress'); END");
    assert.throws(() => first.applyRecords(f.plan.planId), /lost progress/);
    assert.equal(first.get(f.plan.planId)!.phase, 'PREPARED');
    f.reopen(); f.journal.exec('DROP TRIGGER reject_progress');
    const resumed = f.coordinator(); resumed.applyRecords(f.plan.planId);
    for (const db of [f.registry, f.workbench]) assert.equal(db.prepare('SELECT removals FROM budget').get()!.removals, 1);
    f.registry.exec('DELETE FROM deletion_participant_receipts');
    assert.throws(() => resumed.completeAfterFiles(f.plan.planId), /DELETION_RECOVERY_RECEIPT_MISSING/);
    assert.equal(f.registry.prepare('SELECT removals FROM budget').get()!.removals, 1);
  } finally { f.finish(); }
});

test('pending deletion blocks another intent and does not resume under a changed projection contract', () => {
  const f = fixture();
  try {
    const first = f.coordinator(); first.prepare(f.plan);
    const other = planBatchDeletion('other', [{ id: 'other', kind: 'batch', revision: '1', ownedBy: [], references: [] }]);
    assert.throws(() => first.prepare(other), /DELETION_RECOVERY_REQUIRED/);
    f.reopen(); const changed = f.coordinator('v2');
    assert.throws(() => changed.applyRecords(f.plan.planId), /DELETION_RECOVERY_CONTRACT_CHANGED/);
    assert.throws(() => changed.prepare(f.plan), /DELETION_RECOVERY_CONTRACT_CHANGED/);
    assert.equal(f.registry.prepare('SELECT COUNT(*) AS n FROM result').get()!.n, 1);
  } finally { f.finish(); }
});
