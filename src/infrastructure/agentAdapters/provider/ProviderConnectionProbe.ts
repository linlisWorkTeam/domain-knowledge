/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：在用户明确操作后通过生产 DSH 链路验证一次最小生成。
 */
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetch } from 'undici';
import type { ProviderConnectionProbe, ProviderEndpoint, ProviderProbeChecks, ProviderProbeResult } from '../../../application/ports/ApplicationPorts.ts';
import { createPinnedHttpsDispatcher } from '../../http/PublicHttps.ts';
import { ProviderQuotaStop } from '../deepSeekHarness/ProviderQuota.ts';
import { ConfiguredDshProvider } from '../deepSeekHarness/ConfiguredProvider.ts';
import { modelProcessLane } from '../ModelProcessLane.ts';

interface Input { endpoint: ProviderEndpoint; apiKey: string | null; model: string | null }

function selectedModel(value: unknown, requested: string | null): string {
  if (!value || typeof value !== 'object' || !('data' in value) || !Array.isArray(value.data)) throw new Error('PROVIDER_RESPONSE_INVALID');
  const ids = value.data.flatMap((entry) => (
    entry && typeof entry === 'object' && 'id' in entry && typeof entry.id === 'string'
      && entry.id.trim().length > 0 && entry.id.length <= 256 && !/[\0\r\n]/.test(entry.id)
      ? [entry.id.trim()] : []
  ));
  if (ids.length === 0) throw new Error('PROVIDER_RESPONSE_INVALID');
  if (requested && !ids.includes(requested)) throw new Error('PROVIDER_MODEL_UNAVAILABLE');
  return requested ?? ids[0]!;
}

function reason(error: unknown, checks: ProviderProbeChecks, signal: AbortSignal): string {
  const stage = checks.modelList === 'PASSED' ? 'GENERATION' : 'MODEL_LIST';
  if (signal.aborted) return `${stage}_${signal.reason instanceof Error && signal.reason.message === 'PROVIDER_TIMEOUT' ? 'TIMEOUT' : 'CANCELLED'}`;
  const code = error instanceof Error ? error.message.split(':', 1)[0] : '';
  if (error instanceof Error && error.cause && typeof error.cause === 'object'
    && 'code' in error.cause && error.cause.code === 'UND_ERR_RES_EXCEEDED_MAX_SIZE') return `${stage}_RESPONSE_LIMIT`;
  const safe = new Set(['PROVIDER_AUTH_INVALID', 'PROVIDER_AUTH_DENIED', 'PROVIDER_ENDPOINT_UNSUPPORTED',
    'PROVIDER_QUOTA_EXHAUSTED', 'PROVIDER_PAYMENT_REQUIRED', 'PROVIDER_QUOTA_STOP_UNAVAILABLE', 'PROVIDER_RATE_LIMITED', 'PROVIDER_UNAVAILABLE', 'PROVIDER_REDIRECT_DENIED', 'PROVIDER_RESPONSE_INVALID',
    'PROVIDER_MODEL_UNAVAILABLE', 'PROVIDER_RESPONSE_LIMIT', 'PROVIDER_REQUEST_LIMIT']);
  if (code && safe.has(code)) return `${stage}_${code.replace(/^PROVIDER_/, '')}`;
  if (code === 'AGENT_TIMEOUT') return `${stage}_TIMEOUT`;
  if (code === 'AGENT_CANCELLED') return `${stage}_CANCELLED`;
  if (code === 'DSH_AGENT_OUTPUT_NOT_JSON' || code === 'AGENT_OUTPUT_INVALID') return `${stage}_RESPONSE_INVALID`;
  if (code?.includes('OUTPUT_LIMIT')) return `${stage}_OUTPUT_LIMIT`;
  return `${stage}_UNAVAILABLE`;
}

/** 列表预检不能启用；只有同生产链路的生成通过才能返回 VERIFIED。 */
export class OpenAiCompatibleProviderProbe implements ProviderConnectionProbe {
  readonly timeoutMs: number;
  readonly temporaryRoot: string;
  readonly quotaHome?: string;

