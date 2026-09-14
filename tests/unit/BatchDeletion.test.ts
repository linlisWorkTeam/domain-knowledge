/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证删除预览保留共享依赖、活动执行及二次确认绑定。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { planBatchDeletion, assertBatchDeletionConfirmation, type DeletionNode } from '../../src/domain/workbench/BatchDeletion.ts';
const node = (id: string, kind: DeletionNode['kind'], ownedBy: string[] = [], references: string[] = []): DeletionNode => ({ id, kind, revision: '1', ownedBy, references });
test('delete a batch and exclusively owned results while preserving shared knowledge and its files', () => {
  const nodes = [node('a', 'batch'), node('b', 'batch', [], ['shared']), node('stage', 'stage', ['a']),
    node('private', 'knowledge', ['stage']), node('private-file', 'artifact', ['private']),
    node('shared', 'knowledge', ['stage']), node('shared-index', 'index', ['shared']), node('shared-file', 'artifact', ['shared']),
    node('source', 'source', ['a']), node('configuration', 'configuration', ['a'])];
  const plan = planBatchDeletion('a', nodes);
  assert.deepEqual(plan.deleteIds, ['a', 'private', 'private-file', 'stage']);
  assert.deepEqual(plan.preservedIds, ['configuration', 'shared', 'shared-file', 'shared-index', 'source']);
  assert.deepEqual(plan.counts, { batch: 1, knowledge: 1, artifact: 1, stage: 1 });
  assertBatchDeletionConfirmation(plan, { planId: plan.planId, confirmed: true });
  assert.equal(planBatchDeletion('a', [...nodes].reverse()).planId, plan.planId);
  const changed = nodes.map(value => value.id === 'private' ? { ...value, revision: '2' } : value);
  assert.throws(() => assertBatchDeletionConfirmation(planBatchDeletion('a', changed), { planId: plan.planId, confirmed: true }), /DELETION_CONFIRMATION_CHANGED/);
  assert.throws(() => assertBatchDeletionConfirmation(plan, { planId: plan.planId, confirmed: false }), /DELETION_CONFIRMATION_CHANGED/);
});
test('active descendants, referenced targets and incomplete inventories cannot be deleted', () => {
  assert.throws(() => planBatchDeletion('a', [node('a', 'run'), { ...node('stage', 'stage', ['a']), active: true }]), /DELETION_EXECUTION_ACTIVE/);
  assert.throws(() => planBatchDeletion('a', [node('a', 'run'), node('b', 'run', [], ['a'])]), /DELETION_TARGET_REFERENCED/);
  assert.throws(() => planBatchDeletion('a', [node('a', 'run', [], ['missing'])]), /DELETION_INVENTORY_INVALID/);
  const plan = planBatchDeletion('a', [node('a', 'run'), node('b', 'run'), node('shared', 'artifact', ['a', 'b'])]);
  assert.deepEqual(plan.deleteIds, ['a']); assert.deepEqual(plan.preservedIds, ['shared']);
});

test('inventory validation rejects ambiguous records and canonicalizes object property order', () => {
  const valid = node('a', 'batch');
  for (const value of [null, { ...valid, kind: 'unknown' }, { ...valid, active: 'false' }, { ...valid, references: ['a', 'a'] }, { ...valid, extra: 'ignored?' }]) {
    assert.throws(() => planBatchDeletion('a', [value as DeletionNode]), /DELETION_INVENTORY_INVALID/);
  }
  const reordered: DeletionNode = { bytes: 0, references: [], ownedBy: [], revision: '1', active: false, kind: 'batch', id: 'a' };
  assert.equal(planBatchDeletion('a', [valid]).planId, planBatchDeletion('a', [reordered]).planId);
});
