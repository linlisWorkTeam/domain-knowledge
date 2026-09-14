/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义模块批次、可读编号与自动运行频率。
 */
export const BATCH_CONTRACT = 'workbench-batch-v1';
export type BatchStatus = 'READY' | 'QUEUED' | 'RUNNING' | 'PAUSED' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
export interface BatchSchedule { enabled: boolean; intervalMinutes: number | null }
export interface BatchRound {
  number: number; executionKey: string; pipelineId: string | null; status: BatchStatus;
  createdAt: string; startedAt: string | null; completedAt: string | null; reasonCode: string | null;
}
export interface WorkbenchBatch {
  contractVersion: typeof BATCH_CONTRACT; batchId: string; projectId: string; snapshotId: string; moduleId: string;
  schedule: BatchSchedule; nextRunAt: string | null; status: BatchStatus; rounds: BatchRound[];
  createdAt: string; updatedAt: string;
}
export function batchSchedule(input: unknown): BatchSchedule {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('BATCH_SCHEDULE_INVALID');
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !['enabled', 'intervalMinutes'].includes(key)) || typeof value.enabled !== 'boolean') throw new Error('BATCH_SCHEDULE_INVALID');
  if (!value.enabled) {
    if (value.intervalMinutes !== undefined && value.intervalMinutes !== null) throw new Error('BATCH_SCHEDULE_INVALID');
    return { enabled: false, intervalMinutes: null };
  }
  if (!Number.isSafeInteger(value.intervalMinutes) || Number(value.intervalMinutes) < 1 || Number(value.intervalMinutes) > 525600) throw new Error('BATCH_SCHEDULE_INVALID');
  return { enabled: true, intervalMinutes: Number(value.intervalMinutes) };
}
/** 编号日期固定使用北京时间，跨客户端时区不会产生不同序列。 */
export function batchDate(now: string): string {
  const time = Date.parse(now); if (!Number.isFinite(time)) throw new Error('BATCH_TIME_INVALID');
  return new Date(time + 8 * 60 * 60 * 1000).toISOString().slice(0, 10).replaceAll('-', '');
}
export function batchName(moduleId: string, now: string, sequence: number): string {
  if (!moduleId || moduleId.length > 256 || !Number.isSafeInteger(sequence) || sequence < 1) throw new Error('BATCH_ID_INVALID');
  // 原有模块标识允许路径；保留可读性但不把路径分隔符带入批次号。
  const name = moduleId.replaceAll('/', '-');
  return `${name}-${batchDate(now)}-${sequence}`;
}
export function appendBatchRound(batch: WorkbenchBatch, now: string): WorkbenchBatch {
  if (batch.rounds.some(round => ['QUEUED', 'RUNNING'].includes(round.status))) throw new Error('BATCH_ROUND_ACTIVE');
  const number = batch.rounds.length + 1;
  const round: BatchRound = { number, executionKey: `${batch.projectId}/${batch.batchId}/${number}`, pipelineId: null,
    status: 'QUEUED', createdAt: now, startedAt: null, completedAt: null, reasonCode: null };
  return { ...batch, status: 'QUEUED', rounds: [...batch.rounds, round], updatedAt: now };
}
export function nextBatchRun(schedule: BatchSchedule, now: string): string | null {
  if (!schedule.enabled) return null;
  return new Date(Date.parse(now) + schedule.intervalMinutes! * 60_000).toISOString();
}
