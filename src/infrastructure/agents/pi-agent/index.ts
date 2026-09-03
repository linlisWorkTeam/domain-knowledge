import { randomUUID } from 'node:crypto';
import Ajv2020Import from 'ajv/dist/2020.js';
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { streamSimple as streamOpenAiCompatible } from '@earendil-works/pi-ai/api/openai-completions';
import type { Api, Context, Model, SimpleStreamOptions } from '@earendil-works/pi-ai';
import { Agent as UndiciAgent, fetch as undiciFetch } from 'undici';
import { isIP } from 'node:net';
import type {
  AgentProvider,
  AgentRequest,
  ProviderEndpoint,
  ProviderEndpointPolicy,
  ProviderInvocationRecord,
  ProviderSettingsRecord,
} from '../../../application/ports/index.ts';
import { PublicHttpsEndpointPolicy } from './provider-security.ts';

export { EncryptedFileProviderSettingsStore, isPublicAddress, OpenAiCompatibleProviderProbe, PublicHttpsEndpointPolicy } from './provider-security.ts';

const Ajv2020 = Ajv2020Import as unknown as new (options: Record<string, unknown>) => {
  compile(schema: Record<string, unknown>): {
    (value: unknown): boolean;
    errors?: unknown;
  };
  errorsText(errors: unknown): string;
};

interface PiAgentProviderOptions {
  settings: ProviderSettingsRecord;
  agentDir: string;
  maxTokens?: number;
  contextWindow?: number;
  clock?: () => Date;
  endpointPolicy?: ProviderEndpointPolicy;
  onInvocation?: (record: ProviderInvocationRecord) => void | Promise<void>;
}

function pinnedProviderTransport(endpoint: ProviderEndpoint): {
  fetch: typeof globalThis.fetch;
  close: () => Promise<void>;
} {
  const approved = new Set(endpoint.addresses);
  const pinnedAddress = endpoint.addresses[0];
  if (!pinnedAddress) throw new Error('PROVIDER_URL_UNREACHABLE: approved endpoint has no address');
  const dispatcher = new UndiciAgent({
    maxResponseSize: 2 * 1024 * 1024,
    autoSelectFamily: false,
    connect: {
      lookup: (_hostname, _options, callback) => {
        if (!approved.has(pinnedAddress)) {
          callback(new Error('PROVIDER_URL_DENIED'), '', 0);
          return;
        }
        callback(null, pinnedAddress, isIP(pinnedAddress));
      },
    },
  });
  const basePath = endpoint.url.pathname.endsWith('/')
    ? endpoint.url.pathname : `${endpoint.url.pathname}/`;
  const providerFetch: typeof globalThis.fetch = async (input, init) => {
    const raw = typeof input === 'string' ? input
      : input instanceof URL ? input.href : input.url;
    const target = new URL(raw);
    if (target.protocol !== endpoint.url.protocol
      || target.hostname !== endpoint.url.hostname
      || target.port !== endpoint.url.port
      || !target.pathname.startsWith(basePath)) {
      throw new Error('PROVIDER_URL_DENIED: Provider request escaped the approved endpoint');
    }
    const response = await undiciFetch(input as never, {
      ...((init ?? {}) as Record<string, unknown>),
      dispatcher,
      redirect: 'manual',
    });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new Error('PROVIDER_REDIRECT_DENIED: redirects are forbidden');
    }
    return response as unknown as Response;
  };
  return { fetch: providerFetch, close: () => dispatcher.close() };
}

function jsonCandidates(text: string): string[] {
  const trimmed = text.trim();
  const fenced = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)].map((match) => match[1]?.trim() ?? '');
  const objects: string[] = [];
  let start = -1;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if (depth === 0) {
      if (character === '{') {
        start = index;
        depth = 1;
        quoted = false;
        escaped = false;
      }
      continue;
    }
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        objects.push(trimmed.slice(start, index + 1));
        start = -1;
      }
    }
  }
  return [...fenced, trimmed, ...objects.reverse()].filter(Boolean);
}

