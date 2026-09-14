/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证旧运行完整数据库引用规划、配置外键保留、业务不可见及禁止重建结果。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createEvent, createRun } from '../../src/domain/Domain.ts';
import { planBatchDeletion } from '../../src/domain/workbench/BatchDeletion.ts';
import { SQLiteFlywheelRepository } from '../../src/infrastructure/sqlite/SqliteCas.ts';
import { SqliteDeletionRows } from '../../src/infrastructure/sqlite/SqliteDeletionRows.ts';
import { SqliteDeletionRecovery } from '../../src/infrastructure/sqlite/SqliteDeletionRecovery.ts';
import { sqliteDeletionInventory } from '../../src/infrastructure/sqlite/SqliteDeletionInventory.ts';
import { ConsoleReadModel } from '../../src/interfaces/runner/ConsoleReadModel.ts';
import { SQLiteOperationalMetrics } from '../../src/infrastructure/observability/SqliteOperationalMetrics.ts';

test('legacy deletion removes results while retaining configuration FK and preventing a deleted run from returning', () => {
  const root = mkdtempSync(join(tmpdir(), 'legacy-deletion-')), path = join(root, 'registry.sqlite');
  let repository = new SQLiteFlywheelRepository(path); repository.initialize();
  const journal = new DatabaseSync(join(root, 'journal.sqlite'));
  const now = '2026-09-14T00:00:00.000Z';
  const run = { ...createRun('module', 'policy', now), state: 'FAILED' as const, iteration: 3, bestVersionId: 'old-version' };
  const config = JSON.stringify({ provider: { kind: 'fixture', model: 'fixture' }, retained: 'original configuration' });
  try {
    repository.saveRun(run, createEvent(run.runId, 'RunCreated', {}, now));
    let db = repository.database;
    db.prepare('INSERT INTO run_configuration_snapshots VALUES(?,?,?)').run(run.runId, config, now);
    db.prepare('INSERT INTO checkpoints VALUES(?,?,?,?,?,?,?,?)').run('checkpoint', run.runId, 'doc_gen', 'COMMITTED', '[]', '[]', 2, now);
    const metrics = new SQLiteOperationalMetrics(db, () => new Date('2026-09-14T01:00:00Z'));
    metrics.recordProviderInvocation({ invocationId: 'old-call', runId: run.runId, agentId: 'doc-gen', provider: 'fixture', model: 'fixture',
      startedAt: now, completedAt: now, durationMs: 0, status: 'SUCCEEDED', retryCount: 0, inputTokens: 17, outputTokens: 3,
      cacheReadTokens: 0, cacheWriteTokens: 0, estimatedCostUsd: null, fixture: true, errorCode: null });
    const consoleView = new ConsoleReadModel(db);
    assert.equal(consoleView.listRunSummaries().length, 1);
    const rows = new SqliteDeletionRows('registry', db), inventory = sqliteDeletionInventory({ registry: db });
    const target = inventory.records.find(record => record.table === 'runs')!.id;
    const plan = planBatchDeletion(target, inventory.nodes);
    const recovery = new SqliteDeletionRecovery(journal, [{ name: 'registry', contract: rows.contract, database: db,
      capture: value => rows.capture(value), remove: (value, witness) => rows.remove(value, witness) }]);
    recovery.prepare(plan); recovery.applyRecords(plan.planId);
    assert.equal(repository.getRun(run.runId), null); assert.equal(repository.status().runs, 0);
    assert.deepEqual(consoleView.listRunSummaries(), []);
    assert.equal(consoleView.getRunSnapshot(run.runId, []), null); assert.equal(consoleView.getRunProgress(run.runId), null);
    assert.equal((metrics.runs('24h').cohort as { runCount: number }).runCount, 0);
    assert.equal((metrics.runs('24h').providerCalls as { total: number }).total, 1);
    assert.equal(db.prepare("SELECT input_tokens FROM provider_invocations WHERE invocation_id='old-call'").get()!.input_tokens, 17);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM events WHERE run_id=?').get(run.runId)!.n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM checkpoints WHERE run_id=?').get(run.runId)!.n, 0);
    assert.equal(db.prepare('SELECT snapshot_json FROM run_configuration_snapshots WHERE run_id=?').get(run.runId)!.snapshot_json, config);
    assert.deepEqual({ ...db.prepare('SELECT iteration,best_version_id FROM runs WHERE run_id=?').get(run.runId) }, { iteration: 3, best_version_id: null });
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.throws(() => repository.updateRun(run, createEvent(run.runId, 'RunStateChanged', {}, now)), /EXECUTION_DELETED/);
    assert.throws(() => db.prepare('INSERT INTO checkpoints VALUES(?,?,?,?,?,?,?,?)').run('new', run.runId, 'doc_gen', 'PENDING', '[]', '[]', 0, now), /EXECUTION_DELETED/);
    recovery.completeAfterFiles(plan.planId);
    repository.close(); repository = new SQLiteFlywheelRepository(path); repository.initialize(); db = repository.database;
    assert.equal(repository.getRun(run.runId), null); assert.deepEqual(new ConsoleReadModel(db).listRunSummaries(), []);
    assert.throws(() => repository.saveRun(run, createEvent(run.runId, 'RunCreated', {}, now)), /EXECUTION_DELETED/);
    const next = sqliteDeletionInventory({ registry: db });
    assert.equal(next.nodes.find(node => node.id === target)!.kind, 'configuration');
    assert.throws(() => planBatchDeletion(target, next.nodes), /DELETION_TARGET_NOT_FOUND/);
  } finally { repository.close(); journal.close(); rmSync(root, { recursive: true, force: true }); }
});
