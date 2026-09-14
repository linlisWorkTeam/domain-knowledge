/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证公开批次删除接口的二次确认、重试、维护排他和认证。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
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
