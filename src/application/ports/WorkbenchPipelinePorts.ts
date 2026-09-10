/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义独立协调租约与不可变阶段交接的持久化端口。
 */
import type { WorkbenchPipeline } from '../../domain/services/workbench/WorkbenchPipeline.ts';
export interface WorkbenchPipelineStore {
  insert(value: WorkbenchPipeline): WorkbenchPipeline;
  get(id: string): WorkbenchPipeline | null;
  list(): WorkbenchPipeline[];
  claim(id: string): { value: WorkbenchPipeline; leaseId: string } | null;
  save(value: WorkbenchPipeline, leaseId: string, release?: boolean): void;
  cancel(id: string): WorkbenchPipeline;
  resume(id: string, inputDigest: string): WorkbenchPipeline;
  recover(): void;
  close(): void;
}
