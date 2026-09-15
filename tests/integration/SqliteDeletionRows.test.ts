/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证行执行器的冻结复核、真实阶段预算与批次编号删除后不重置。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sha256 } from '../../src/domain/Domain.ts';
import type { BatchDeletionPlan } from '../../src/domain/workbench/BatchDeletion.ts';
import { createStageTask } from '../../src/domain/workbench/StageTask.ts';
import { SqliteStageTasks } from '../../src/infrastructure/sqlite/SqliteStageTasks.ts';
import { SqliteWorkbenchBatches } from '../../src/infrastructure/sqlite/SqliteWorkbenchBatches.ts';
import { SqliteDeletionRows } from '../../src/infrastructure/sqlite/SqliteDeletionRows.ts';
import { sqliteDeletionInventory } from '../../src/infrastructure/sqlite/SqliteDeletionInventory.ts';
import { SqliteDeletionRecovery } from '../../src/infrastructure/sqlite/SqliteDeletionRecovery.ts';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'deletion-rows-')), path = join(root, 'workbench.sqlite');
  let stages = new SqliteStageTasks(path), batches = new SqliteWorkbenchBatches(path);
  let db = new DatabaseSync(path), journal = new DatabaseSync(join(root, 'journal.sqlite'));
  const now = '2026-09-14T00:00:00Z';
  const input = { projectId: 'p', snapshotId: 'snapshot', moduleId: 'parser', schedule: { enabled: false, intervalMinutes: null } };
  const batch = batches.create(input, 'create-first', now);
  const task = createStageTask({ stage: 'GENERATE', projectId: 'p', sourceRevision: 'revision', sourceDigest: 'source',
    configurationDigest: 'config', cardVersionIds: [], parameters: {} }, { modelCalls: 5 }, now);
  stages.insert(task); const lease = stages.claim(task.taskId)!;
  stages.addUsage(task.taskId, lease.leaseId, 'model', { modelCalls: 2, tokens: 7, reservedTokens: 8, elapsedMs: 11 });
  stages.finish(task.taskId, lease.leaseId, 'FAILED', null, 'CONTROLLED_FAILURE');
  let rows = new SqliteDeletionRows('workbench', db), captures = 0;
  const inventory = sqliteDeletionInventory({ workbench: db });
  const selected = inventory.records.filter(record => ['wb_batches', 'wb_stage_tasks', 'wb_stage_events'].includes(record.table));
  // 此处只测试存储执行边界；完整归属图的授权选择由领域测试覆盖，不能据此声明删除端到端完成。
  const plan: BatchDeletionPlan = { schemaVersion: 'batch-deletion-v2', planId: `delete-${sha256(JSON.stringify(selected))}`,
    targetId: selected.find(record => record.table === 'wb_batches')!.id, deleteIds: selected.map(record => record.id).sort(),
    preservedIds: [], counts: {}, reclaimableBytes: 0 };
  const recovery = () => new SqliteDeletionRecovery(journal, [{ name: 'workbench', contract: rows.contract, database: db,
    capture: value => { captures++; return rows.capture(value); }, remove: (value, witness) => rows.remove(value, witness) }]);
  const close = () => { stages.close(); batches.close(); db.close(); journal.close(); };
  return { root, input, batch, task, plan, inventory, now, recovery, get captures() { return captures; },
    get rows() { return rows; }, get db() { return db; }, get stages() { return stages; }, get batches() { return batches; },
    reopen: () => { close(); stages = new SqliteStageTasks(path); batches = new SqliteWorkbenchBatches(path);
      db = new DatabaseSync(path); journal = new DatabaseSync(join(root, 'journal.sqlite')); rows = new SqliteDeletionRows('workbench', db); },
    close: () => { close(); rmSync(root, { recursive: true, force: true }); } };
}

test('row removal keeps stage usage and readable batch counters across restart and rejects old-input recreation', () => {
  const f = fixture();
  try {
    const service = f.recovery(); service.prepare(f.plan); service.applyRecords(f.plan.planId);
    assert.equal(f.stages.get(f.task.taskId), null); assert.equal(f.batches.get(f.batch.batchId), null);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM wb_stage_events').get()!.n, 0);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM wb_stage_usage').get()!.n, 1);
    const tombstone = f.db.prepare("SELECT usage_json FROM deletion_execution_tombstones WHERE table_name='wb_stage_tasks'").get()!;
    assert.deepEqual(JSON.parse(String(tombstone.usage_json)), { modelCalls: 2, reservedTokens: 8, tokens: 7, elapsedMs: 11 });
    f.reopen(); const resumed = f.recovery(); resumed.prepare(f.plan); resumed.applyRecords(f.plan.planId);
    assert.equal(f.captures, 1, 'resume uses the frozen witness instead of recapturing remaining rows');
    assert.throws(() => f.stages.insert(f.task), /EXECUTION_DELETED/);
    assert.throws(() => f.batches.create(f.input, 'create-first', f.now), /BATCH_NOT_FOUND/);
    assert.equal(f.batches.create(f.input, 'create-second', f.now).batchId, 'parser-20260914-2');
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM wb_stage_usage').get()!.n, 1);
    resumed.completeAfterFiles(f.plan.planId);
  } finally { f.close(); }
});

test('changed rows after preparation abort before any deletion and protected ledgers cannot be selected', () => {
  const f = fixture();
  try {
    const service = f.recovery(); const prepared = service.prepare(f.plan);
    assert.throws(() => f.rows.remove(f.plan, prepared.intent.witnesses.workbench), /DELETION_TRANSACTION_REQUIRED/);
    f.db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
    try { assert.throws(() => f.rows.remove(f.plan, prepared.intent.witnesses.workbench), /DELETION_FOREIGN_KEYS_REQUIRED/); }
    finally { f.db.exec('ROLLBACK; PRAGMA foreign_keys=ON'); }
    f.db.prepare('UPDATE wb_batches SET value=? WHERE batch_id=?').run(JSON.stringify({ ...f.batch, updatedAt: '2026-09-15T00:00:00Z' }), f.batch.batchId);
    assert.throws(() => service.applyRecords(f.plan.planId), /DELETION_RECORD_CHANGED/);
    assert.ok(f.stages.get(f.task.taskId)); assert.ok(f.batches.get(f.batch.batchId));
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM deletion_execution_tombstones').get()!.n, 0);
    const protectedId = f.inventory.records.find(record => record.table === 'wb_batch_sequences')!.id;
    assert.throws(() => f.rows.capture({ ...f.plan, deleteIds: [protectedId] }), /DELETION_TABLE_PROTECTED/);
  } finally { f.close(); }
});
