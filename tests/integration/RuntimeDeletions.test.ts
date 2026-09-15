/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证删除真实存储组装与服务器产物目录授权。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { assertDeletionDirectoryScope } from '../../src/infrastructure/sqlite/DeletionDirectoryScope.ts';
import { sqliteRuntimeDeletions } from '../../src/infrastructure/sqlite/SqliteRuntimeDeletions.ts';
import { SqliteWorkbenchBatches } from '../../src/infrastructure/sqlite/SqliteWorkbenchBatches.ts';
import { sqliteDeletionInventory } from '../../src/infrastructure/sqlite/SqliteDeletionInventory.ts';
import { BatchDeletions } from '../../src/application/services/BatchDeletions.ts';
import { RuntimeMaintenance } from '../../src/application/services/RuntimeMaintenance.ts';
import { RuntimeFileLock } from '../../src/infrastructure/sqlite/RuntimeFileLock.ts';
import { deletionRecoveryPending } from '../../src/infrastructure/sqlite/DeletionRecoveryPending.ts';

test('directory authorization protects lexical, linked and missing source paths without creating directories', () => {
  const root = mkdtempSync(join(tmpdir(), 'deletion-scope-'));
  const source = join(root, 'source'), output = join(root, 'output'); mkdirSync(source); mkdirSync(output);
  symlinkSync(source, join(root, 'source-alias'));
  const check = (roots: string[], sourceRoots = [source]) => assertDeletionDirectoryScope({ roots, allowedRoots: [root], sourceRoots });
  try {
    check([output]);
    assert.throws(() => check([source]), /SOURCE_DIRECTORY_OVERLAP/);
    assert.throws(() => check([root]), /SOURCE_DIRECTORY_OVERLAP/);
    assert.throws(() => check([join(root, 'source-alias', 'future')]), /SOURCE_DIRECTORY_OVERLAP/);
    assert.throws(() => check([output], [join(output, 'missing-source')]), /SOURCE_DIRECTORY_OVERLAP/);
    assert.throws(() => check([output, join(output, 'nested')]), /OUTPUT_DIRECTORY_OVERLAP/);
    assert.throws(() => check(['/etc']), /DIRECTORY_UNAUTHORIZED/);
    assert.throws(() => check([output], []), /SCOPE_REQUIRED/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('real runtime assembly deletes a confirmed cancelled batch, preserves commands and source, and replays its receipt', async () => {
  const root = mkdtempSync(join(tmpdir(), 'runtime-deletion-'));
  const source = join(root, 'source'), runtime = join(root, 'runtime'); mkdirSync(source); mkdirSync(runtime);
  writeFileSync(join(source, 'keep.c'), 'int main(void) { return 0; }');
  const lock = new RuntimeFileLock(runtime);
  const roots = { legacy: join(runtime, 'knowledge'), index: join(runtime, 'index'), workbench: join(runtime, 'publications') };
  const casRoot = join(runtime, 'cas'); for (const dir of [casRoot, ...Object.values(roots)]) mkdirSync(dir);
  const path = join(runtime, 'workbench.sqlite'), journalPath = join(runtime, 'deletion-recovery.sqlite');
  const batches = new SqliteWorkbenchBatches(path), db = new DatabaseSync(path), graph = new DatabaseSync(join(runtime, 'graph.sqlite'));
  let journal: DatabaseSync | undefined;
  const input = { projectId: 'p', snapshotId: 's', moduleId: 'parser', schedule: { enabled: false, intervalMinutes: null } };
  const batch = batches.create(input, 'create-first', '2026-09-14T00:00:00Z'); batches.cancel(batch.batchId, '2026-09-14T00:01:00Z');
  const maintenance = new RuntimeMaintenance({ needsRecovery: () => deletionRecoveryPending(journalPath), idle: () => true,
    isolate: work => lock.exclusive(work) });
  let sourceRoots = [source];
  const session = async <T>(work: (app: BatchDeletions) => Promise<T>) => {
    const operation = maintenance.enter();
    try { return await operation.exclusive(async () => {
      journal ??= new DatabaseSync(journalPath);
      const store = sqliteRuntimeDeletions({ databases: { workbench: db }, graph: { name: 'graph', database: graph }, journal,
        casRoot, publicationRoots: roots, indexRoot: 'index', workbenchRoot: 'workbench', legacyRoots: ['legacy'],
        allowedRoots: [runtime], sourceRoots: () => sourceRoots, runStates: async () => ({}), exclusive: async action => action() });
      return work(new BatchDeletions(store));
    }); } finally { operation.release(); }
  };
  try {
    const target = sqliteDeletionInventory({ workbench: db }).records.find(row => row.table === 'wb_batches')!.id;
    const plan = await session(app => app.preview(target));
    await assert.rejects(session(app => app.confirm(target, { planId: plan.planId, confirmed: false })), /CONFIRMATION/);
    assert.ok(batches.get(batch.batchId));
    sourceRoots = [source, roots.legacy];
    await assert.rejects(session(app => app.confirm(target, { planId: plan.planId, confirmed: true })), /SOURCE_DIRECTORY_OVERLAP/);
    assert.ok(batches.get(batch.batchId));
    assert.equal(journal!.prepare('SELECT count(*) AS count FROM deletion_recovery_intents').get()!.count, 0);
    sourceRoots = [source];
    const receipt = await session(app => app.confirm(target, { planId: plan.planId, confirmed: true }));
    assert.equal(receipt.status, 'DELETED'); assert.equal(batches.get(batch.batchId), null);
    assert.equal(db.prepare('SELECT count(*) AS count FROM wb_batch_commands').get()!.count, 1);
    assert.equal(readFileSync(join(source, 'keep.c'), 'utf8'), 'int main(void) { return 0; }');
    journal!.close(); journal = new DatabaseSync(journalPath);
    assert.deepEqual(await session(app => app.confirm(target, { planId: plan.planId, confirmed: true })), receipt);
    const next = batches.create(input, 'create-second', '2026-09-14T00:02:00Z'); assert.match(next.batchId, /-2$/);
  } finally { journal?.close(); graph.close(); db.close(); batches.close(); lock.close(); rmSync(root, { recursive: true, force: true }); }
});
