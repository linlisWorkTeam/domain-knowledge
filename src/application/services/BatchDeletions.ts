/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：将删除预览、二次确认和失败后清理恢复组织为统一用例。
 */
import { assertBatchDeletionConfirmation, planBatchDeletion } from '../../domain/workbench/BatchDeletion.ts';
import type { BatchDeletionReceipt, BatchDeletionStore } from '../ports/BatchDeletionPorts.ts';
export class BatchDeletions {
  private readonly store: BatchDeletionStore;
  private readonly clock: () => string;
  constructor(store: BatchDeletionStore, clock = () => new Date().toISOString()) { this.store = store; this.clock = clock; }
  preview(targetId: string) {
    return this.store.transaction(transaction => planBatchDeletion(targetId, transaction.inventory()));
  }
  async confirm(targetId: string, confirmation: unknown): Promise<BatchDeletionReceipt> {
    const receipt = this.store.transaction(transaction => {
      const planId = confirmation && typeof confirmation === 'object' && 'planId' in confirmation && typeof confirmation.planId === 'string'
        ? confirmation.planId : '';
      const prior = planId ? transaction.receipt(planId) : null;
      if (prior) {
        if (prior.plan.targetId !== targetId) throw new Error('DELETION_CONFIRMATION_CHANGED');
        assertBatchDeletionConfirmation(prior.plan, confirmation);
        return prior;
      }
      const plan = planBatchDeletion(targetId, transaction.inventory());
      assertBatchDeletionConfirmation(plan, confirmation);
      return transaction.commit(plan, this.clock());
    });
    return this.complete(receipt);
  }
  async recover(targetId: string, planId: string): Promise<BatchDeletionReceipt> {
    const receipt = this.store.receipt(planId);
    if (!receipt || receipt.plan.targetId !== targetId) throw new Error('DELETION_RECEIPT_NOT_FOUND');
    return this.complete(receipt);
  }
  private async complete(receipt: BatchDeletionReceipt): Promise<BatchDeletionReceipt> {
    if (receipt.plan.schemaVersion !== 'batch-deletion-v2') throw new Error('DELETION_CONTRACT_INCOMPATIBLE');
    if (receipt.status === 'DELETED') return receipt;
    try { return await this.store.cleanup(receipt.plan.planId); }
    catch {
      // 数据提交后清理失败不是“删除全部完成”；原回执支持进程重启后继续清理。
      const persisted = this.store.receipt(receipt.plan.planId);
      if (!persisted) throw new Error('DELETION_RECEIPT_NOT_FOUND');
      return persisted;
    }
  }
}
