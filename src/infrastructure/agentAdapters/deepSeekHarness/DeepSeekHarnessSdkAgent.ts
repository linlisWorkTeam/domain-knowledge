/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：提供DeepSeekHarnessSdk角色的基础设施实现与外部系统接入。
 */
import { DOMAIN_KNOWLEDGE_AGENT_DEFINITIONS } from '../../../domain/services/workflow/AgentDefinitions.ts';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client';
import type { DeepSeekHarnessOptions } from '@deepseek-ai/dsh-sdk-client';
import Ajv2020Import from 'ajv/dist/2020.js';
import type { AgentProvider, AgentRequest } from '../../../application/ports/ApplicationPorts.ts';

const Ajv2020 = Ajv2020Import as unknown as new (options: Record<string, unknown>) => {
  compile(schema: Record<string, unknown>): {
    (value: unknown): boolean;
    errors?: unknown;
  };
  errorsText(errors: unknown): string;
};

/** 定义DeepSeekHarnessAuditRecord的数据结构与类型约束。 */
export interface DeepSeekHarnessAuditRecord {
  /** 提供Schema版本信息，供调用方读取或传入。 */
  schemaVersion: '1.0';
  /** 提供提供方信息，供调用方读取或传入。 */
  provider: 'deepseek-harness-sdk' | 'deepseek-harness-headless';
  /** 提供role信息，供调用方读取或传入。 */
  role: string;
  /** 提供幂等键信息，供调用方读取或传入。 */
  idempotencyKey: string;
  /** 提供session标识信息，供调用方读取或传入。 */
  sessionId?: string;
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
  /** 提供exitCode信息，供调用方读取或传入。 */
  exitCode: number | null;
  /** 提供timedOut信息，供调用方读取或传入。 */
  timedOut: boolean;
  /** 提供cancelled信息，供调用方读取或传入。 */
  cancelled: boolean;
  /** 提供stdout字节信息，供调用方读取或传入。 */
  stdoutBytes: number;
  /** 提供stderr字节信息，供调用方读取或传入。 */
  stderrBytes: number;
  /** 提供notification数量信息，供调用方读取或传入。 */
  notificationCount?: number;
  /** 提供状态信息，供调用方读取或传入。 */
  status: 'SUCCEEDED' | 'FAILED';
  /** 提供错误Code信息，供调用方读取或传入。 */
  errorCode: string | null;
  /** 提供元数据信息，供调用方读取或传入。 */
  metadata: Record<string, string | number | boolean | null>;
}

/** 定义DeepSeekHarness角色选项的数据结构与类型约束。 */
export interface DeepSeekHarnessAgentOptions {
  /** 提供命令信息，供调用方读取或传入。 */
  command?: string;
  /** 提供args信息，供调用方读取或传入。 */
  args?: string[];
  /** 提供env信息，供调用方读取或传入。 */
  env?: NodeJS.ProcessEnv;
  /** 提供超时毫秒信息，供调用方读取或传入。 */
  timeoutMs?: number;
  /** 提供terminationGrace毫秒信息，供调用方读取或传入。 */
  terminationGraceMs?: number;
  /** 提供最大输出字节信息，供调用方读取或传入。 */
  maxOutputBytes?: number;
  /** 提供allowed工作区Roots信息，供调用方读取或传入。 */
  allowedWorkspaceRoots: string[];
  /** 提供 时钟 对应的时钟操作。 */
  clock?: () => Date;
  /** 提供 onAudit 对应的onAudit操作。 */
  onAudit?: (record: DeepSeekHarnessAuditRecord) => void | Promise<void>;
  /** 提供spawnProcess信息，供调用方读取或传入。 */
  spawnProcess?: typeof spawn;
}

