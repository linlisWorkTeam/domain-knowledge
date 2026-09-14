/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证DSH临时home清理只删除链接本身并可中断恢复。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, lstatSync, rmSync, symlinkSync, unlinkSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256 } from '../../src/domain/Domain.ts';
import { DshHomeDeletionFiles } from '../../src/infrastructure/sqlite/DshHomeDeletionFiles.ts';
import { planBatchDeletion } from '../../src/domain/workbench/BatchDeletion.ts';
import type { DeletionRecordInventory } from '../../src/infrastructure/sqlite/SqliteDeletionInventory.ts';
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-home-deletion-')), homeRoot = join(root, 'homes'), source = join(root, 'source');
  mkdirSync(homeRoot); mkdirSync(source); writeFileSync(join(source, 'dependency.js'), 'keep dependency');
  const key = 'run:docgen:1', name = `${sha256(key).slice(0,24)}-12345678-1234-1234-1234-123456789012`, home = join(homeRoot, name);
  mkdirSync(join(home, 'profiles'), { recursive: true }); mkdirSync(join(home, 'sessions'));
  writeFileSync(join(home, 'RoleTools.mjs'), 'policy'); writeFileSync(join(home, 'sessions', 'result.json'), '{"ok":true}');
  symlinkSync(source, join(home, 'profiles', 'dependency')); symlinkSync(join(root, 'absent'), join(home, 'profiles', 'dangling'));
  const inventory: DeletionRecordInventory = { records: [{ id: 'registry/run', database: 'registry', table: 'runs', key: { run_id: 'run' } }],
    nodes: [{ id: 'registry/run', kind: 'run', revision: '1', ownedBy: [], references: [] }], unclassifiedTables: [], artifactSeeds: [] };
  const audit = { schemaVersion: '1.0', provider: 'deepseek-harness-sdk', idempotencyKey: key, metadata: { runId: 'run' } };
  const cleaner = new DshHomeDeletionFiles(homeRoot);
  const observed = cleaner.observe([audit], inventory), plan = planBatchDeletion('registry/run', [...inventory.nodes, ...observed.nodes]);
  return { root, homeRoot, home, source, name, key, inventory, audit, cleaner, observed, plan, close: () => rmSync(root, { recursive: true, force: true }) };
}
test('frozen cleanup unlinks ordinary and dangling links, preserves their targets and resumes after partial removal', () => {
  const f = fixture();
  try {
    const witness = f.cleaner.capture(f.plan, f.observed.homes);
    assert.doesNotMatch(JSON.stringify(witness), /keep dependency|"ok"|run:docgen:1/);
    assert.equal(f.observed.homes[0]!.entries.filter(entry => entry.kind === 'link').length, 2);
    unlinkSync(join(f.home, 'RoleTools.mjs'));
    new DshHomeDeletionFiles(f.homeRoot).clean(f.plan, witness);
    assert.equal(existsSync(join(f.home, 'profiles', 'dependency')), false);
    assert.throws(() => lstatSync(join(f.home, 'profiles', 'dangling')), /ENOENT/);
    assert.equal(readFileSync(join(f.source, 'dependency.js'), 'utf8'), 'keep dependency');
    assert.equal(existsSync(join(f.home, 'sessions', 'result.json')), false);
    f.cleaner.clean(f.plan, witness);
  } finally { f.close(); }
});
test('changed link, file or added member rejects before removing other confirmed files', () => {
  const f = fixture();
  try {
    const witness = f.cleaner.capture(f.plan, f.observed.homes);
    unlinkSync(join(f.home, 'profiles', 'dependency')); symlinkSync(f.root, join(f.home, 'profiles', 'dependency'));
    assert.throws(() => f.cleaner.clean(f.plan, witness), /ARTIFACT_CHANGED/);
    assert.equal(readFileSync(join(f.home, 'RoleTools.mjs'), 'utf8'), 'policy');
    const fresh = f.cleaner.observe([f.audit], f.inventory), plan = planBatchDeletion('registry/run', [...f.inventory.nodes, ...fresh.nodes]);
    const next = f.cleaner.capture(plan, fresh.homes);
    writeFileSync(join(f.home, 'sessions', 'extra.json'), 'new');
    assert.throws(() => f.cleaner.clean(plan, next), /ARTIFACT_CHANGED/);
    assert.equal(readFileSync(join(f.home, 'RoleTools.mjs'), 'utf8'), 'policy');
  } finally { f.close(); }
});
test('unknown owner protects a shared home and unassociated directories are untouched', () => {
  const f = fixture();
  try {
    const observed = f.cleaner.observe([f.audit, { ...f.audit, metadata: { runId: 'unknown' } }], f.inventory);
    const plan = planBatchDeletion('registry/run', [...f.inventory.nodes, ...observed.nodes]);
    assert.equal(plan.counts.artifact ?? 0, 0);
    mkdirSync(join(f.homeRoot, 'user-directory')); writeFileSync(join(f.homeRoot, 'user-directory', 'notes'), 'keep');
    assert.deepEqual(f.cleaner.observe([{ ...f.audit, metadata: { runId: 'unknown' } }], f.inventory), { homes: [], nodes: [] });
    assert.equal(readFileSync(join(f.homeRoot, 'user-directory', 'notes'), 'utf8'), 'keep');
  } finally { f.close(); }
});
test('replaced directory identity, top-level unknown files and traversal witnesses fail closed', () => {
  const f = fixture();
  try {
    const witness = f.cleaner.capture(f.plan, f.observed.homes);
    const forged = structuredClone(witness); forged.homes[0]!.entries[1]!.path = '../source/dependency.js';
    assert.throws(() => f.cleaner.clean(f.plan, forged), /WITNESS_INVALID/);
    writeFileSync(join(f.home, 'personal-note'), 'keep'); assert.throws(() => f.cleaner.observe([f.audit], f.inventory), /LAYOUT_UNKNOWN/);
    rmSync(join(f.home, 'personal-note'));
    renameSync(join(f.home, 'profiles'), join(f.home, 'old-profiles')); symlinkSync(f.source, join(f.home, 'profiles'));
    assert.throws(() => f.cleaner.clean(f.plan, witness), /LAYOUT_UNKNOWN|ARTIFACT_CHANGED/);
    assert.equal(readFileSync(join(f.source, 'dependency.js'), 'utf8'), 'keep dependency');
  } finally { f.close(); }
});

