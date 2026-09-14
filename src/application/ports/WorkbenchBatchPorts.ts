/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义模块批次的持久化队列与执行租约。
 */
import type { BatchExecution, BatchSchedule, WorkbenchBatch } from '../../domain/workbench/WorkbenchBatch.ts';
export interface BatchCreation { projectId: string; snapshotId: string; moduleId: string; schedule: BatchSchedule; execution?: BatchExecution }
export interface WorkbenchBatchStore {
  create(input: BatchCreation, commandId: string, now: string): WorkbenchBatch;
  get(batchId: string): WorkbenchBatch | null;
  list(projectId?: string): WorkbenchBatch[];
  enqueue(batchId: string, now: string, commandId?: string): WorkbenchBatch;
  claim(batchId: string, now: string): { batch: WorkbenchBatch; leaseId: string } | null;
  save(batch: WorkbenchBatch, leaseId: string, release: boolean): void;
  resume(batchId: string, now: string, commandId?: string): WorkbenchBatch;
  cancel(batchId: string, now: string, commandId?: string): WorkbenchBatch;
  recover(now: string): void;
  close(): void;
}
