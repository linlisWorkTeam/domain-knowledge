/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义模块批次的持久化队列与执行租约。
 */
import type { BatchSchedule, WorkbenchBatch } from '../../domain/workbench/WorkbenchBatch.ts';
export interface BatchCreation { projectId: string; snapshotId: string; moduleId: string; schedule: BatchSchedule }
export interface WorkbenchBatchStore {
  create(input: BatchCreation, commandId: string, now: string): WorkbenchBatch;
  get(batchId: string): WorkbenchBatch | null;
  list(projectId?: string): WorkbenchBatch[];
  enqueue(batchId: string, now: string): WorkbenchBatch;
  claim(batchId: string, now: string): { batch: WorkbenchBatch; leaseId: string } | null;
  save(batch: WorkbenchBatch, leaseId: string, release: boolean): void;
  close(): void;
}
