/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：提供Demo报告的外部入口、参数转换与响应处理。
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ArtifactRef } from '../../domain/Domain.ts';
import type { ArtifactStore } from '../../application/ports/ApplicationPorts.ts';
import type { KnowledgeFlywheelService } from '../../application/services/ApplicationServices.ts';
import type { SQLiteFlywheelRepository } from '../../infrastructure/sqlite/SqliteCas.ts';
import { ConsoleReadModel } from './ConsoleReadModel.ts';

interface SafeAgentCall {
  /** 提供session标识信息，供调用方读取或传入。 */
  sessionId?: string;
  /** 提供提供方信息，供调用方读取或传入。 */
  provider: string;
  /** 提供role信息，供调用方读取或传入。 */
  role: string;
  /** 提供幂等键信息，供调用方读取或传入。 */
  idempotencyKey: string;
  /** 提供workspace根目录信息，供调用方读取或传入。 */
  workspaceRoot: string;
  /** 提供提示词SHA256信息，供调用方读取或传入。 */
  promptSha256: string;
  /** 提供SchemaSHA256信息，供调用方读取或传入。 */
  schemaSha256: string;
  /** 提供启动时间信息，供调用方读取或传入。 */
  startedAt: string;
  /** 提供完成时间信息，供调用方读取或传入。 */
  completedAt: string;
  /** 提供耗时毫秒信息，供调用方读取或传入。 */
  durationMs: number;
  /** 提供状态信息，供调用方读取或传入。 */
  status: string;
  /** 提供错误Code信息，供调用方读取或传入。 */
  errorCode: string | null;
  /** 提供notification数量信息，供调用方读取或传入。 */
  notificationCount: number | null;
  /** 提供元数据信息，供调用方读取或传入。 */
  metadata: Record<string, string | number | boolean | null>;
}

interface SafeProviderInvocation {
  /** 提供提供方信息，供调用方读取或传入。 */
  provider: string;
  /** 提供role信息，供调用方读取或传入。 */
  role: string;
  /** 提供启动时间信息，供调用方读取或传入。 */
  startedAt: string;
  /** 提供完成时间信息，供调用方读取或传入。 */
  completedAt: string;
  /** 提供耗时毫秒信息，供调用方读取或传入。 */
  durationMs: number;
  /** 提供状态信息，供调用方读取或传入。 */
  status: string;
  /** 提供retry数量信息，供调用方读取或传入。 */
  retryCount: number;
  /** 提供correlation信息，供调用方读取或传入。 */
  correlation?: Record<string, string | number>;
  /** 提供Token信息，供调用方读取或传入。 */
  tokens: {
    input: number | null;
    output: number | null;
    cacheRead: number | null;
    cacheWrite: number | null;
    total: number | null;
  };
  /** 提供估算费用美元信息，供调用方读取或传入。 */
  estimatedCostUsd: number | null;
  /** 提供错误Code信息，供调用方读取或传入。 */
  errorCode: string | null;
}

function artifactRef(value: unknown): ArtifactRef | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.artifactId === 'string'
    && typeof candidate.sha256 === 'string'
    && typeof candidate.mediaType === 'string'
    && typeof candidate.size === 'number'
    ? candidate as unknown as ArtifactRef
    : null;
}

function collectArtifactRefs(value: unknown, target = new Map<string, ArtifactRef>()): Map<string, ArtifactRef> {
  const ref = artifactRef(value);
  if (ref) {
    target.set(ref.artifactId, ref);
    return target;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectArtifactRefs(item, target);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) collectArtifactRefs(item, target);
  }
  return target;
}

function safeAgentCalls(runtimeDir: string): { calls: SafeAgentCall[]; ignoredLines: number } {
  const path = join(runtimeDir, 'demo', 'agent-runs.jsonl');
  if (!existsSync(path)) return { calls: [], ignoredLines: 0 };
  const calls: SafeAgentCall[] = [];
  let ignoredLines = 0;
  for (const line of readFileSync(path, 'utf8').split('\n').filter(Boolean)) {
    try {
      const record = JSON.parse(line) as Record<string, unknown>;
      calls.push({
        provider: String(record.provider ?? ''),
        ...(typeof record.sessionId === 'string' ? { sessionId: record.sessionId } : {}),
        role: String(record.role ?? ''),
        idempotencyKey: String(record.idempotencyKey ?? ''),
        workspaceRoot: String(record.workspaceRoot ?? ''),
        promptSha256: String(record.promptSha256 ?? ''),
        schemaSha256: String(record.schemaSha256 ?? ''),
        startedAt: String(record.startedAt ?? ''),
        completedAt: String(record.completedAt ?? ''),
        durationMs: Number(record.durationMs ?? 0),
        status: String(record.status ?? ''),
        errorCode: record.errorCode === null ? null : String(record.errorCode ?? ''),
        notificationCount: record.notificationCount === undefined ? null : Number(record.notificationCount),
        metadata: record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
          ? record.metadata as SafeAgentCall['metadata']
          : {},
      });
    } catch {
      ignoredLines += 1;
    }
  }
  return { calls, ignoredLines };
}