/** 定义DeepSeekHarnessSdk角色选项的数据结构与类型约束。 */
export interface DeepSeekHarnessSdkAgentOptions {
  /** 在原生会话发出请求前绑定传输标识；格式重试使用新的会话。 */
  onSessionStarted?: (sessionId: string) => void;
  /** 提供 transportFailure 对应的transportFailure操作。 */
  transportFailure?: () => string | null;
  /** 提供nativeConnection信息，供调用方读取或传入。 */
  nativeConnection?: { baseURL: string; contextWindow: number };
  /** 提供dshBin信息，供调用方读取或传入。 */
  dshBin?: string;
  /** 提供profile信息，供调用方读取或传入。 */
  profile?: string;
  /** 提供patches信息，供调用方读取或传入。 */
  patches?: string[];
  /** 提供dshHome信息，供调用方读取或传入。 */
  dshHome?: string;
  /** 提供env信息，供调用方读取或传入。 */
  env?: NodeJS.ProcessEnv;
  /** 提供提供方信息，供调用方读取或传入。 */
  provider?: string;
  /** 提供模型信息，供调用方读取或传入。 */
  model?: string;
  /** 提供reasoningEffort信息，供调用方读取或传入。 */
  reasoningEffort?: DeepSeekHarnessOptions['reasoningEffort'];
  /** 提供最大Token信息，供调用方读取或传入。 */
  maxTokens?: number;
  /** 提供最大SchemaAttempts信息，供调用方读取或传入。 */
  maxSchemaAttempts?: number;
  /** 提供超时毫秒信息，供调用方读取或传入。 */
  timeoutMs?: number;
  /** 提供最大输出字节信息，供调用方读取或传入。 */
  maxOutputBytes?: number;
  /** 提供initialize超时毫秒信息，供调用方读取或传入。 */
  initializeTimeoutMs?: number;
  /** 提供shutdown超时毫秒信息，供调用方读取或传入。 */
  shutdownTimeoutMs?: number;
  /** 提供disposeEofGrace毫秒信息，供调用方读取或传入。 */
  disposeEofGraceMs?: number;
  /** 提供disposeGrace毫秒信息，供调用方读取或传入。 */
  disposeGraceMs?: number;
  /** 提供processIsolation信息，供调用方读取或传入。 */
  processIsolation?: 'none' | 'bubblewrap';
  /** 提供bubblewrap命令信息，供调用方读取或传入。 */
  bubblewrapCommand?: string;
  /** 提供allowed工作区Roots信息，供调用方读取或传入。 */
  allowedWorkspaceRoots: string[];
  /** 提供 时钟 对应的时钟操作。 */
  clock?: () => Date;
  /** 提供 onAudit 对应的onAudit操作。 */
  onAudit?: (record: DeepSeekHarnessAuditRecord) => void | Promise<void>;
  /** 提供 harnessFactory 对应的harness工厂操作。 */
  harnessFactory?: (options: DeepSeekHarnessOptions) => DeepSeekHarnessRuntime;
}

/** 定义DeepSeekHarness运行时的数据结构与类型约束。 */
export interface DeepSeekHarnessRuntime {
  /** 提供运行信息，供调用方读取或传入。 */
  run: DeepSeekHarness['run'];
  /** 提供close信息，供调用方读取或传入。 */
  close: DeepSeekHarness['close'];
}

function installedDshBin(): string {
  const manifestPath = fileURLToPath(import.meta.resolve('@deepseek-ai/dsh/package.json'));
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { bin?: string | Record<string, string> };
  const relativeBin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.dsh;
  if (!relativeBin) throw new Error('DSH_AGENT_RUNTIME_BIN_MISSING');
  return resolve(dirname(manifestPath), relativeBin);
}

