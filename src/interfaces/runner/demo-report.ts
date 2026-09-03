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
  return {
    schemaVersion: '1.0',
    reportKind: 'wpknowledge-governance-demo',
    generatedAt: (input.clock ?? (() => new Date()))().toISOString(),
    evidenceBoundary: '报告只导出 Registry 业务事实、Artifact 完整性结果和脱敏 Agent 调用摘要；不包含 Prompt 正文、模型正文、Session 日志或凭据。',
    snapshot,
    agentCalls: agentAudit.calls.filter((call) => call.metadata.runId === input.runId),
    ignoredAgentAuditLines: agentAudit.ignoredLines,
    artifactIntegrity: {
      total: verification.length,
      verified: verification.filter((result) => result.verified).length,
      failed: verification.filter((result) => !result.verified),
    },
  };
}
