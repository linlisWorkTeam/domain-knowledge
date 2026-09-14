/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：提供Configured提供方的基础设施实现与外部系统接入。
 */
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { fetch } from 'undici';
import type { AgentProvider, AgentRequest, DshExecutionParameters, ProviderEndpointPolicy, ProviderInvocationRecord, ProviderSettingsRecord } from '../../../application/ports/ApplicationPorts.ts';
import { createPinnedHttpsDispatcher, PublicHttpsEndpointPolicy } from '../../http/PublicHttps.ts';
import { DeepSeekHarnessSdkAgent, type DeepSeekHarnessAuditRecord, type DeepSeekHarnessSdkAgentOptions } from './DeepSeekHarnessSdkAgent.ts';

/** 对外提供Token，作为调用方使用的统一约定。 */
export const DSH_DEFAULT_MAX_TOKENS = 32_768;
/** 对外提供ATTEMPTS，作为调用方使用的统一约定。 */
export const DSH_DEFAULT_MAX_SCHEMA_ATTEMPTS = 2;
/** 对外提供窗口，作为调用方使用的统一约定。 */
export const DSH_DEFAULT_CONTEXT_WINDOW = 128_000;

interface Options extends Partial<DshExecutionParameters> {
  /** 提供settings信息，供调用方读取或传入。 */
  settings: ProviderSettingsRecord;
  /** 提供dshHome信息，供调用方读取或传入。 */
  dshHome: string;
  /** 提供endpoint策略信息，供调用方读取或传入。 */
  endpointPolicy?: ProviderEndpointPolicy;
  /** 提供runtime信息，供调用方读取或传入。 */
  runtime?: Pick<DeepSeekHarnessSdkAgentOptions, 'processIsolation' | 'bubblewrapCommand' | 'timeoutMs' | 'maxOutputBytes' | 'allowedWorkspaceRoots'>;
  /** 提供onAudit信息，供调用方读取或传入。 */
  onAudit?: DeepSeekHarnessSdkAgentOptions['onAudit'];
  /** 提供 onInvocation 对应的onInvocation操作。 */
  onInvocation?: (record: ProviderInvocationRecord) => void | Promise<void>;
}

/** Approved model transport for the native DSH adapter. No model/tool/session loop here. */
/** 封装ConfiguredDsh提供方的对外操作与协作依赖。 */
export class ConfiguredDshProvider implements AgentProvider {
  /** 提供选项信息，供调用方读取或传入。 */
  readonly options: Options;
  /** 注入协作依赖并初始化实例状态。 */
  constructor(options: Options) {
    if (options.settings.provider !== 'deepseek-harness' || !options.settings.model || !options.settings.enabled) {
      throw new Error('DSH_CONFIGURATION_UNAVAILABLE');
    }
    this.options = structuredClone({ ...options, endpointPolicy: undefined, onInvocation: undefined, onAudit: undefined });
    this.options.endpointPolicy = options.endpointPolicy;
    this.options.onInvocation = options.onInvocation;
    this.options.onAudit = options.onAudit;
  }