function installedNodeModulesRoot(): string {
  const manifestPath = fileURLToPath(import.meta.resolve('@deepseek-ai/dsh/package.json'));
  return dirname(dirname(dirname(manifestPath)));
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function extractJsonCandidates(stdout: string): Record<string, unknown>[] {
  const trimmed = stdout.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim();
  const texts = [fenced, trimmed].filter((value): value is string => Boolean(value));
  let depth = 0;
  let start = -1;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if (depth === 0) {
      // DSH may print diagnostics before the final answer. Quotes in those lines
      // are not JSON string delimiters and must not poison the object scanner.
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
    if (character === '"') {
      quoted = true;
      continue;
    }
    if (character === '{') {
      depth += 1;
    } else if (character === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        texts.push(trimmed.slice(start, index + 1));
        start = -1;
      }
    }
  }
  // Prose before the final response can contain an unfinished object literal.
  // Try bounded terminal object candidates as well; never repair invalid JSON.
  const terminalStarts: number[] = [];
  for (const match of trimmed.matchAll(/\{(?=\s*")/g)) {
    terminalStarts.push(match.index);
    if (terminalStarts.length > 64) terminalStarts.shift();
  }
  for (const offset of terminalStarts) texts.push(trimmed.slice(offset).replace(/\s*```$/, '').trim());
  const outputs: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const candidate of texts) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const canonical = JSON.stringify(parsed);
        if (!seen.has(canonical)) {
          seen.add(canonical);
          outputs.push(parsed as Record<string, unknown>);
        }
      }
    } catch {
      // Report one stable error below without reflecting model output.
    }
  }
  return outputs;
}

function canonicalWorkspace(requested: string, allowedRoots: string[]): string {
  const workspace = realpathSync(resolve(requested));
  const allowed = allowedRoots.map((root) => realpathSync(resolve(root)));
  if (!allowed.some((root) => {
    const pathFromRoot = relative(root, workspace);
    return pathFromRoot === '' || (!pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot));
  })) {
    throw new Error('DSH_AGENT_WORKSPACE_DENIED');
  }
  return workspace;
}

function providerPrompt(request: AgentRequest): string {
  const objectKeyRules = (schema: Record<string, unknown>, path = '$'): string[] => {
    const properties = schema.properties;
    const rules: string[] = [];
    if (properties && typeof properties === 'object' && !Array.isArray(properties)) {
      const entries = Object.entries(properties as Record<string, unknown>);
      rules.push(`${path} 对象键必须恰好是：${entries.map(([key]) => key).join('、')}。`);
      for (const [key, child] of entries) {
        if (!child || typeof child !== 'object' || Array.isArray(child)) continue;
        const childSchema = child as Record<string, unknown>;
        const type = childSchema.type;
        if (type === 'object' || (Array.isArray(type) && type.includes('object'))) {
          rules.push(...objectKeyRules(childSchema, `${path}.${key}`));
        }
        if (type === 'array' && childSchema.items && typeof childSchema.items === 'object' && !Array.isArray(childSchema.items)) {
          rules.push(...objectKeyRules(childSchema.items as Record<string, unknown>, `${path}.${key}[]`));
        }
      }
    }
    return rules;
  };
  const keyRules = objectKeyRules(request.outputSchema);
  return [
    `你是知识飞轮中的 ${request.role} 节点。`,
    request.prompt,
    '必须只输出一个 JSON 对象，不要使用 Markdown 代码块，不要补充解释。',
    '输出必须是可由 JSON.parse 直接解析的 RFC 8259 JSON；字符串中的换行和双引号必须转义，不能写注释、尾随逗号或未转义控制字符。',
    ...(keyRules.length > 0
      ? [`严格遵守每一层对象的字段白名单：\n${keyRules.join('\n')}\n不得添加 schema note、metadata、additionalProperties、json_1_kv_placeholder_do_not_use 或其他占位字段。`]
      : []),
    '输出必须严格符合下面的 JSON Schema：',
    JSON.stringify(request.outputSchema),
    `幂等键：${request.idempotencyKey}`,
  ].join('\n\n');
}

function validateOutput(
  stdout: string,
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  const candidates = extractJsonCandidates(stdout);
  if (candidates.length === 0) throw new Error('DSH_AGENT_OUTPUT_NOT_JSON');
  const output = [...candidates].reverse().find((candidate) => validate(candidate));
  if (!output) {
    validate(candidates.at(-1));
    throw new Error(`AGENT_OUTPUT_INVALID: ${ajv.errorsText(validate.errors)}`);
  }
  return output;
}

async function recordAuditWithoutAffectingResult(audit: () => Promise<void>): Promise<void> {
  try {
    await audit();
  } catch {
    // Audit persistence is observability, not execution authority. A failure
    // here must never replace a valid Agent result or its original error.
  }
}

/**
 * Production-facing DSH adapter. The full prompt travels over the official
 * stdio JSON-RPC SDK transport and never appears in the spawned process argv.
 * One runtime is owned per request so cancellation can close the whole agent
 * turn until the upstream protocol gains a turn-cancel method.
 */
export class DeepSeekHarnessSdkAgent implements AgentProvider {
  readonly options: DeepSeekHarnessSdkAgentOptions;
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
  readonly maxSchemaAttempts: number;
  readonly allowedWorkspaceRoots: string[];
  readonly clock: () => Date;
  readonly onAudit?: DeepSeekHarnessSdkAgentOptions['onAudit'];

  constructor(options: DeepSeekHarnessSdkAgentOptions) {
    if (options.allowedWorkspaceRoots.length === 0) throw new Error('DSH_AGENT_ALLOWED_ROOT_REQUIRED');
    this.options = { ...options, patches: [...(options.patches ?? [])] };
    this.timeoutMs = options.timeoutMs ?? 300_000;
    this.maxOutputBytes = options.maxOutputBytes ?? 2 * 1024 * 1024;
    this.maxSchemaAttempts = options.maxSchemaAttempts ?? 2;
    if (!Number.isSafeInteger(this.maxSchemaAttempts) || this.maxSchemaAttempts < 1 || this.maxSchemaAttempts > 3) {
      throw new Error('DSH_AGENT_MAX_SCHEMA_ATTEMPTS_INVALID');
    }
    this.allowedWorkspaceRoots = [...options.allowedWorkspaceRoots];
    this.clock = options.clock ?? (() => new Date());
    this.onAudit = options.onAudit;
  }

  async run(request: AgentRequest, signal?: AbortSignal): Promise<Record<string, unknown>> {
    let lastError: unknown;
    for (let providerAttempt = 1; providerAttempt <= this.maxSchemaAttempts; providerAttempt += 1) {
      try {
        return await this.runAttempt(request, signal, providerAttempt);
      } catch (error) {
        lastError = error;
        const code = error instanceof Error ? error.message.split(':', 1)[0] : '';
        const retryable = code === 'DSH_AGENT_OUTPUT_NOT_JSON' || code === 'AGENT_OUTPUT_INVALID';
        if (!retryable || signal?.aborted || providerAttempt === this.maxSchemaAttempts) throw error;
      }
    }
    throw lastError;
  }

  private async runAttempt(
    request: AgentRequest,
    signal: AbortSignal | undefined,
    providerAttempt: number,
  ): Promise<Record<string, unknown>> {
    const maxTokens = request.maxTokens === undefined ? this.options.maxTokens
      : Math.min(request.maxTokens, this.options.maxTokens ?? request.maxTokens);
    if (maxTokens !== undefined && (!Number.isSafeInteger(maxTokens) || maxTokens < 1)) throw new Error('DSH_AGENT_MAX_TOKENS_INVALID');
    if (!request.workspaceRoot) throw new Error('DSH_AGENT_WORKSPACE_REQUIRED');
    if (signal?.aborted) throw new Error('AGENT_CANCELLED');
    const workspaceRoot = canonicalWorkspace(request.workspaceRoot, this.allowedWorkspaceRoots);
    const prompt = providerPrompt(request);
    const started = this.clock();
    let timedOut = false;
    let cancelled = false;
    let stdoutBytes = 0;
    let notificationCount = 0;
    let errorCode: string | null = null;
    const dshHomeBase = resolve(this.options.dshHome ?? join(workspaceRoot, '.dsh'));
    const dshHome = join(dshHomeBase, `${digest(request.idempotencyKey).slice(0, 24)}-${randomUUID()}`);
    mkdirSync(dshHome, { recursive: true, mode: 0o700 });
    const processIsolation = this.options.processIsolation ?? 'none';
    const runtimeBin = resolve(this.options.dshBin ?? installedDshBin());
    const policyPath = join(dshHome, 'RoleTools.mjs');
    writeFileSync(policyPath, readFileSync(new URL('./RoleTools.mjs', import.meta.url)), { mode: 0o600 });
    const policyPatch = join(dshHome, 'role-policy.json');
    writeFileSync(policyPatch, JSON.stringify([
      ...(this.options.nativeConnection ? [{ id: 'llm-deepseek', config: {
        apiKeyEnv: 'DEEPSEEK_API_KEY', baseURL: this.options.nativeConnection.baseURL,
        thinking: 'disabled', defaultContextWindow: this.options.nativeConnection.contextWindow,
        maxTokens: maxTokens, retryPolicy: { mode: 'normal', maxRetries: 0 },
        models: [{ id: this.options.model, contextWindow: this.options.nativeConnection.contextWindow,
          maxTokens: maxTokens }],
      } }] : []),
      ...['persistent-bash', 'persistent-pwsh', 'str-replace-editor'].map((id) => ({ id, disabled: true })),
      { insert: [{ id: 'workpanel-role-tools', name: policyPath, config: { workspaceRoot, canRead: (request.authorizedTools ?? DOMAIN_KNOWLEDGE_AGENT_DEFINITIONS.find((definition) => definition.agentId === request.role)?.tools ?? []).includes('read_material') } }] },
    ]), { mode: 0o600 });
    // The final patch and monotonic DSH guard enforce the business role view.
    const patches = [...(this.options.patches ?? []).map((path) => resolve(path)), policyPatch];
    const launcher = fileURLToPath(new URL('./IsolationLauncher.mjs', import.meta.url));
    const childEnv = {
      ...process.env,
      DSH_TELEMETRY_MODE: 'DISABLED',
      ...this.options.env,
      ...(processIsolation === 'bubblewrap' ? {
        WP_DSH_SANDBOX_COMMAND: this.options.bubblewrapCommand ?? 'bwrap',
        WP_DSH_SANDBOX_RUNTIME_BIN: runtimeBin,
        WP_DSH_SANDBOX_NODE_MODULES: installedNodeModulesRoot(),
        WP_DSH_SANDBOX_NODE_BIN: process.execPath,
        WP_DSH_SANDBOX_WORKSPACE: workspaceRoot,
        WP_DSH_SANDBOX_HOME: dshHome,
        WP_DSH_SANDBOX_PATCHES: JSON.stringify(patches),
      } : {}),
    };
    const harness = (this.options.harnessFactory ?? ((options) => new DeepSeekHarness(options)))({
      dshBin: processIsolation === 'bubblewrap' ? launcher : runtimeBin,
      profile: this.options.profile ?? 'sdk-minimal',
      patches,
      dshHome,
      cwd: workspaceRoot,
      processCwd: workspaceRoot,
      env: childEnv,
      provider: this.options.provider ?? 'deepseek-official',
      model: this.options.model ?? 'deepseek-v4-flash',
      ...this.options.reasoningEffort === undefined ? {} : { reasoningEffort: this.options.reasoningEffort },
      ...maxTokens === undefined ? {} : { maxTokens: maxTokens },
      initializeTimeoutMs: this.options.initializeTimeoutMs ?? Math.min(this.timeoutMs, 30_000),
      shutdownTimeoutMs: this.options.shutdownTimeoutMs ?? 1_000,
      disposeEofGraceMs: this.options.disposeEofGraceMs ?? 2_000,
      disposeGraceMs: this.options.disposeGraceMs ?? 2_000,
    });
    let timeout: NodeJS.Timeout | undefined;
    let abort: (() => void) | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        timedOut = true;
        void harness.close().catch(() => undefined);
        reject(new Error('DSH_AGENT_TIMEOUT'));
      }, this.timeoutMs);
      timeout.unref();
      abort = () => {
        cancelled = true;
        void harness.close().catch(() => undefined);
        reject(new Error('AGENT_CANCELLED'));
      };
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });
    // Keep the deadline rejection observed even if the SDK throws before
    // Promise.race can attach its own handler.
    void deadline.catch(() => undefined);
    // A retried graph node must get a fresh conversation. Durable idempotency
    // belongs to the workflow checkpoint/CAS layer; reusing a completed DSH
    // session can settle immediately without producing a new assistant turn.
    const sessionId = `wp-${randomUUID().replaceAll('-', '')}`;
    try {
      this.options.onSessionStarted?.(sessionId);
      const run = harness.run(prompt, {
        sessionId,
        onNotification: () => { notificationCount += 1; },
      });
      // If cancellation wins Promise.race, the runtime shutdown will reject the
      // in-flight run. Observe it here so Node never reports an unhandled error.
      void run.catch(() => undefined);
      const result = await Promise.race([run, deadline]);
      const transportFailure = this.options.transportFailure?.();
      if (transportFailure) throw new Error(transportFailure);
      if (signal?.aborted || cancelled) throw new Error('AGENT_CANCELLED');
      if (timedOut) throw new Error('DSH_AGENT_TIMEOUT');
      if (result.sessionId !== sessionId) throw new Error('DSH_AGENT_SESSION_MISMATCH');
      if (timeout) clearTimeout(timeout);
      if (abort) signal?.removeEventListener('abort', abort);
      stdoutBytes = Buffer.byteLength(result.finalResponse, 'utf8');
      if (stdoutBytes > this.maxOutputBytes) throw new Error('DSH_AGENT_OUTPUT_LIMIT_EXCEEDED');
      const output = validateOutput(result.finalResponse, request.outputSchema);
      await recordAuditWithoutAffectingResult(() => this.audit(request, workspaceRoot, prompt, started, {
        timedOut, cancelled, stdoutBytes, notificationCount, status: 'SUCCEEDED', errorCode: null,
        providerAttempt, sessionId,
      }));
      return output;
    } catch (error) {
      errorCode = error instanceof Error ? error.message.split(':', 1)[0] ?? 'DSH_AGENT_FAILED' : 'DSH_AGENT_FAILED';
      await recordAuditWithoutAffectingResult(() => this.audit(request, workspaceRoot, prompt, started, {
        timedOut, cancelled, stdoutBytes, notificationCount, status: 'FAILED', errorCode,
        providerAttempt, sessionId,
      }));
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
      if (abort) signal?.removeEventListener('abort', abort);
      await harness.close().catch(() => undefined);
    }
  }

  private async audit(
    request: AgentRequest,
    workspaceRoot: string,
    prompt: string,
    started: Date,
    outcome: Pick<DeepSeekHarnessAuditRecord,
      'timedOut' | 'cancelled' | 'stdoutBytes' | 'notificationCount' | 'status' | 'errorCode'> & {
        providerAttempt: number;
        sessionId: string;
      },
  ): Promise<void> {
    if (!this.onAudit) return;
    const completed = this.clock();
    const { providerAttempt, sessionId, ...auditOutcome } = outcome;
    await this.onAudit({
      schemaVersion: '1.0', provider: 'deepseek-harness-sdk', role: request.role,
      idempotencyKey: request.idempotencyKey, sessionId, workspaceRoot,
      promptSha256: digest(prompt), schemaSha256: digest(JSON.stringify(request.outputSchema)),
      startedAt: started.toISOString(), completedAt: completed.toISOString(),
      durationMs: Math.max(0, completed.getTime() - started.getTime()),
      exitCode: null, stderrBytes: 0, ...auditOutcome,
      metadata: { ...(request.metadata ?? {}), providerAttempt },
    });
  }
}

export class DeepSeekHarnessHeadlessAgent implements AgentProvider {
  readonly command: string;
  readonly args: string[];
  readonly env: NodeJS.ProcessEnv;
  readonly timeoutMs: number;
  readonly terminationGraceMs: number;
  readonly maxOutputBytes: number;
  readonly allowedWorkspaceRoots: string[];
  readonly clock: () => Date;
  readonly onAudit?: DeepSeekHarnessAgentOptions['onAudit'];
  readonly spawnProcess: typeof spawn;

  constructor(options: DeepSeekHarnessAgentOptions) {
    if (options.allowedWorkspaceRoots.length === 0) throw new Error('DSH_AGENT_ALLOWED_ROOT_REQUIRED');
    this.command = options.command ?? 'dsh';
    this.args = options.args ?? ['--profile', 'headless'];
    this.env = { ...process.env, DSH_TELEMETRY_MODE: 'DISABLED', ...options.env };
    this.timeoutMs = options.timeoutMs ?? 300_000;
    this.terminationGraceMs = options.terminationGraceMs ?? 2_000;
    this.maxOutputBytes = options.maxOutputBytes ?? 2 * 1024 * 1024;
    this.allowedWorkspaceRoots = [...options.allowedWorkspaceRoots];
    this.clock = options.clock ?? (() => new Date());
    this.onAudit = options.onAudit;
    this.spawnProcess = options.spawnProcess ?? spawn;
  }

  async run(request: AgentRequest, signal?: AbortSignal): Promise<Record<string, unknown>> {
    if (!request.workspaceRoot) throw new Error('DSH_AGENT_WORKSPACE_REQUIRED');
    if (signal?.aborted) throw new Error('AGENT_CANCELLED');
    const workspaceRoot = canonicalWorkspace(request.workspaceRoot, this.allowedWorkspaceRoots);
    const prompt = providerPrompt(request);
    const started = this.clock();
    let exitCode: number | null = null;
    let timedOut = false;
    let cancelled = false;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let errorCode: string | null = null;
    try {
      const stdout = await new Promise<string>((resolveOutput, reject) => {
        const child = this.spawnProcess(this.command, [...this.args], {
          cwd: workspaceRoot,
          env: this.env,
          shell: false,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        });
        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];
        let settled = false;
        let closed = false;
        let killTimer: NodeJS.Timeout | undefined;
        const terminate = () => {
          if (closed) return;
          try { child.kill('SIGTERM'); } catch { /* process already exited */ }
          if (killTimer) return;
          killTimer = setTimeout(() => {
            if (!closed) {
              try { child.kill('SIGKILL'); } catch { /* process already exited */ }
            }
          }, this.terminationGraceMs);
          killTimer.unref();
        };
        const rejectOnce = (error: Error) => {
          if (settled) return;
          settled = true;
          reject(error);
        };
        const timeout = setTimeout(() => {
          timedOut = true;
          terminate();
          rejectOnce(new Error('DSH_AGENT_TIMEOUT'));
        }, this.timeoutMs);
        const abort = () => {
          cancelled = true;
          terminate();
          rejectOnce(new Error('AGENT_CANCELLED'));
        };
        signal?.addEventListener('abort', abort, { once: true });
        const collect = (target: Buffer[], chunk: Buffer, stream: 'stdout' | 'stderr') => {
          if (settled) return;
          if (stream === 'stdout') stdoutBytes += chunk.byteLength;
          else stderrBytes += chunk.byteLength;
          if (stdoutBytes + stderrBytes > this.maxOutputBytes) {
            terminate();
            rejectOnce(new Error('DSH_AGENT_OUTPUT_LIMIT_EXCEEDED'));
            return;
          }
          target.push(chunk);
        };
        child.stdout.on('data', (chunk: Buffer) => collect(stdoutChunks, chunk, 'stdout'));
        child.stderr.on('data', (chunk: Buffer) => collect(stderrChunks, chunk, 'stderr'));
        child.stdin.on('error', () => {
          terminate();
          rejectOnce(new Error('DSH_AGENT_STDIN_FAILED'));
        });
        child.stdin.end(prompt, 'utf8');
        child.on('error', (error) => {
          closed = true;
          clearTimeout(timeout);
          if (killTimer) clearTimeout(killTimer);
          signal?.removeEventListener('abort', abort);
          rejectOnce(new Error(`DSH_AGENT_SPAWN_FAILED: ${(error as NodeJS.ErrnoException).code ?? 'UNKNOWN'}`));
        });
        child.on('close', (code) => {
          closed = true;
          exitCode = code;
          clearTimeout(timeout);
          if (killTimer) clearTimeout(killTimer);
          signal?.removeEventListener('abort', abort);
          if (settled) return;
          settled = true;
          if (cancelled) reject(new Error('AGENT_CANCELLED'));
          else if (timedOut) reject(new Error('DSH_AGENT_TIMEOUT'));
          else if (code !== 0) reject(new Error('DSH_AGENT_PROCESS_FAILED'));
          else resolveOutput(Buffer.concat(stdoutChunks).toString('utf8'));
        });
      });
      const output = validateOutput(stdout, request.outputSchema);
      await recordAuditWithoutAffectingResult(() => this.audit(request, workspaceRoot, prompt, started, {
        exitCode, timedOut, cancelled, stdoutBytes, stderrBytes, status: 'SUCCEEDED', errorCode: null,
      }));
      return output;
    } catch (error) {
      errorCode = error instanceof Error ? error.message.split(':', 1)[0] ?? 'DSH_AGENT_FAILED' : 'DSH_AGENT_FAILED';
      await recordAuditWithoutAffectingResult(() => this.audit(request, workspaceRoot, prompt, started, {
        exitCode, timedOut, cancelled, stdoutBytes, stderrBytes, status: 'FAILED', errorCode,
      }));
      throw error;
    }
  }

  private async audit(
    request: AgentRequest,
    workspaceRoot: string,
    prompt: string,
    started: Date,
    outcome: Pick<DeepSeekHarnessAuditRecord,
      'exitCode' | 'timedOut' | 'cancelled' | 'stdoutBytes' | 'stderrBytes' | 'status' | 'errorCode'>,
  ): Promise<void> {
    if (!this.onAudit) return;
    const completed = this.clock();
    await this.onAudit({
      schemaVersion: '1.0', provider: 'deepseek-harness-headless', role: request.role,
      idempotencyKey: request.idempotencyKey, workspaceRoot,
      promptSha256: digest(prompt), schemaSha256: digest(JSON.stringify(request.outputSchema)),
      startedAt: started.toISOString(), completedAt: completed.toISOString(),
      durationMs: Math.max(0, completed.getTime() - started.getTime()),
      ...outcome,
      metadata: { ...(request.metadata ?? {}) },
    });
  }
}
