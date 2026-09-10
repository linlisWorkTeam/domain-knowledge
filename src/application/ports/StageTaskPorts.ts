/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义阶段任务事务、审计、执行租约与恢复检查点端口。
 */
import type { JsonValue, StageCheckpoint, StageEvent, StageResult, StageTask, StageUsage } from '../../domain/services/workbench/StageTask.ts';

/** 同一个持久化任务库只允许一项 RUNNING；leaseId 防止旧执行者写回。 */
export interface StageTaskStore {
  insert(task: StageTask): StageTask;
  get(taskId: string): StageTask | null;
  list(projectId?: string): StageTask[];
  claim(taskId: string): { task: StageTask; leaseId: string } | null;
  resume(taskId: string, expectedInputDigest: string): StageTask;
  cancel(taskId: string): StageTask;
  pausePending(taskId: string, reasonCode: string): StageTask;
  finish(taskId: string, leaseId: string, status: 'SUCCEEDED' | 'FAILED' | 'PAUSED' | 'CANCELLED', result: StageResult | null, reasonCode: string | null): StageTask;
  addUsage(taskId: string, leaseId: string, operationId: string, delta: Partial<StageUsage>): StageTask;
  elapsed(taskId: string, leaseId: string, deltaMs: number): StageTask;
  checkpoint(taskId: string, leaseId: string, key: string, result: StageResult): StageCheckpoint;
  checkpoints(taskId: string): StageCheckpoint[];
  event(taskId: string, leaseId: string, kind: string, detail: JsonValue): void;
  events(taskId: string, after?: number): StageEvent[];
  recoverOrphans(): number;
  close(): void;
}