function validateOutput(text: string, schema: Record<string, unknown>): Record<string, unknown> {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  let lastErrors: unknown;
  for (const candidate of jsonCandidates(text)) {
    try {
      const value = JSON.parse(candidate) as unknown;
      if (value && typeof value === 'object' && !Array.isArray(value) && validate(value)) {
        return value as Record<string, unknown>;
      }
      lastErrors = validate.errors;
    } catch {
      // A provider may surround the final JSON with diagnostics; continue scanning.
    }
  }
  throw new Error(`AGENT_OUTPUT_INVALID: ${ajv.errorsText(lastErrors)}`);
}

function lastAssistantText(messages: unknown[]): string {
  const assistant = [...messages].reverse().find((message) => (
    message && typeof message === 'object' && (message as { role?: unknown }).role === 'assistant'
  )) as { content?: unknown[]; errorMessage?: unknown } | undefined;
  if (!assistant) throw new Error('PI_AGENT_EMPTY_RESPONSE');
  if (typeof assistant.errorMessage === 'string' && assistant.errorMessage) {
    throw new Error('PI_AGENT_PROVIDER_FAILED');
  }
  const text = (assistant.content ?? []).flatMap((content) => (
    content && typeof content === 'object'
      && (content as { type?: unknown }).type === 'text'
      && typeof (content as { text?: unknown }).text === 'string'
      ? [(content as { text: string }).text] : []
  )).join('');
  if (!text.trim()) throw new Error('PI_AGENT_EMPTY_RESPONSE');
  return text;
}

/**
 * Real Pi coding-agent SDK adapter. It deliberately disables extensions, skills,
 * context discovery, and all tools: the workflow already materializes and embeds
 * the role-scoped inputs, while writes remain owned by the validated AgentResult path.
 */
export class PiCodingAgentProvider implements AgentProvider {
  readonly settings: ProviderSettingsRecord;
  readonly model: string;
  readonly agentDir: string;
  readonly maxTokens: number;
  readonly contextWindow: number;
  readonly clock: () => Date;
  readonly endpointPolicy: ProviderEndpointPolicy;
  readonly onInvocation?: PiAgentProviderOptions['onInvocation'];

  constructor(options: PiAgentProviderOptions) {
    if (!options.settings.enabled || options.settings.verificationStatus !== 'VERIFIED'
      || !options.settings.model) throw new Error('PI_AGENT_CONFIGURATION_UNAVAILABLE');
    this.settings = structuredClone(options.settings);
    this.model = options.settings.model;
    this.agentDir = options.agentDir;
    this.maxTokens = options.maxTokens ?? 32_768;
    this.contextWindow = options.contextWindow ?? 128_000;
    this.clock = options.clock ?? (() => new Date());
    this.endpointPolicy = options.endpointPolicy ?? new PublicHttpsEndpointPolicy();
    this.onInvocation = options.onInvocation;
  }

