/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：将批次删除清单与记录移除原子提交，并持久化可恢复清理回执。
 */
import { DatabaseSync } from 'node:sqlite';
import type { BatchDeletionPlan, DeletionNode } from '../../domain/workbench/BatchDeletion.ts';
import type { BatchDeletionReceipt, BatchDeletionStore, BatchDeletionTransaction } from '../../application/ports/BatchDeletionPorts.ts';
export interface DeletionProjection {
  /** 所有记录须来自传入连接所锁定的数据库；不得打开额外写连接。 */
  inventory(database: DatabaseSync): DeletionNode[];
  /** 仅删除已确认清单；持久化编号/预算墓碑并保留共享引用。 */
  remove(database: DatabaseSync, plan: BatchDeletionPlan): void;
}
export class SqliteBatchDeletions implements BatchDeletionStore {
  private readonly db: DatabaseSync;
  private readonly projection: DeletionProjection;
  private readonly removeFiles: (plan: BatchDeletionPlan) => Promise<void>;
  private readonly cleaning = new Map<string, Promise<BatchDeletionReceipt>>();
  constructor(database: DatabaseSync, projection: DeletionProjection, removeFiles: (plan: BatchDeletionPlan) => Promise<void>) {
    this.db = database; this.projection = projection; this.removeFiles = removeFiles;
    this.db.exec(`CREATE TABLE IF NOT EXISTS wb_deletion_receipts (
      plan_id TEXT PRIMARY KEY, target_id TEXT NOT NULL, status TEXT NOT NULL,
      record TEXT NOT NULL, cleanup_attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT, updated_at TEXT NOT NULL
    )`);
  }
  receipt(planId: string): BatchDeletionReceipt | null {
    const row = this.db.prepare('SELECT record FROM wb_deletion_receipts WHERE plan_id=?').get(planId);
    return row ? JSON.parse(String(row.record)) as BatchDeletionReceipt : null;
  }
  pending(): BatchDeletionReceipt[] {
    return this.db.prepare("SELECT record FROM wb_deletion_receipts WHERE status='CLEANUP_PENDING' ORDER BY updated_at,plan_id")
      .all().map(row => JSON.parse(String(row.record)) as BatchDeletionReceipt);
  }
  transaction<T>(work: (transaction: BatchDeletionTransaction) => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = work({ inventory: () => this.projection.inventory(this.db), receipt: id => this.receipt(id),
        commit: (plan, now) => {
          if (this.receipt(plan.planId)) throw new Error('DELETION_ALREADY_COMMITTED');
          this.projection.remove(this.db, plan);
          const receipt: BatchDeletionReceipt = { schemaVersion: 'batch-deletion-receipt-v1', plan,
            status: 'CLEANUP_PENDING', committedAt: now, completedAt: null };
          this.db.prepare('INSERT INTO wb_deletion_receipts(plan_id,target_id,status,record,updated_at) VALUES(?,?,?,?,?)')
            .run(plan.planId, plan.targetId, receipt.status, JSON.stringify(receipt), now);
          return receipt;
        },
      });
      this.db.exec('COMMIT'); return result;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  cleanup(planId: string): Promise<BatchDeletionReceipt> {
    const pending = this.cleaning.get(planId); if (pending) return pending;
    const operation = this.clean(planId).finally(() => { this.cleaning.delete(planId); });
    this.cleaning.set(planId, operation); return operation;
  }
  private async clean(planId: string): Promise<BatchDeletionReceipt> {
    const receipt = this.receipt(planId);
    if (!receipt) throw new Error('DELETION_RECEIPT_NOT_FOUND');
    if (receipt.status === 'DELETED') return receipt;
    this.db.prepare('UPDATE wb_deletion_receipts SET cleanup_attempts=cleanup_attempts+1,updated_at=? WHERE plan_id=?')
      .run(new Date().toISOString(), planId);
    try {
      await this.removeFiles(receipt.plan);
      const completed: BatchDeletionReceipt = { ...receipt, status: 'DELETED', completedAt: new Date().toISOString() };
      this.db.prepare("UPDATE wb_deletion_receipts SET status='DELETED',record=?,last_error=NULL,updated_at=? WHERE plan_id=?")
        .run(JSON.stringify(completed), completed.completedAt, planId);
      return completed;
    } catch (error) {
      // 不把可能含文件路径、模型配置或凭据的底层异常写入用户回执。
      this.db.prepare('UPDATE wb_deletion_receipts SET last_error=?,updated_at=? WHERE plan_id=?')
        .run('DELETION_CLEANUP_FAILED', new Date().toISOString(), planId);
      throw error;
    }
  }
}
