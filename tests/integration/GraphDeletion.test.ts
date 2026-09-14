/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：使用真实SqliteSaver验证检查点/待提交记录清理、共享引用及中断恢复。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { emptyCheckpoint } from '@langchain/langgraph-checkpoint';
import { SqliteGraphDeletion } from '../../src/infrastructure/sqlite/SqliteGraphDeletion.ts';
import { sqliteDeletionInventory } from '../../src/infrastructure/sqlite/SqliteDeletionInventory.ts';
import { SqliteDeletionRecovery } from '../../src/infrastructure/sqlite/SqliteDeletionRecovery.ts';
import { planBatchDeletion } from '../../src/domain/workbench/BatchDeletion.ts';

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'graph-deletion-')), filename = join(root, 'graph.sqlite');
  const saver = SqliteSaver.fromConnString(filename);
  const put = async (threadId: string, namespace = '', payload: Record<string, unknown> = {}) => {
    const checkpoint = emptyCheckpoint(); checkpoint.channel_values = { runId: threadId, ...payload };
    const config = await saver.put({ configurable: { thread_id: threadId, checkpoint_ns: namespace } }, checkpoint,
      { source: 'input', step: 0, parents: {} });
    await saver.putWrites(config, [['result', { runId: threadId, privateText: 'PRIVATE_GRAPH_PAYLOAD', ...payload }]], 'node');
    return { config, checkpoint };
  };
  const a = await put('a'), nested = await put('a', 'child'), b = await put('b', '', { versionId: 'shared-version' });
  const db = new DatabaseSync(filename), registry = new DatabaseSync(join(root, 'registry.sqlite'));
  registry.exec(`CREATE TABLE runs(run_id TEXT PRIMARY KEY,state TEXT);
    CREATE TABLE knowledge_versions(version_id TEXT PRIMARY KEY,metadata_json TEXT,body_ref_json TEXT);
    INSERT INTO runs VALUES('a','FAILED'),('b','FAILED');
    INSERT INTO knowledge_versions VALUES('shared-version','{}','{}')`);
  const adapter = new SqliteGraphDeletion('graph', db);
  const inventory = () => adapter.inventory(sqliteDeletionInventory({ registry }));
  const plan = () => {
    const data = inventory();
    return planBatchDeletion(data.records.find(row => row.table === 'runs' && row.key.run_id === 'a')!.id, data.nodes);
  };
  return { root, saver, db, registry, adapter, a, nested, b, put, inventory, plan,
    close: () => { db.close(); registry.close(); saver.db.close(); rmSync(root, { recursive: true, force: true }); } };
}
test('real saver thread deletion includes every namespace and pending write while preserving other threads', async () => {
  const f = await fixture();
  try {
    const before = await f.saver.getTuple(f.b.config);
    const inventory = f.inventory();
    assert.doesNotMatch(JSON.stringify(inventory), /PRIVATE_GRAPH_PAYLOAD/);
    const bWrite = inventory.nodes.find(node => node.id === inventory.records.find(row => row.database === 'graph' && row.table === 'writes' && row.key.thread_id === 'b')!.id)!;
    assert.ok(bWrite.references.includes(inventory.records.find(row => row.table === 'knowledge_versions')!.id));
    const plan = f.plan(), witness = f.adapter.capture(plan);
    assert.equal(plan.deleteIds.filter(id => id.startsWith('graph/')).length, 4);
    assert.throws(() => f.adapter.remove(plan, witness), /DELETION_TRANSACTION_REQUIRED/);
    f.db.exec('BEGIN IMMEDIATE'); f.adapter.remove(plan, witness); f.db.exec('COMMIT');
    assert.equal(await f.saver.getTuple(f.a.config), undefined);
    assert.equal(await f.saver.getTuple(f.nested.config), undefined);
    assert.deepEqual(await f.saver.getTuple(f.b.config), before);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM writes WHERE thread_id='a'").get()!.n, 0);
    await assert.rejects(f.saver.putWrites(f.a.config, [['result', 'revived']], 'retry'), /EXECUTION_DELETED/);
    await assert.rejects(f.saver.put(f.a.config, f.a.checkpoint, { source: 'update', step: 1, parents: {} }), /EXECUTION_DELETED/);
    const reopened = new DatabaseSync(join(f.root, 'graph.sqlite'));
    try {
      assert.equal(reopened.prepare('SELECT COUNT(*) AS n FROM deletion_graph_threads').get()!.n, 1);
      assert.throws(() => reopened.exec("UPDATE checkpoints SET thread_id='a' WHERE thread_id='b'"), /EXECUTION_DELETED/);
    } finally { reopened.close(); }
  } finally { f.close(); }
});
test('new writes after confirmation invalidate the whole thread witness before deletion', async () => {
  const f = await fixture();
  try {
    const plan = f.plan(), witness = f.adapter.capture(plan);
    await f.saver.putWrites(f.a.config, [['result', 'later']], 'new-task');
    f.db.exec('BEGIN IMMEDIATE');
    try { assert.throws(() => f.adapter.remove(plan, witness), /DELETION_RECORD_CHANGED/); }
    finally { f.db.exec('ROLLBACK'); }
    assert.ok(await f.saver.getTuple(f.a.config)); assert.ok(await f.saver.getTuple(f.b.config));
  } finally { f.close(); }
});
test('unknown threads protect referenced runs and partial thread plans are refused', async () => {
  const f = await fixture();
  try {
    const plan = f.plan();
    const partial = { ...plan, deleteIds: plan.deleteIds.filter(id => id !== plan.deleteIds.find(value => value.startsWith('graph/writes/'))) };
    assert.throws(() => f.adapter.capture(partial), /DELETION_GRAPH_THREAD_SHARED/);
    await f.put('unknown-thread', '', { linkedRunId: 'a' });
    assert.throws(() => f.plan(), /DELETION_TARGET_REFERENCED/);
  } finally { f.close(); }
});
test('a different thread referencing an internal checkpoint prevents removing its producer thread', async () => {
  const f = await fixture();
  try {
    await f.put('b', 'linked', { linkedCheckpoint: f.a.checkpoint.id });
    assert.throws(() => f.plan(), /DELETION_TARGET_REFERENCED/);
  } finally { f.close(); }
});
test('corrupt or unsupported serialized payloads and extra schema cannot be silently skipped', async () => {
  const f = await fixture();
  try {
    f.db.exec("UPDATE writes SET type='bytes' WHERE thread_id='a'");
    assert.throws(() => f.inventory(), /DELETION_GRAPH_ENCODING_UNSUPPORTED/);
    f.db.exec("UPDATE writes SET type='json',value='{bad' WHERE thread_id='a'");
    assert.throws(() => f.inventory(), /DELETION_GRAPH_JSON_INVALID/);
    f.db.exec('CREATE TABLE future_threads(id TEXT PRIMARY KEY)');
    assert.throws(() => f.inventory(), /DELETION_GRAPH_SCHEMA_UNSUPPORTED/);
  } finally { f.close(); }
});
test('oversized serialized records stop scanning before JSON decoding', async () => {
  const f = await fixture();
  try {
    f.db.prepare("UPDATE writes SET value=zeroblob(?) WHERE thread_id='a'").run(8 * 1024 * 1024 + 1);
    assert.throws(() => f.inventory(), /DELETION_ARTIFACT_LIMIT/);
  } finally { f.close(); }
});
test('cross-database recovery does not repeat a committed graph cleanup after a later participant fails', async () => {
  const f = await fixture(), journal = new DatabaseSync(join(f.root, 'journal.sqlite'));
  let fail = true, removals = 0;
  const recovery = () => new SqliteDeletionRecovery(journal, [
    { name: 'graph', contract: f.adapter.contract, database: f.db, capture: plan => f.adapter.capture(plan),
      remove: (plan, witness) => { removals++; f.adapter.remove(plan, witness); } },
    { name: 'registry', contract: 'controlled-failure', database: f.registry, capture: () => ({}),
      remove: () => { if (fail) throw new Error('CONTROLLED_LATER_FAILURE'); } },
  ]);
  try {
    const first = recovery(), plan = f.plan(); first.prepare(plan);
    assert.throws(() => first.applyRecords(plan.planId), /CONTROLLED_LATER_FAILURE/);
    assert.equal(await f.saver.getTuple(f.a.config), undefined); assert.ok(await f.saver.getTuple(f.b.config));
    fail = false;
    const restarted = recovery(); restarted.applyRecords(plan.planId); restarted.completeAfterFiles(plan.planId);
    assert.equal(removals, 1); assert.equal(restarted.get(plan.planId)!.phase, 'COMPLETE');
  } finally { journal.close(); f.close(); }
});