  /** 临时根目录仅供组合和受控测试配置，不来自 HTTP 或模型输入。 */
  constructor(timeoutMs = 30_000, temporaryRoot = tmpdir(), quotaHome?: string) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new Error('PROVIDER_PROBE_TIMEOUT_INVALID');
    this.timeoutMs = timeoutMs;
    this.temporaryRoot = temporaryRoot;
    this.quotaHome = quotaHome;
  }

  /** 一次显式操作最多一次上游生成；取消和总期限覆盖排队及两个验证阶段。 */
  async verify(input: Input, externalSignal?: AbortSignal): Promise<ProviderProbeResult> {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(new Error('PROVIDER_TIMEOUT')), this.timeoutMs);
    const signal = AbortSignal.any([timeout.signal, ...externalSignal ? [externalSignal] : []]);
    const checks: ProviderProbeChecks = { modelList: 'FAILED', generation: 'NOT_RUN' };
    // 同一次验证固定 URL 和批准地址，异步排队期间调用者无法替换材料。
    const endpoint = { url: new URL(input.endpoint.url.href), addresses: [...input.endpoint.addresses] };
    let model = input.model;
    try {
      return await modelProcessLane.execute(async () => {
        signal.throwIfAborted();
        if (this.quotaHome) new ProviderQuotaStop(this.quotaHome, { apiUrl: endpoint.url.href, apiKey: input.apiKey }).assertAvailable();
        model = await this.listModels({ ...input, endpoint }, signal);
        checks.modelList = 'PASSED';
        signal.throwIfAborted();
        checks.generation = 'FAILED';
        await this.generate({ ...input, endpoint, model }, signal);
        signal.throwIfAborted();
        checks.generation = 'PASSED';
        return { status: 'VERIFIED', reasonCode: 'GENERATION_READY', model, checks };
      }, signal);
    } catch (error) {
      return { status: 'FAILED', reasonCode: reason(error, checks, signal), model, checks };
    } finally {
      clearTimeout(timer);
    }
  }

  private async listModels(input: Input, signal: AbortSignal): Promise<string> {
    const dispatcher = createPinnedHttpsDispatcher(input.endpoint, 65_536);
    try {
      const response = await fetch(new URL('models', input.endpoint.url), {
        dispatcher, redirect: 'manual', signal,
        headers: { accept: 'application/json', 'user-agent': 'domain-knowledge/0.2.0',
          ...input.apiKey ? { authorization: `Bearer ${input.apiKey}` } : {} },
      });
      const statusCodes: Record<number, string> = { 401: 'AUTH_INVALID', 403: 'AUTH_DENIED',
        404: 'ENDPOINT_UNSUPPORTED', 429: 'RATE_LIMITED' };
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`PROVIDER_${statusCodes[response.status] ?? (response.status >= 300 && response.status < 400 ? 'REDIRECT_DENIED' : 'UNAVAILABLE')}`);
      }
      const chunks: Uint8Array[] = [];
      let size = 0;
      for await (const chunk of response.body ?? []) {
        size += chunk.byteLength;
        if (size > 65_536) throw new Error('PROVIDER_RESPONSE_LIMIT');
        chunks.push(chunk);
      }
      let parsed: unknown;
      try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { throw new Error('PROVIDER_RESPONSE_INVALID'); }
      return selectedModel(parsed, input.model);
    } finally { await dispatcher.destroy(); }
  }

  private async generate(input: Input & { model: string }, signal: AbortSignal): Promise<void> {
    const root = await mkdtemp(join(this.temporaryRoot, 'knowledge-provider-probe-'));
    try {
      const workspaceRoot = join(root, 'workspace');
      await mkdir(workspaceRoot, { mode: 0o700 });
      const provider = new ConfiguredDshProvider({
        settings: { provider: 'deepseek-harness', apiUrl: input.endpoint.url.href, apiKey: input.apiKey,
          model: input.model, enabled: true, revision: 0, verificationStatus: 'UNVERIFIED',
          verificationReasonCode: 'VERIFICATION_IN_PROGRESS', verifiedFingerprint: null,
          lastVerifiedAt: null, updatedAt: new Date().toISOString() },
        // 复用此次操作已批准的地址，不重复解析 DNS，也不扩大默认策略。
        endpointPolicy: { validate: async (raw) => {
          if (raw !== input.endpoint.url.href) throw new Error('PROVIDER_URL_DENIED');
          return input.endpoint;
        } },
        quotaHome: this.quotaHome, dshHome: join(root, 'dsh'), maxTokens: 64, maxSchemaAttempts: 1,
        maxProviderRequests: 1, maxProviderResponseBytes: 65_536,
        runtime: { timeoutMs: this.timeoutMs, maxOutputBytes: 65_536, allowedWorkspaceRoots: [workspaceRoot] },
      });
      await provider.run({ role: 'provider-probe', prompt: 'Return exactly this JSON object: {"answer":"ok"}. Do not call tools.',
        authorizedTools: [], workspaceRoot, idempotencyKey: `probe-${randomUUID()}`,
        outputSchema: { type: 'object', additionalProperties: false, required: ['answer'],
          properties: { answer: { type: 'string', const: 'ok' } } },
      }, signal);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
}