function safeProviderInvocations(
  repository: SQLiteFlywheelRepository,
  runId: string,
): SafeProviderInvocation[] {
  const table = repository.database.prepare(`
    SELECT 1 AS present FROM sqlite_master
    WHERE type = 'table' AND name = 'provider_invocations'
  `).get() as Record<string, unknown> | undefined;
  if (!table) return [];
  const rows = repository.database.prepare(`
    SELECT agent_id, provider, started_at, completed_at, duration_ms, status,
      retry_count, input_tokens, output_tokens, cache_read_tokens,
      cache_write_tokens, estimated_cost_usd, error_code
    FROM provider_invocations
    WHERE run_id = ?
    ORDER BY started_at, invocation_id
  `).all(runId) as Record<string, unknown>[];
  const optionalNumber = (value: unknown): number | null => value === null ? null : Number(value);
  return rows.map((row) => {
    const input = optionalNumber(row.input_tokens);
    const output = optionalNumber(row.output_tokens);
    const cacheRead = optionalNumber(row.cache_read_tokens);
    const cacheWrite = optionalNumber(row.cache_write_tokens);
    return {
      provider: String(row.provider),
      role: String(row.agent_id),
      startedAt: String(row.started_at),
      completedAt: String(row.completed_at),
      durationMs: Number(row.duration_ms),
      status: String(row.status),
      retryCount: Number(row.retry_count),
      tokens: {
        input,
        output,
        cacheRead,
        cacheWrite,
        total: input === null || output === null
          ? null : input + output + (cacheRead ?? 0) + (cacheWrite ?? 0),
      },
      estimatedCostUsd: optionalNumber(row.estimated_cost_usd),
      errorCode: row.error_code === null ? null : String(row.error_code),
    };
  });
}

function callKey(call: SafeAgentCall | SafeProviderInvocation): string {
  return JSON.stringify([
    call.provider === 'deepseek-harness-sdk' ? 'deepseek-harness' : call.provider, call.role, call.startedAt, call.completedAt,
    call.durationMs, call.status, call.errorCode,
  ]);
}

function mergeAgentCalls(
  fileCalls: SafeAgentCall[],
  providerCalls: SafeProviderInvocation[],
): Array<SafeAgentCall | SafeProviderInvocation> {
  const result: Array<SafeAgentCall | SafeProviderInvocation> = [...fileCalls];
  const positions = new Map<string, number[]>();
  result.forEach((call, index) => {
    const key = callKey(call);
    positions.set(key, [...(positions.get(key) ?? []), index]);
  });
  for (const call of providerCalls) {
    const key = callKey(call);
    const duplicate = positions.get(key)?.shift();
    if (duplicate === undefined) {
      result.push(call);
    } else {
      // Prefer the Registry projection because it carries controlled usage
      // fields and cannot contain prompt, path, or credential material.
      const original = result[duplicate];
      const correlation: Record<string, string | number> = {};
      if (original && 'metadata' in original && original.provider === 'deepseek-harness-sdk') {
        if (original.sessionId) correlation.sessionId = original.sessionId;
        for (const key of ['runId', 'nodeId', 'commandId', 'iteration', 'attempt', 'providerAttempt']) {
          const value = original.metadata[key];
          if (typeof value === 'string' || typeof value === 'number') correlation[key] = value;
        }
      }
      result[duplicate] = Object.keys(correlation).length ? { ...call, correlation } : call;
    }
  }
  return result;
}

/** 构造Demo报告。 */
export async function buildDemoReport(input: {
  runId: string;
  runtimeDir: string;
  repository: SQLiteFlywheelRepository;
  service: KnowledgeFlywheelService;
  artifacts: ArtifactStore;
  clock?: () => Date;
}): Promise<Record<string, unknown>> {
  const snapshot = new ConsoleReadModel(input.repository.database).getRunSnapshot(
    input.runId,
    input.service.listKnowledgeVersions(),
  );
  if (!snapshot) throw new Error(`NOT_FOUND: run ${input.runId}`);
  const refs = [...collectArtifactRefs(snapshot).values()];
  const verification = await Promise.all(refs.map(async (ref) => ({
    artifactId: ref.artifactId,
    verified: await input.artifacts.verify(ref),
  })));
  const agentAudit = safeAgentCalls(input.runtimeDir);
  const fileCalls = agentAudit.calls.filter((call) => call.metadata.runId === input.runId);
  const providerCalls = safeProviderInvocations(input.repository, input.runId);
  return {
    schemaVersion: '1.0',
    reportKind: 'wpknowledge-governance-demo',
    generatedAt: (input.clock ?? (() => new Date()))().toISOString(),
    evidenceBoundary: '报告只导出 Registry 业务事实、Artifact 完整性结果和脱敏 Agent 调用摘要；不包含 Prompt 正文、模型正文、Session 日志或凭据。',
    snapshot,
    agentCalls: mergeAgentCalls(fileCalls, providerCalls),
    ignoredAgentAuditLines: agentAudit.ignoredLines,
    artifactIntegrity: {
      total: verification.length,
      verified: verification.filter((result) => result.verified).length,
      failed: verification.filter((result) => !result.verified),
    },
  };
}
