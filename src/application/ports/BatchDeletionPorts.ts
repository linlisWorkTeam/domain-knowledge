/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义异步删除预览、维护互斥和持久恢复的统一边界。
 */
import type { BatchDeletionPlan, DeletionNode } from '../../domain/workbench/BatchDeletion.ts';
export interface BatchDeletionReceipt {
  schemaVersion: 'batch-deletion-receipt-v2'; plan: BatchDeletionPlan;
  status: 'RECORDS_PENDING' | 'CLEANUP_PENDING' | 'DELETED';
  preparedAt: string; committedAt: string | null; completedAt: string | null;
}
export interface BatchDeletionStore {
  /** 互斥覆盖异步库存读取、意图持久化、记录提交和文件清理；恢复也必须互斥。 */
  exclusive<T>(work: () => Promise<T>, recovery: boolean): Promise<T>;
  inventory(): Promise<DeletionNode[]>;
  receipt(planId: string): BatchDeletionReceipt | null;
  prepare(plan: BatchDeletionPlan): BatchDeletionReceipt;
  advance(planId: string): BatchDeletionReceipt;
}
