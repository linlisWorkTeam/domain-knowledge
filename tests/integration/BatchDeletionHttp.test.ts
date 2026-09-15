/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证公开批次删除接口的二次确认、重试、维护排他和认证。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createKnowledgeServer } from '../../src/interfaces/runner/Server.ts';
async function setup(anonymousAccess = true) {
  const root = mkdtempSync(join(tmpdir(), 'batch-deletion-http-'));
  const instance = createKnowledgeServer({ runtimeDir: root, anonymousAccess, writeToken: 'test-delete-token' });
  instance.server.listen(0, '127.0.0.1'); await once(instance.server, 'listening');
  const address = instance.server.address(); assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  const batches = instance.composition.apps.workbenchBatches.store;
  const batch = batches.create({ projectId: 'p', snapshotId: 's', moduleId: 'parser', schedule: { enabled: false, intervalMinutes: null } }, 'first', '2026-09-14T00:00:00Z');
  batches.cancel(batch.batchId, '2026-09-14T00:01:00Z');
  const post = (action: string, payload = {}, id = batch.batchId) => fetch(`${base}/api/v1/batch-deletions/batches/${encodeURIComponent(id)}/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  return { ...instance, base, root, batch, batches, post, close: async () => {
    await instance.composition.shutdown(); instance.server.closeAllConnections(); instance.server.close(); await once(instance.server, 'close');
    rmSync(root, { recursive: true, force: true });
  } };
}
test('HTTP preview and explicit confirmation delete a cancelled batch and repeat the same receipt', async () => {
  const f = await setup();
  try {
    const response = await f.post('preview'); const plan = await response.json(); assert.equal(response.status, 200, JSON.stringify(plan));
    assert.ok(f.batches.get(f.batch.batchId));
    assert.equal((await f.post('confirm', { planId: plan.planId })).status, 409);
    assert.ok(f.batches.get(f.batch.batchId));
    const confirmation = { planId: plan.planId, confirmed: true }, result = await f.post('confirm', confirmation);
    const receipt = await result.json(); assert.equal(result.status, 200, JSON.stringify(receipt));
    assert.equal(receipt.status, 'DELETED'); assert.equal(f.batches.get(f.batch.batchId), null);
    assert.deepEqual(await (await f.post('confirm', confirmation)).json(), receipt);
    assert.deepEqual(await (await fetch(`${f.base}/api/v1/batch-deletions`)).json(), { items: [] });
  } finally { await f.close(); }
});
test('a changed preview and a concurrent operation prevent deletion', async () => {
  const f = await setup();
  try {
    const plan = await (await f.post('preview')).json();
    f.batches.create({ projectId: 'p', snapshotId: 's', moduleId: 'other', schedule: { enabled: false, intervalMinutes: null } }, 'other', '2026-09-14T00:02:00Z');
    assert.equal((await f.post('confirm', { confirmed: true, planId: plan.planId })).status, 409);
    const operation = f.composition.apps.maintenance.enter();
    try { assert.equal((await f.post('preview')).status, 503); } finally { operation.release(); }
    assert.ok(f.batches.get(f.batch.batchId));
  } finally { await f.close(); }
});
test('deletion routes honor authenticated mode even for a local caller', async () => {
  const f = await setup(false);
  try {
    assert.equal((await f.post('preview')).status, 401);
    assert.equal((await fetch(`${f.base}/api/v1/batch-deletions`)).status, 401);
    assert.ok(f.batches.get(f.batch.batchId));
  } finally { await f.close(); }
});


test('both DSH roots join one HTTP plan and recover after the second root fails', async () => {
  const { sha256 } = await import('../../src/domain/Domain.ts');
  const { DshHomeDeletionFiles } = await import('../../src/infrastructure/sqlite/DshHomeDeletionFiles.ts');
  const f = await setup();
  const originalClean = DshHomeDeletionFiles.prototype.clean;
  try {
    const run = f.composition.apps.flywheel.createRun('two-homes', 'v1');
    for (const state of ['PLANNED', 'GENERATING', 'EVALUATING', 'FAILED'] as const) f.composition.apps.flywheel.transition(run.runId, state);
    const key = `${run.runId}:doc-gen:execute`, name = `${sha256(key).slice(0,24)}-12345678-1234-1234-1234-123456789012`;
    const workspace = join(f.root, 'agent-workspaces', 'stage-materials', sha256(key));
    mkdirSync(workspace, { recursive: true }); writeFileSync(join(workspace, '.flywheel-workspace.json'), JSON.stringify({ schemaVersion: '1.0', role: 'doc-gen', readablePaths: [], files: [] }));
    const dependency = join(f.root, 'keep-tool.js'); writeFileSync(dependency, 'keep tool');
    const files = ['dsh', 'dsh-configured'].map(root => {
      const home = join(f.root, root, name); mkdirSync(join(home, 'profiles'), { recursive: true });
      writeFileSync(join(home, 'RoleTools.mjs'), 'policy'); symlinkSync(dependency, join(home, 'profiles', 'tool')); return join(home, 'RoleTools.mjs');
    });
    mkdirSync(join(f.root, 'demo'), { recursive: true });
    writeFileSync(join(f.root, 'demo', 'agent-runs.jsonl'), JSON.stringify({ schemaVersion: '1.0', provider: 'deepseek-harness-sdk', role: 'doc-gen', idempotencyKey: key, workspaceRoot: workspace, metadata: { runId: run.runId } }) + '\n');
    const post = (action: string, data = {}) => fetch(`${f.base}/api/v1/batch-deletions/runs/${run.runId}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const response = await post('preview'), plan = await response.json(); assert.equal(response.status, 200, JSON.stringify(plan));
    assert.equal(plan.deleteIds.filter((id: string) => id.startsWith('dsh-homes/')).length, 1);
    assert.equal(plan.deleteIds.filter((id: string) => id.startsWith('dsh-homes-configured/')).length, 1);
    DshHomeDeletionFiles.prototype.clean = function (plan, witness) {
      if (this.name === 'dsh-homes-configured') throw new Error('controlled second-root interruption');
      return originalClean.call(this, plan, witness);
    };
    const confirmation = { planId: plan.planId, confirmed: true }, result = await post('confirm', confirmation), pending = await result.json();
    assert.equal(result.status, 202, JSON.stringify(pending)); assert.equal(pending.status, 'CLEANUP_PENDING');
    assert.equal(existsSync(files[0]!), false); assert.equal(existsSync(files[1]!), true);
    DshHomeDeletionFiles.prototype.clean = originalClean;
    const resumed = await post('recover', { planId: plan.planId }), receipt = await resumed.json();
    assert.equal(resumed.status, 200, JSON.stringify(receipt)); assert.equal(receipt.status, 'DELETED');
    assert.equal(receipt.committedAt, pending.committedAt); assert.equal(receipt.preparedAt, pending.preparedAt);
    assert.equal(existsSync(files[1]!), false); assert.equal(readFileSync(dependency, 'utf8'), 'keep tool');
  } finally { DshHomeDeletionFiles.prototype.clean = originalClean; await f.close(); }
});