test('persisted recovery reuses the original link witness after cleanup acknowledgement is lost', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { SqliteDeletionRecovery } = await import('../../src/infrastructure/sqlite/SqliteDeletionRecovery.ts');
  const f = fixture();
  let db = new DatabaseSync(join(f.root, 'records.sqlite')), journal = new DatabaseSync(join(f.root, 'journal.sqlite'));
  db.exec("CREATE TABLE executions(id TEXT PRIMARY KEY); INSERT INTO executions VALUES('run')");
  let captures = 0, removals = 0, loseAcknowledgement = true;
  const open = () => {
    const cleaner = new DshHomeDeletionFiles(f.homeRoot);
    return new SqliteDeletionRecovery(journal, [{ name: 'registry', contract: 'test-executions-v1', database: db,
      capture: () => ({ id: 'run' }), remove: () => { removals++; db.prepare('DELETE FROM executions WHERE id=?').run('run'); } }],
    [{ name: 'dsh-homes', contract: cleaner.contract, scope: cleaner.scope,
      capture: plan => { captures++; return cleaner.capture(plan, f.observed.homes); },
      clean: (plan, witness) => { cleaner.clean(plan, witness); if (loseAcknowledgement) throw new Error('controlled acknowledgement loss'); } }]);
  };
  try {
    const first = open(); first.prepare(f.plan); first.applyRecords(f.plan.planId);
    assert.throws(() => first.completeAfterFiles(f.plan.planId), /acknowledgement loss/);
    assert.equal(first.get(f.plan.planId)!.phase, 'RECORDS_COMMITTED');
    db.close(); journal.close(); db = new DatabaseSync(join(f.root, 'records.sqlite')); journal = new DatabaseSync(join(f.root, 'journal.sqlite'));
    loseAcknowledgement = false; const recovered = open(); recovered.applyRecords(f.plan.planId); recovered.completeAfterFiles(f.plan.planId);
    assert.equal(recovered.get(f.plan.planId)!.phase, 'COMPLETE'); assert.equal(captures, 1); assert.equal(removals, 1);
    assert.equal(readFileSync(join(f.source, 'dependency.js'), 'utf8'), 'keep dependency');
  } finally { db.close(); journal.close(); f.close(); }
});
