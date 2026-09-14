/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证删除确认时的竞态复核、共享保护与清理失败后的幂等恢复。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { DeletionNode } from '../../src/domain/workbench/BatchDeletion.ts';
import type { BatchDeletionReceipt, BatchDeletionStore } from '../../src/application/ports/BatchDeletionPorts.ts';
import { BatchDeletions } from '../../src/application/services/BatchDeletions.ts';
function fixture() {
  let inventory: DeletionNode[] = [
    { id: 'batch', kind: 'batch', revision: '1', ownedBy: [], references: [] },
    { id: 'card', kind: 'knowledge', revision: '1', ownedBy: ['batch'], references: [] },
  ];
  const receipts = new Map<string, BatchDeletionReceipt>();
  let commits = 0, cleanups = 0, failCleanup = false;
  const store: BatchDeletionStore = {
    exclusive: async work => work(),
    inventory: async () => structuredClone(inventory),
    receipt: id => receipts.get(id) ?? null,
    prepare(plan) {
      const receipt: BatchDeletionReceipt = { schemaVersion: 'batch-deletion-receipt-v2', plan, status: 'RECORDS_PENDING',
        preparedAt: '2026-09-14T12:00:00Z', committedAt: null, completedAt: null };
      receipts.set(plan.planId, receipt); return receipt;
    },
    advance(id) {
      let receipt = receipts.get(id)!;
      if (receipt.status === 'RECORDS_PENDING') {
        commits++; inventory = inventory.filter(node => !receipt.plan.deleteIds.includes(node.id));
        receipt = { ...receipt, status: 'CLEANUP_PENDING', committedAt: '2026-09-14T12:00:00Z' };
        receipts.set(id, receipt);
      }
      cleanups++; if (failCleanup) throw new Error('filesystem unavailable');
      const completed: BatchDeletionReceipt = { ...receipt, status: 'DELETED', completedAt: '2026-09-14T12:00:01Z' };
      receipts.set(id, completed); return completed;
    },
  };
  return { store, service: new BatchDeletions(store), counts: () => ({ commits, cleanups }), rows: () => inventory,
    change: (value: DeletionNode[]) => { inventory = value; }, fail: (value: boolean) => { failCleanup = value; } };
}
test('a new reference or active execution after preview prevents deletion without side effects', async () => {
  for (const change of ['reference', 'active']) {
    const f = fixture(), plan = await f.service.preview('batch');
    if (change === 'reference') f.change([...f.rows(), { id: 'other', kind: 'run', revision: '1', ownedBy: [], references: ['card'] }]);
    else f.change(f.rows().map(row => row.id === 'batch' ? { ...row, active: true } : row));
    await assert.rejects(f.service.confirm('batch', { planId: plan.planId, confirmed: true }), change === 'reference' ? /DELETION_CONFIRMATION_CHANGED/ : /DELETION_EXECUTION_ACTIVE/);
    assert.deepEqual(f.counts(), { commits: 0, cleanups: 0 });
    assert.ok(f.rows().some(row => row.id === 'card'));
  }
});
test('explicit confirmation is required and retry never commits twice', async () => {
  const f = fixture(), plan = await f.service.preview('batch');
  for (const input of [null, { planId: plan.planId }, { planId: plan.planId, confirmed: false }, { planId: plan.planId, confirmed: true, path: '/unsafe' }]) {
    await assert.rejects(f.service.confirm('batch', input), /DELETION_CONFIRMATION_CHANGED/);
  }
  assert.deepEqual(f.counts(), { commits: 0, cleanups: 0 });
  const confirmation = { planId: plan.planId, confirmed: true };
  const receipt = await f.service.confirm('batch', confirmation);
  assert.equal(receipt.status, 'DELETED');
  assert.deepEqual(await f.service.confirm('batch', confirmation), receipt);
  assert.deepEqual(f.counts(), { commits: 1, cleanups: 1 });
  await assert.rejects(f.service.confirm('other', confirmation), /DELETION_CONFIRMATION_CHANGED/);
  await assert.rejects(f.service.confirm('batch', { ...confirmation, confirmed: false }), /DELETION_CONFIRMATION_CHANGED/);
});
test('committed deletion remains pending on file failure and a new service resumes the same receipt', async () => {
  const f = fixture(), plan = await f.service.preview('batch'); f.fail(true);
  const receipt = await f.service.confirm('batch', { planId: plan.planId, confirmed: true });
  assert.equal(receipt.status, 'CLEANUP_PENDING'); assert.equal(receipt.completedAt, null);
  assert.equal(f.rows().length, 0); assert.deepEqual(f.counts(), { commits: 1, cleanups: 1 });
  f.fail(false); const restarted = new BatchDeletions(f.store);
  await assert.rejects(restarted.recover('other', plan.planId), /DELETION_RECEIPT_NOT_FOUND/);
  const recovered = await restarted.recover('batch', plan.planId);
  assert.equal(recovered.status, 'DELETED'); assert.equal(recovered.committedAt, receipt.committedAt);
  assert.deepEqual(f.counts(), { commits: 1, cleanups: 2 });
});
