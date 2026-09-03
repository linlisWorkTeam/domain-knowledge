import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ArtifactRef } from '../../domain/index.ts';
import type { ArtifactStore } from '../../application/ports/index.ts';
import type { KnowledgeFlywheelService } from '../../application/services/index.ts';
import type { SQLiteFlywheelRepository } from '../../infrastructure/persistence/sqlite-cas/index.ts';
import { ConsoleReadModel } from './console-read-model.ts';

interface SafeAgentCall {
  provider: string;
  role: string;
  idempotencyKey: string;
  workspaceRoot: string;
  promptSha256: string;
  schemaSha256: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: string;
  errorCode: string | null;
  notificationCount: number | null;
  metadata: Record<string, string | number | boolean | null>;
}

interface SafeProviderInvocation {
  provider: string;
  role: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: string;
  retryCount: number;
  tokens: {
    input: number | null;
    output: number | null;
    cacheRead: number | null;
    cacheWrite: number | null;
    total: number | null;
  };
  estimatedCostUsd: number | null;
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

function safePiInvocations(
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
    WHERE run_id = ? AND provider = 'pi-agent'
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
    call.provider, call.role, call.startedAt, call.completedAt,
    call.durationMs, call.status, call.errorCode,
  ]);
}

function mergeAgentCalls(
  fileCalls: SafeAgentCall[],
  piCalls: SafeProviderInvocation[],
): Array<SafeAgentCall | SafeProviderInvocation> {
  const result: Array<SafeAgentCall | SafeProviderInvocation> = [...fileCalls];
  const positions = new Map<string, number[]>();
  result.forEach((call, index) => {
    const key = callKey(call);
    positions.set(key, [...(positions.get(key) ?? []), index]);
  });
  for (const call of piCalls) {
    const key = callKey(call);
    const duplicate = positions.get(key)?.shift();
    if (duplicate === undefined) {
      result.push(call);
    } else {
      // Prefer the Registry projection because it carries controlled usage
      // fields and cannot contain prompt, path, or credential material.
      result[duplicate] = call;
    }
  }
  return result;
}

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
  const piCalls = safePiInvocations(input.repository, input.runId);
  return {
    schemaVersion: '1.0',
    reportKind: 'wpknowledge-governance-demo',
    generatedAt: (input.clock ?? (() => new Date()))().toISOString(),
    evidenceBoundary: '报告只导出 Registry 业务事实、Artifact 完整性结果和脱敏 Agent 调用摘要；不包含 Prompt 正文、模型正文、Session 日志或凭据。',
    snapshot,
    agentCalls: mergeAgentCalls(fileCalls, piCalls),
    ignoredAgentAuditLines: agentAudit.ignoredLines,
    artifactIntegrity: {
      total: verification.length,
      verified: verification.filter((result) => result.verified).length,
      failed: verification.filter((result) => !result.verified),
    },
  };
}