test('ownerless legacy checkpoint gives a non-retryable explanation and keeps records intact', async () => {
  const f = await setup();
  try {
    const run = f.composition.apps.flywheel.createRun('legacy-unknown-owner', 'v1');
    for (const state of ['PLANNED', 'GENERATING', 'EVALUATING', 'FAILED'] as const) f.composition.apps.flywheel.transition(run.runId, state);
    const db = f.composition.repository.database;
    db.prepare(`INSERT INTO checkpoints(generation_key,run_id,node_id,status,input_refs_json,output_refs_json,retry_count,updated_at)
      VALUES(?,?,'test_gen','RUNNING','[]','[]',0,?)`).run('legacy-key', run.runId, '2026-09-10T00:00:00Z');
    const before = db.prepare('SELECT * FROM checkpoints').all();
    for (let retry = 0; retry < 2; retry++) {
      const response = await f.post('preview'), body = await response.json();
      assert.equal(response.status, 409);
      assert.equal(body.error.code, 'DELETION_CHECKPOINT_OWNER_UNKNOWN');
      assert.equal(body.error.retryable, false);
      assert.match(body.error.message, /历史执行记录不完整/);
      assert.doesNotMatch(JSON.stringify(body), /legacy-key|legacy-unknown-owner/);
      assert.deepEqual(db.prepare('SELECT * FROM checkpoints').all(), before);
      assert.ok(f.batches.get(f.batch.batchId));
      assert.equal(f.composition.apps.maintenance.status, 'AVAILABLE');
    }
  } finally { await f.close(); }
});
