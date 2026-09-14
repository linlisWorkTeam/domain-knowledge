/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义批次删除的原子清单复核、持久回执和可恢复文件清理边界。
 */
import type { BatchDeletionPlan, DeletionNode } from '../../domain/workbench/BatchDeletion.ts';
export interface BatchDeletionReceipt {
  schemaVersion: 'batch-deletion-receipt-v1';
  plan: BatchDeletionPlan;
  status: 'CLEANUP_PENDING' | 'DELETED';
  committedAt: string;
  completedAt: string | null;
}
export interface BatchDeletionTransaction {
  inventory(): DeletionNode[];
  receipt(planId: string): BatchDeletionReceipt | null;
  /** 必须在同一事务中移除清单记录并持久化待清理回执；失败必须全部回滚。 */
  commit(plan: BatchDeletionPlan, now: string): BatchDeletionReceipt;
}
export interface BatchDeletionStore {
  /** 与执行器/写入者互斥；整个回调期间清单、活动状态和引用关系不得变化。 */
  transaction<T>(work: (transaction: BatchDeletionTransaction) => T): T;
  receipt(planId: string): BatchDeletionReceipt | null;
  /** 依据持久清理日志幂等清理，重新保护新增共享引用；不能按客户端路径删除文件。 */
  cleanup(planId: string): Promise<BatchDeletionReceipt>;
}
