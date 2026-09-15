/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：将统一删除端口连接到跨库持久恢复，不另行实现单库删除引擎。
 */
import type { BatchDeletionPlan, DeletionNode } from '../../domain/workbench/BatchDeletion.ts';
import type { BatchDeletionReceipt, BatchDeletionStore } from '../../application/ports/BatchDeletionPorts.ts';
import type { SqliteDeletionRecovery } from './SqliteDeletionRecovery.ts';
export class SqliteBatchDeletions implements BatchDeletionStore {
  private readonly recovery: SqliteDeletionRecovery;
  private readonly readInventory: () => Promise<DeletionNode[]>;
  private readonly boundary: BatchDeletionStore['exclusive'];
  constructor(input: { recovery: SqliteDeletionRecovery; inventory: () => Promise<DeletionNode[]>; exclusive: BatchDeletionStore['exclusive'] }) {
    this.recovery = input.recovery; this.readInventory = input.inventory; this.boundary = input.exclusive;
  }
  exclusive<T>(work: () => Promise<T>, recovery: boolean): Promise<T> { return this.boundary(work, recovery); }
  async inventory(): Promise<DeletionNode[]> { this.recovery.assertAvailable(); return this.readInventory(); }
  receipt(planId: string): BatchDeletionReceipt | null {
    const record = this.recovery.get(planId); if (!record) return null;
    return { schemaVersion: 'batch-deletion-receipt-v2', plan: record.intent.plan,
      status: record.phase === 'COMPLETE' ? 'DELETED' : record.phase === 'RECORDS_COMMITTED' ? 'CLEANUP_PENDING' : 'RECORDS_PENDING',
      preparedAt: record.intent.preparedAt, committedAt: record.committedAt, completedAt: record.completedAt };
  }
  pending(): BatchDeletionReceipt[] { return this.recovery.pending().map(record => this.receipt(record.intent.plan.planId)!); }
  prepare(plan: BatchDeletionPlan): BatchDeletionReceipt { this.recovery.prepare(plan); return this.receipt(plan.planId)!; }
  advance(planId: string): BatchDeletionReceipt {
    this.recovery.applyRecords(planId); this.recovery.completeAfterFiles(planId); return this.receipt(planId)!;
  }
}
