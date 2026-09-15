/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证文件见证持久化、清理失败重启恢复和存储范围变更拒绝。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdtempSync, rmSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { planBatchDeletion, type DeletionNode } from '../../src/domain/workbench/BatchDeletion.ts';
import { SqliteDeletionRecovery } from '../../src/infrastructure/sqlite/SqliteDeletionRecovery.ts';
import { LocalCasArtifactStore } from '../../src/infrastructure/sqlite/SqliteCas.ts';
import { CasDeletionFiles } from '../../src/infrastructure/sqlite/CasDeletionFiles.ts';

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'file-recovery-')), casRoot = join(root, 'cas');
  const store = new LocalCasArtifactStore(casRoot), ref = await store.put(Buffer.from('derived result'), 'text/plain');
  const filePath = join(casRoot, 'sha256', ref.sha256.slice(0, 2), ref.sha256);
  let db = new DatabaseSync(join(root, 'registry.sqlite')), journal = new DatabaseSync(join(root, 'journal.sqlite'));
  db.exec('CREATE TABLE results(id TEXT PRIMARY KEY); INSERT INTO results VALUES(\'result\'); CREATE TABLE usage(total INTEGER); INSERT INTO usage VALUES(17)');
  const nodes: DeletionNode[] = [{ id: 'run', kind: 'run', revision: '1', ownedBy: [], references: [] },
    { id: `cas/${ref.artifactId}`, kind: 'artifact', revision: ref.sha256, ownedBy: ['run'], references: [], bytes: ref.size }];
  const plan = planBatchDeletion('run', nodes);
  let captures = 0, removals = 0, cleanups = 0, failAfterCleanup = false;
  const coordinator = (scope?: string, withFiles = true) => {
    const files = new CasDeletionFiles(casRoot);
    return new SqliteDeletionRecovery(journal, [{ name: 'registry', contract: 'test-results-v1', database: db,
      capture: () => ({ id: 'result' }), remove: () => { removals++; db.exec('DELETE FROM results'); } }], withFiles ? [{
      name: 'cas', contract: files.contract, scope: scope ?? files.scope,
      capture: value => { captures++; return files.capture(value, nodes); },
      clean: (value, witness) => { cleanups++; files.clean(value, witness); if (failAfterCleanup) throw new Error('CONTROLLED_ACK_LOSS'); },
    }] : []);
  };
  const closeHandles = () => { db.close(); journal.close(); };
  return { root, casRoot, filePath, plan, nodes, coordinator,
    get db() { return db; }, counts: () => ({ captures, removals, cleanups }),
    failFiles: (fail: boolean) => { failAfterCleanup = fail; },
    reopen: () => { closeHandles(); db = new DatabaseSync(join(root, 'registry.sqlite')); journal = new DatabaseSync(join(root, 'journal.sqlite')); },
    close: () => { closeHandles(); rmSync(root, { recursive: true, force: true }); } };
}
test('persistent recovery freezes file witness once and resumes after cleanup acknowledgement is lost', async () => {
  const f = await fixture();
  try {
    const first = f.coordinator(); first.prepare(f.plan);
    assert.throws(() => first.completeAfterFiles(f.plan.planId), /DELETION_RECORDS_NOT_COMMITTED/);
    assert.equal(existsSync(f.filePath), true);
    first.applyRecords(f.plan.planId); f.failFiles(true);
    assert.throws(() => first.completeAfterFiles(f.plan.planId), /CONTROLLED_ACK_LOSS/);
    assert.equal(existsSync(f.filePath), false);
    assert.equal(first.pending()[0]!.phase, 'RECORDS_COMMITTED');
    f.reopen(); f.failFiles(false);
    const resumed = f.coordinator();
    resumed.prepare(f.plan); resumed.completeAfterFiles(f.plan.planId); resumed.completeAfterFiles(f.plan.planId);
    assert.deepEqual(f.counts(), { captures: 1, removals: 1, cleanups: 2 });
    assert.equal(resumed.get(f.plan.planId)!.phase, 'COMPLETE');
    assert.equal(f.db.prepare('SELECT total FROM usage').get()!.total, 17);
  } finally { f.close(); }
});
test('missing file participant and changed file scope are refused before database mutation', async () => {
  const f = await fixture();
  try {
    assert.throws(() => f.coordinator(undefined, false).prepare(f.plan), /DELETION_PARTICIPANT_MISSING/);
    f.coordinator().prepare(f.plan);
    const changed = f.coordinator('another-cas-directory');
    assert.throws(() => changed.applyRecords(f.plan.planId), /DELETION_RECOVERY_CONTRACT_CHANGED/);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM results').get()!.n, 1);
    assert.equal(existsSync(f.filePath), true);
  } finally { f.close(); }
});
test('replacing the CAS directory invalidates both a live cleaner and persisted recovery scope', async () => {
  const f = await fixture();
  try {
    const cleaner = new CasDeletionFiles(f.casRoot), witness = cleaner.capture(f.plan, f.nodes);
    f.coordinator().prepare(f.plan);
    renameSync(f.casRoot, join(f.root, 'preserved-cas')); mkdirSync(f.casRoot);
    assert.throws(() => cleaner.clean(f.plan, witness), /DELETION_FILE_SCOPE_CHANGED/);
    assert.throws(() => f.coordinator().applyRecords(f.plan.planId), /DELETION_RECOVERY_CONTRACT_CHANGED/);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM results').get()!.n, 1);
  } finally { f.close(); }
});