  async run(request: AgentRequest, signal?: AbortSignal): Promise<Record<string, unknown>> {
    if (signal?.aborted) throw new Error('AGENT_CANCELLED');
    const started = this.clock();
    let status: ProviderInvocationRecord['status'] = 'FAILED';
    let errorCode: string | null = null;
    let stats: ReturnType<import('@earendil-works/pi-coding-agent').AgentSession['getSessionStats']> | null = null;
    let session: import('@earendil-works/pi-coding-agent').AgentSession | null = null;
    let transport: ReturnType<typeof pinnedProviderTransport> | null = null;
    const providerId = 'domain-knowledge-pi';
    try {
      const endpoint = await this.endpointPolicy.validate(this.settings.apiUrl);
      transport = pinnedProviderTransport(endpoint);
      const runtime = await ModelRuntime.create({ modelsPath: null, refreshOnCreate: false });
      runtime.registerProvider(providerId, {
        name: 'Domain Knowledge Pi Provider',
        baseUrl: this.settings.apiUrl,
        api: 'openai-completions',
        streamSimple: (
          model: Model<Api>, context: Context, options?: SimpleStreamOptions,
        ) => streamOpenAiCompatible(model as Model<'openai-completions'>, context, {
          ...options,
          fetch: transport?.fetch,
        }),
        authHeader: true,
        models: [{
          id: this.model,
          name: this.model,
          api: 'openai-completions',
          baseUrl: this.settings.apiUrl,
          reasoning: false,
          input: ['text'],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: this.contextWindow,
          maxTokens: this.maxTokens,
          compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
        }],
      });
      if (this.settings.apiKey) await runtime.setRuntimeApiKey(providerId, this.settings.apiKey);
      const model = runtime.getModel(providerId, this.model);
      if (!model) throw new Error('PI_AGENT_MODEL_UNAVAILABLE');
      const settingsManager = SettingsManager.inMemory({
        compaction: { enabled: false },
        retry: { enabled: false },
      });
      const loader = new DefaultResourceLoader({
        cwd: request.workspaceRoot ?? process.cwd(),
        agentDir: this.agentDir,
        settingsManager,
        noExtensions: true,
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true,
        systemPrompt: 'Return exactly one JSON object satisfying the supplied JSON Schema. Do not use Markdown fences.',
      });
      await loader.reload();
      ({ session } = await createAgentSession({
        cwd: request.workspaceRoot ?? process.cwd(),
        agentDir: this.agentDir,
        modelRuntime: runtime,
        model,
        thinkingLevel: 'off',
        noTools: 'all',
        resourceLoader: loader,
        sessionManager: SessionManager.inMemory(request.workspaceRoot ?? process.cwd()),
        settingsManager,
      }));
      const abort = () => { void session?.abort(); };
      signal?.addEventListener('abort', abort, { once: true });
      try {
        await session.prompt(`${request.prompt}\n\nJSON Schema:\n${JSON.stringify(request.outputSchema)}`, {
          expandPromptTemplates: false,
          source: 'rpc',
        });
      } finally {
        signal?.removeEventListener('abort', abort);
      }
      if (signal?.aborted) throw new Error('AGENT_CANCELLED');
      stats = session.getSessionStats();
      const output = validateOutput(lastAssistantText(session.messages), request.outputSchema);
      status = 'SUCCEEDED';
      return output;
    } catch (error) {
      errorCode = error instanceof Error ? error.message.split(':', 1)[0] ?? 'PI_AGENT_FAILED' : 'PI_AGENT_FAILED';
      throw error;
    } finally {
      if (session && !stats) {
        try { stats = session.getSessionStats(); } catch { /* retain unavailable usage */ }
      }
      try { session?.dispose(); } catch { /* best-effort SDK resource cleanup */ }
      await transport?.close().catch(() => undefined);
      const completed = this.clock();
      await this.recordInvocation({
        invocationId: `pinv_${randomUUID()}`,
        runId: request.command?.runId ?? String(request.metadata?.runId ?? ''),
        agentId: request.role,
        provider: 'pi-agent',
        model: this.model,
        startedAt: started.toISOString(),
        completedAt: completed.toISOString(),
        durationMs: Math.max(0, completed.getTime() - started.getTime()),
        status,
        retryCount: 0,
        inputTokens: stats?.tokens.input ?? null,
        outputTokens: stats?.tokens.output ?? null,
        cacheReadTokens: stats?.tokens.cacheRead ?? null,
        cacheWriteTokens: stats?.tokens.cacheWrite ?? null,
        estimatedCostUsd: null,
        fixture: false,
        errorCode,
      });
    }
  }

  private async recordInvocation(record: ProviderInvocationRecord): Promise<void> {
    try {
      await this.onInvocation?.(record);
    } catch {
      // Observability must not alter the governed Agent result.
    }
  }
}
