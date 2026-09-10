/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义五阶段任务的冻结输入、恢复边界和累计预算规则。
 */
import { sha256, type ArtifactRef } from '../../Domain.ts';

/** 执行语义与旧七角色批次隔离；只允许同契约恢复。 */
export const STAGE_CONTRACT = 'knowledge-workbench-v1' as const;
export const WORKBENCH_STAGES = ['GENERATE', 'INDEX', 'FLYWHEEL', 'EVALUATE', 'ASSOCIATE'] as const;
export type WorkbenchStage = typeof WORKBENCH_STAGES[number];
export type StageStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'PAUSED' | 'CANCELLED';
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** 只存公开配置及材料引用；禁止把凭据放进阶段快照。 */
export interface StageInput {
  projectId: string;
  stage: WorkbenchStage;
  sourceRevision: string;
  sourceDigest: string;
  cardVersionIds: string[];
  configurationDigest: string;
  parameters: { [key: string]: JsonValue };
}
/** reservedTokens 是调用前的保守预留，tokens 是供应商已报告的实际用量。 */
export interface StageUsage { modelCalls: number; reservedTokens: number; tokens: number; elapsedMs: number }
export interface StageLimits { modelCalls?: number; reservedTokens?: number; elapsedMs?: number }
export interface StageResult { artifactRefs: ArtifactRef[]; summary: { [key: string]: JsonValue } }
export interface StageTask {
  taskId: string;
  contractVersion: string;
  inputDigest: string;
  input: StageInput;
  limits: StageLimits;
  status: StageStatus;
  attempt: number;
  revision: number;
  usage: StageUsage;
  cancelRequested: boolean;
  result: StageResult | null;
  reasonCode: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface StageCheckpoint { key: string; result: StageResult; createdAt: string }
export interface StageEvent { sequence: number; taskId: string; kind: string; detail: JsonValue; createdAt: string }

/** JSON 的对象键排序；拒绝 undefined、非有限数、循环及复杂对象，避免指纹悄悄丢字段。 */
export function canonicalJson(value: unknown): string {
  const ancestors = new Set<object>();
  const visit = (item: unknown, depth: number): JsonValue => {
    if (depth > 32) throw new Error('STAGE_INPUT_INVALID');
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (!item || typeof item !== 'object' || ancestors.has(item)) throw new Error('STAGE_INPUT_INVALID');
    if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype) throw new Error('STAGE_INPUT_INVALID');
    ancestors.add(item);
    const result: JsonValue = Array.isArray(item) ? item.map((entry) => visit(entry, depth + 1))
      : Object.fromEntries(Object.keys(item).sort().map((key) => [key, visit((item as Record<string, unknown>)[key], depth + 1)]));
    ancestors.delete(item);
    return result;
  };
  const result = JSON.stringify(visit(value, 0));
  if (result.length > 262_144) throw new Error('STAGE_INPUT_TOO_LARGE');
  return result;
}

/** 任务身份绑定完整输入和预算；客户端重复启动不能生成第二份同输入任务。 */
export function createStageTask(input: StageInput, limits: StageLimits, now: string): StageTask {
  if (!input || !WORKBENCH_STAGES.includes(input.stage)
    || ![input.projectId, input.sourceRevision, input.sourceDigest, input.configurationDigest]
      .every((value) => typeof value === 'string' && value.length > 0 && value.length <= 1024)
    || !Array.isArray(input.cardVersionIds) || input.cardVersionIds.length > 1000
    || !input.cardVersionIds.every((value) => typeof value === 'string' && value.length > 0 && value.length <= 256)
    || !input.parameters || Array.isArray(input.parameters) || typeof input.parameters !== 'object') throw new Error('STAGE_INPUT_INVALID');
  if (Object.keys(limits).some((key) => !['modelCalls', 'reservedTokens', 'elapsedMs'].includes(key))
    || Object.values(limits).some((value) => !Number.isSafeInteger(value) || value < 1)) throw new Error('STAGE_LIMIT_INVALID');
  const frozen = JSON.parse(canonicalJson({ input, limits })) as { input: StageInput; limits: StageLimits };
  const inputDigest = sha256(canonicalJson({ contractVersion: STAGE_CONTRACT, ...frozen }));
  return { taskId: `stage-${inputDigest}`, contractVersion: STAGE_CONTRACT, inputDigest,
    ...frozen, status: 'PENDING', attempt: 0, revision: 0,
    usage: { modelCalls: 0, reservedTokens: 0, tokens: 0, elapsedMs: 0 },
    cancelRequested: false, result: null, reasonCode: null, createdAt: now, updatedAt: now };
}

/** 已结束任务显式恢复；已成功任务只读复用，预算不重新初始化。 */
export function assertStageResumable(task: StageTask, expectedInputDigest: string): void {
  if (task.contractVersion !== STAGE_CONTRACT) throw new Error('STAGE_CONTRACT_INCOMPATIBLE');
  if (task.inputDigest !== expectedInputDigest) throw new Error('STAGE_INPUT_CHANGED');
  if (!['FAILED', 'PAUSED', 'CANCELLED'].includes(task.status)) throw new Error('STAGE_NOT_RESUMABLE');
  assertStageBudget(task, {});
}

/** 在外部请求前检查预留预算；不能把供应商额度查询失败转换成无上限。 */
export function assertStageBudget(task: StageTask, delta: Partial<StageUsage>): void {
  if (Object.keys(delta).some((key) => !['modelCalls', 'reservedTokens', 'tokens', 'elapsedMs'].includes(key))
    || Object.values(delta).some((value) => !Number.isSafeInteger(value) || value < 0)) throw new Error('STAGE_USAGE_INVALID');
  for (const key of ['modelCalls', 'reservedTokens', 'elapsedMs'] as const) {
    const limit = task.limits[key];
    if (limit !== undefined && ((Object.keys(delta).length === 0 && task.usage[key] >= limit) || ((delta[key] ?? 0) > 0 && task.usage[key] + (delta[key] ?? 0) > limit))) {
      throw new Error('STAGE_BUDGET_EXHAUSTED');
    }
  }
}