  /** 运行请求。 */
  async run(request: AgentRequest, signal?: AbortSignal): Promise<Record<string, unknown>> {
    if (signal?.aborted) throw new Error('AGENT_CANCELLED');
    if (!request.workspaceRoot) throw new Error('DSH_AGENT_WORKSPACE_REQUIRED');
    const settings = this.options.settings;
    const endpoint = await (this.options.endpointPolicy ?? new PublicHttpsEndpointPolicy()).validate(settings.apiUrl);
    const dispatcher = createPinnedHttpsDispatcher(endpoint);
    const token = randomUUID();
    const abort = new AbortController();
    let transportError: string | null = null;
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    let transportRequests: NonNullable<DeepSeekHarnessAuditRecord['reasoningTransport']>['requests'] = [];
    // The real upstream credential stays in the parent. DSH receives only an
    // invocation-local relay token; DNS and redirects cannot escape approval.
    const relay = createServer(async (req, res) => {
      if (req.method !== 'POST' || req.url !== '/v1/chat/completions' || req.headers.authorization !== `Bearer ${token}`) {
        res.writeHead(403); res.end(); return;
      }
      try {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 8 * 1024 * 1024) throw new Error('DSH_REQUEST_LIMIT_EXCEEDED');
          chunks.push(Buffer.from(chunk));
        }
        const target = new URL('chat/completions', endpoint.url.href.replace(/\/?$/, '/'));
        const body = Buffer.concat(chunks);
        const fields = JSON.parse(body.toString('utf8'));
        const wire = { requestSha256: createHash('sha256').update(body).digest('hex'),
          thinking: ['enabled', 'disabled'].includes(fields.thinking?.type) ? fields.thinking.type : null,
          reasoningEffort: ['off', 'low', 'medium', 'high', 'max'].includes(fields.reasoning_effort) ? fields.reasoning_effort : null,
          maxTokens: Number.isSafeInteger(fields.max_tokens) ? fields.max_tokens : null };
        const observation = { request: wire, reasoningCharacters: 0, contentCharacters: 0,
          firstReasoningMs: null as number | null, firstContentMs: null as number | null };
        transportRequests.push(observation);
        const requestStarted = Date.now();
        const response = await fetch(target, {
          method: 'POST', body, dispatcher, redirect: 'manual', signal: abort.signal,
          headers: {
            'content-type': 'application/json',
            'user-agent': 'domain-knowledge/0.1 (+https://github.com/linlisWorkTeam/domain-knowledge)',
            ...(endpoint.url.hostname === 'opencode.ai' ? {
              'x-opencode-session': `dk-${createHash('sha256').update(request.idempotencyKey).digest('hex')}`,
            } : {}),
            ...(settings.apiKey ? { authorization: `Bearer ${settings.apiKey}` } : {}),
          },
        });
        if (response.status >= 300 && response.status < 400) {
          await response.body?.cancel();
          throw new Error('PROVIDER_REDIRECT_DENIED');
        }
        if (!response.ok) { await response.body?.cancel(); throw new Error('DSH_PROVIDER_REQUEST_FAILED'); }
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        let pending = '';
        const decoder = new TextDecoder();
        for await (const chunk of response.body ?? []) {
          if (!res.write(chunk)) await once(res, 'drain', { signal: abort.signal });
          pending += decoder.decode(chunk, { stream: true });
          const lines = pending.split('\n');
          pending = lines.pop() ?? '';
          if (pending.length > 2 * 1024 * 1024) throw new Error('DSH_PROVIDER_OUTPUT_LIMIT');
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6));
              const usage = event.usage;
              for (const choice of event.choices ?? []) {
                const reasoning = choice.delta?.reasoning_content;
                const content = choice.delta?.content;
                if (typeof reasoning === 'string' && reasoning.length) {
                  observation.firstReasoningMs ??= Date.now() - requestStarted;
                  observation.reasoningCharacters += reasoning.length;
                }
                if (typeof content === 'string' && content.length) {
                  observation.firstContentMs ??= Date.now() - requestStarted;
                  observation.contentCharacters += content.length;
                }
              }
              if (Number.isSafeInteger(usage?.prompt_tokens) && usage.prompt_tokens >= 0) inputTokens = (inputTokens ?? 0) + usage.prompt_tokens;
              if (Number.isSafeInteger(usage?.completion_tokens) && usage.completion_tokens >= 0) outputTokens = (outputTokens ?? 0) + usage.completion_tokens;
            } catch { /* content/terminal SSE events are not token usage */ }
          }
        }
        res.end();
      } catch (error) {
        transportError = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'DSH_PROVIDER_REQUEST_FAILED';
        if (!res.headersSent) res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: transportError, type: 'invalid_request_error' } }));
      }
    });
    try {
      await new Promise<void>((resolve, reject) => { relay.once('error', reject); relay.listen(0, '127.0.0.1', resolve); });
      const port = (relay.address() as { port: number }).port;
      const adapter = new DeepSeekHarnessSdkAgent({
        processIsolation: 'bubblewrap', ...this.options.runtime,
        allowedWorkspaceRoots: this.options.runtime?.allowedWorkspaceRoots ?? [request.workspaceRoot],
        transportFailure: () => transportError,
        dshHome: this.options.dshHome, profile: 'sdk-minimal', provider: 'deepseek-official', model: settings.model!,
        nativeConnection: { baseURL: `http://127.0.0.1:${port}/v1`, contextWindow: this.options.contextWindow ?? DSH_DEFAULT_CONTEXT_WINDOW },
        env: { DEEPSEEK_API_KEY: token },
        maxTokens: this.options.maxTokens ?? DSH_DEFAULT_MAX_TOKENS,
        maxSchemaAttempts: this.options.maxSchemaAttempts ?? DSH_DEFAULT_MAX_SCHEMA_ATTEMPTS,
        onAudit: async (record) => {
          const errorCode = transportError ?? record.errorCode;
          await this.options.onAudit?.({ ...record, errorCode, metadata: { ...record.metadata, model: settings.model! },
            reasoningTransport: { requests: structuredClone(transportRequests),
              disabledButReasoningObserved: transportRequests.some(r => r.request.thinking === 'disabled' && r.reasoningCharacters > 0) },
          });
          await this.options.onInvocation?.({
            invocationId: `pinv_${randomUUID()}`, runId: String(request.metadata?.runId ?? ''), agentId: request.role,
            provider: 'deepseek-harness', model: settings.model!, startedAt: record.startedAt, completedAt: record.completedAt,
            durationMs: record.durationMs, status: record.status, retryCount: Number(record.metadata.providerAttempt) > 1 ? 1 : 0,
            inputTokens, outputTokens, cacheReadTokens: null, cacheWriteTokens: null, estimatedCostUsd: null,
            fixture: false, errorCode,
          });
          inputTokens = null; outputTokens = null;
          transportRequests = [];
        },
      });
      return await adapter.run(request, signal);
    } catch (error) {
      if (transportError) throw new Error(transportError);
      throw error;
    } finally {
      abort.abort();
      await new Promise<void>((resolve) => { relay.close(() => resolve()); relay.closeAllConnections(); });
      await dispatcher.destroy();
    }
  }
}
