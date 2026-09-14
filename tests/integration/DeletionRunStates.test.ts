/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证旧运行删除使用执行事实，并拒绝存活执行者、未知状态与陈旧快照。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { SqliteDeletionRunStates } from '../../src/infrastructure/sqlite/SqliteDeletionRunStates.ts';
import { sqliteDeletionInventory } from '../../src/infrastructure/sqlite/SqliteDeletionInventory.ts';
import { SqliteDeletionRows } from '../../src/infrastructure/sqlite/SqliteDeletionRows.ts';
import { planBatchDeletion } from '../../src/domain/workbench/BatchDeletion.ts';
import { checkpointOwner } from '../../src/infrastructure/sqlite/CheckpointOwner.ts';
import type { WorkflowExecutionView } from '../../src/application/ports/ApplicationPorts.ts';
import { createDomainKnowledgeInfrastructure } from '../../src/infrastructure/langgraph/Runtime.ts';

function database(state = 'GENERATING') {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE runs(run_id TEXT PRIMARY KEY,state TEXT,iteration INTEGER,best_version_id TEXT);
    CREATE TABLE checkpoints(generation_key TEXT PRIMARY KEY,run_id TEXT,status TEXT);
    CREATE TABLE checkpoint_owners(generation_key TEXT PRIMARY KEY,owner_json TEXT)`);
  db.prepare('INSERT INTO runs VALUES(?,?,?,NULL)').run('old-run', state, 4);
  return db;
}
function view(executionStatus: WorkflowExecutionView['executionStatus']): WorkflowExecutionView {
  return { runId: 'old-run', executionStatus, currentNode: 'doc_gen', iteration: 4, maxIterations: 10, route: null, error: null };
}
test('failed execution in a generating business phase can be planned and captured without changing the business state', async () => {
  const db = database();
  try {
    const rows = new SqliteDeletionRows('registry', db);
    const states = await SqliteDeletionRunStates.inspect(db, async () => view('FAILED'));
    assert.equal(states.idle, true);
    const inventory = sqliteDeletionInventory({ registry: db }, { registry: states });
    const run = inventory.nodes.find(node => node.kind === 'run')!;
    const plan = planBatchDeletion(run.id, inventory.nodes);
    assert.deepEqual(plan.counts, { run: 1 });
    assert.doesNotThrow(() => rows.capture(plan, states));
    assert.equal(db.prepare('SELECT state FROM runs').get()!.state, 'GENERATING');
    assert.throws(() => rows.capture(plan), /DELETION_EXECUTION_ACTIVE/);
  } finally { db.close(); }
});
test('a running execution blocks deletion even when its business state is verified', async () => {
  const db = database('VERIFIED');
  try {
    const states = await SqliteDeletionRunStates.inspect(db, async () => view('RUNNING'));
    assert.equal(states.idle, false);
    const inventory = sqliteDeletionInventory({ registry: db }, { registry: states });
    assert.throws(() => planBatchDeletion(inventory.nodes.find(node => node.kind === 'run')!.id, inventory.nodes), /DELETION_EXECUTION_ACTIVE/);
  } finally { db.close(); }
});
test('missing workflow is only allowed for terminal legacy business records, and errors are not missing workflows', async () => {
  const db = database();
  try {
    const missing = async () => { throw new Error('WORKFLOW_NOT_FOUND: old-run'); };
    assert.equal((await SqliteDeletionRunStates.inspect(db, missing)).idle, false);
    db.exec("UPDATE runs SET state='FAILED'");
    assert.equal((await SqliteDeletionRunStates.inspect(db, missing)).idle, true);
    assert.equal((await SqliteDeletionRunStates.inspect(db, async () => { throw new Error('SQLITE_IOERR'); })).idle, false);
    assert.equal((await SqliteDeletionRunStates.inspect(db, async () => ({ ...view('FAILED'), runId: 'different' }))).idle, false);
  } finally { db.close(); }
});
test('running checkpoint owner must be proven exited, regardless of a terminal workflow', async () => {
  const db = database();
  try {
    db.exec("INSERT INTO checkpoints VALUES('checkpoint','old-run','RUNNING')");
    const inspect = () => SqliteDeletionRunStates.inspect(db, async () => view('FAILED'));
    assert.equal((await inspect()).idle, false);
    db.prepare('INSERT INTO checkpoint_owners VALUES(?,?)').run('checkpoint', JSON.stringify(checkpointOwner()));
    assert.equal((await inspect()).idle, false);
    if (process.platform === 'linux') {
      const owner = checkpointOwner(); assert.ok(owner);
      db.prepare('UPDATE checkpoint_owners SET owner_json=?').run(JSON.stringify({ ...owner, startTime: owner.startTime === '0' ? '1' : '0' }));
      assert.equal((await inspect()).idle, true);
    }
    db.exec("UPDATE checkpoints SET status='UNKNOWN'");
    assert.equal((await inspect()).idle, false);
  } finally { db.close(); }
});
test('a run or checkpoint changed during or after async inspection invalidates the snapshot', async () => {
  const db = database();
  try {
    await assert.rejects(SqliteDeletionRunStates.inspect(db, async () => {
      db.exec('UPDATE runs SET iteration=iteration+1'); return view('FAILED');
    }), /DELETION_EXECUTION_CHANGED/);
    const states = await SqliteDeletionRunStates.inspect(db, async () => view('FAILED'));
    db.exec("INSERT INTO checkpoints VALUES('new','old-run','RUNNING')");
    assert.throws(() => sqliteDeletionInventory({ registry: db }, { registry: states }), /DELETION_EXECUTION_CHANGED/);
    assert.throws(() => states.idle, /DELETION_EXECUTION_CHANGED/);
  } finally { db.close(); }
});
test('an active checkpoint without a visible run cannot be ignored by the global idle check', async () => {
  const db = database();
  try {
    db.exec("INSERT INTO checkpoints VALUES('orphan','missing-run','RUNNING')");
    await assert.rejects(SqliteDeletionRunStates.inspect(db, async () => view('FAILED')), /DELETION_EXECUTION_UNTRACKED/);
  } finally { db.close(); }
});
test('real embedded execution is blocked while its node runs and becomes eligible after failure cleanup', async () => {
  const db = database();
  let entered!: () => void, finish!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const release = new Promise<void>(resolve => { finish = resolve; });
  const infrastructure = await createDomainKnowledgeInfrastructure({ checkpoint: { kind: 'memory' },
    prompts: { getPromptAddon: () => '' }, observer: { record: () => {} },
    executor: { execute: async () => { entered(); await release; throw new Error('CONTROLLED_FAILURE'); } } });
  try {
    await infrastructure.engine.start({ runId: 'old-run', workerCount: 0, maxIterations: 1 });
    await started;
    const inspect = () => SqliteDeletionRunStates.inspect(db, id => infrastructure.engine.status(id));
    assert.equal((await inspect()).idle, false);
    finish();
    assert.equal((await infrastructure.engine.wait('old-run')).executionStatus, 'FAILED');
    assert.equal((await inspect()).idle, true);
    assert.equal(db.prepare('SELECT state FROM runs').get()!.state, 'GENERATING');
  } finally { finish(); await infrastructure.engine.shutdown(); db.close(); }
});
