/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：统一异步预览、二次确认和持久删除恢复，保留前序提交状态。
 */
import { assertBatchDeletionConfirmation, planBatchDeletion } from '../../domain/workbench/BatchDeletion.ts';
import type { BatchDeletionReceipt, BatchDeletionStore } from '../ports/BatchDeletionPorts.ts';
export class BatchDeletions {
  private readonly store: BatchDeletionStore;
  constructor(store: BatchDeletionStore) { this.store = store; }
  preview(targetId: string) {
    return this.store.exclusive(async () => planBatchDeletion(targetId, await this.store.inventory()), false);
  }
  async confirm(targetId: string, confirmation: unknown): Promise<BatchDeletionReceipt> {
    const planId = confirmation && typeof confirmation === 'object' && 'planId' in confirmation && typeof confirmation.planId === 'string'
      ? confirmation.planId : '';
    // 只读持久意图以选择恢复屏障；锁内重新读取并验证确认内容。
    const recovery = !!(planId && this.store.receipt(planId));
    return this.store.exclusive(async () => {
      let receipt = planId ? this.store.receipt(planId) : null;
      if (receipt) {
        if (receipt.plan.targetId !== targetId) throw new Error('DELETION_CONFIRMATION_CHANGED');
        assertBatchDeletionConfirmation(receipt.plan, confirmation);
      } else {
        const plan = planBatchDeletion(targetId, await this.store.inventory());
        assertBatchDeletionConfirmation(plan, confirmation);
        receipt = this.store.prepare(plan);
      }
      return this.complete(receipt);
    }, recovery);
  }
  recover(targetId: string, planId: string): Promise<BatchDeletionReceipt> {
    return this.store.exclusive(async () => {
      const receipt = this.store.receipt(planId);
      if (!receipt || receipt.plan.targetId !== targetId) throw new Error('DELETION_RECEIPT_NOT_FOUND');
      return this.complete(receipt);
    }, true);
  }
  private complete(receipt: BatchDeletionReceipt): BatchDeletionReceipt {
    if (receipt.plan.schemaVersion !== 'batch-deletion-v2' || receipt.schemaVersion !== 'batch-deletion-receipt-v2') throw new Error('DELETION_CONTRACT_INCOMPATIBLE');
    if (receipt.status === 'DELETED') return receipt;
    try { return this.store.advance(receipt.plan.planId); }
    catch {
      const pending = this.store.receipt(receipt.plan.planId);
      if (!pending) throw new Error('DELETION_RECEIPT_NOT_FOUND');
      return pending; // 持久阶段区分记录未提交与文件未清理，不传播底层敏感异常。
    }
  }
}
