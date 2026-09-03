import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import Ajv2020Import from 'ajv/dist/2020.js';
import type { AgentId, AgentProvider, AgentRequest } from '../../../application/ports/index.ts';

const Ajv2020 = Ajv2020Import as unknown as new (options: Record<string, unknown>) => {
  compile(schema: Record<string, unknown>): {
    (value: unknown): boolean;
    errors?: unknown;
  };
  errorsText(errors: unknown): string;
};

const ROLE_TOOLS: Readonly<Record<AgentId, readonly string[]>> = {
  orchestrator: [],
  'doc-gen': ['read', 'write', 'glob', 'grep'],
  'doc-worker': ['read', 'write', 'glob', 'grep'],
  'test-gen': ['read', 'write', 'glob', 'grep'],
  code: ['read', 'write', 'edit', 'shell', 'glob', 'grep'],
  check: ['read', 'glob', 'grep'],
  review: ['read', 'glob', 'grep'],
};

export interface CompanyCodeAgentAuditRecord {
  schemaVersion: '1.0';
  provider: 'company-codeagent-cli';
  role: AgentId;
  idempotencyKey: string;
  runId: string | null;
  sessionId: string;
  promptSha256: string;
  schemaSha256: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  exitCode: number | null;
  timedOut: boolean;
  cancelled: boolean;
  stdoutBytes: number;
  stderrBytes: number;
  status: 'SUCCEEDED' | 'FAILED';
  errorCode: string | null;
}

export interface CodeAgentSessionStore {
  load(idempotencyKey: string): string | null;
  save(idempotencyKey: string, sessionId: string): void;
}

export class FileCodeAgentSessionStore implements CodeAgentSessionStore {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  load(idempotencyKey: string): string | null {
    try {
      const value = JSON.parse(readFileSync(this.path(idempotencyKey), 'utf8')) as { sessionId?: unknown };
      return typeof value.sessionId === 'string' && value.sessionId.length > 0 ? value.sessionId : null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw new Error('CODEAGENT_SESSION_STORE_INVALID');
    }
  }

  save(idempotencyKey: string, sessionId: string): void {
    if (!sessionId) throw new Error('CODEAGENT_SESSION_INVALID');
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
    const target = this.path(idempotencyKey);
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
    writeFileSync(temporary, `${JSON.stringify({ sessionId })}\n`, { encoding: 'utf8', mode: 0o600 });
    renameSync(temporary, target);
  }

  private path(idempotencyKey: string): string {
    return join(this.root, `${digest(idempotencyKey)}.json`);
  }
}

export interface CompanyCodeAgentCliOptions {
  command?: string;
  runArgs?: string[];
  env?: NodeJS.ProcessEnv;
  model?: string;
  timeoutMs?: number;
  authTimeoutMs?: number;
  terminationGraceMs?: number;
  maxOutputBytes?: number;
  allowedWorkspaceRoots: string[];
  sessionStore: CodeAgentSessionStore;
  clock?: () => Date;
  onAudit?: (record: CompanyCodeAgentAuditRecord) => void | Promise<void>;
  spawnProcess?: typeof spawn;
  killProcessGroup?: (pid: number, signal: NodeJS.Signals) => void;
}

interface ProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  stdoutBytes: number;
  stderrBytes: number;
}

interface OutputEnvelope {
  output: Record<string, unknown>;
  sessionId: string | null;
  role: string | null;
}

function digest(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalWorkspace(requested: string, allowedRoots: string[]): string {
  const workspace = realpathSync(resolve(requested));
  const allowed = allowedRoots.map((root) => realpathSync(resolve(root)));
  if (!allowed.some((root) => {
    const fromRoot = relative(root, workspace);
    return fromRoot === '' || (!fromRoot.startsWith('..') && !isAbsolute(fromRoot));
  })) throw new Error('CODEAGENT_WORKSPACE_DENIED');
  return workspace;
}

function parseObjects(text: string): Record<string, unknown>[] {
  const candidates = [text.trim(), ...text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)];
  const output: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate) as unknown;
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const canonical = JSON.stringify(value);
      if (!seen.has(canonical)) {
        seen.add(canonical);
        output.push(value as Record<string, unknown>);
      }
    } catch {
      // JSONL may contain CLI diagnostics; only valid object records participate.
    }
  }
  return output;
}

function stringField(value: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) if (typeof value[key] === 'string' && value[key]) return value[key] as string;
  return null;
}

function outputEnvelope(stdout: string): OutputEnvelope {
  const records = parseObjects(stdout);
  if (records.length === 0) throw new Error('CODEAGENT_OUTPUT_NOT_JSON');
  for (const record of [...records].reverse()) {
    const type = stringField(record, 'type', 'event');
    const nested = record.result ?? record.output ?? record.data;
    const isFinal = type === null || ['final', 'result', 'completed', 'assistant.final'].includes(type);
    if (!isFinal) continue;
    const output = nested && typeof nested === 'object' && !Array.isArray(nested)
      ? nested as Record<string, unknown> : record;
    return {
      output,
      sessionId: stringField(record, 'sessionId', 'session_id')
        ?? stringField(output, 'sessionId', 'session_id'),
      role: stringField(record, 'role', 'agentType', 'agent_type'),
    };
  }
  throw new Error('CODEAGENT_OUTPUT_NOT_JSON');
}

function validateOutput(output: Record<string, unknown>, schema: Record<string, unknown>): void {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  if (!validate(output)) throw new Error(`AGENT_OUTPUT_INVALID: ${ajv.errorsText(validate.errors)}`);
}

function providerPrompt(request: AgentRequest): string {
  return [
    `你是知识飞轮中的 ${request.role} 节点。`,
    request.prompt,
    '必须只输出一个 JSON 对象，不要使用 Markdown 代码块或补充解释。',
    '输出必须严格符合下面的 JSON Schema：',
    JSON.stringify(request.outputSchema),
    `幂等键：${request.idempotencyKey}`,
  ].join('\n\n');
}

function parseAuth(stdout: string): void {
  const value = parseObjects(stdout).at(-1);
  if (!value) throw new Error('CODEAGENT_AUTH_STATUS_INVALID');
  const status = stringField(value, 'status', 'authStatus', 'auth_status')?.toLowerCase();
  const authenticated = value.authenticated === true || ['authenticated', 'logged_in', 'valid', 'ok'].includes(status ?? '');
  const expiresAt = stringField(value, 'expiresAt', 'expires_at');
  if (authenticated && expiresAt && Date.parse(expiresAt) <= Date.now()) throw new Error('CODEAGENT_AUTH_EXPIRED');
  if (!authenticated) {
    if (value.expired === true || status === 'expired') throw new Error('CODEAGENT_AUTH_EXPIRED');
    throw new Error('CODEAGENT_AUTH_REQUIRED');
  }
}

function classifyExecutionFailure(stderr: string): string {
  const message = stderr.toLowerCase();
  if (/invalid[ _-]?session|session.*(?:invalid|expired|not found)/.test(message)) return 'CODEAGENT_SESSION_INVALID';
  if (/permission|access denied|forbidden|not allowed/.test(message)) return 'CODEAGENT_PERMISSION_DENIED';
  if (/model.*(?:unavailable|not found|disabled)|no such model/.test(message)) return 'CODEAGENT_MODEL_UNAVAILABLE';
  return 'CODEAGENT_EXECUTION_FAILED';
}

function classifyAuthFailure(stderr: string): string {
  const message = stderr.toLowerCase();
  if (/expired|credential.*stale/.test(message)) return 'CODEAGENT_AUTH_EXPIRED';
  if (/not logged|login required|unauthenticated|not authenticated/.test(message)) return 'CODEAGENT_AUTH_REQUIRED';
  return 'CODEAGENT_AUTH_CHECK_FAILED';
}

async function auditWithoutChangingResult(action: () => void | Promise<void>): Promise<void> {
  try { await action(); } catch { /* observability cannot replace execution authority */ }
}

export class CompanyCodeAgentCliAdapter implements AgentProvider {
  readonly command: string;
  readonly runArgs: string[];
  readonly env: NodeJS.ProcessEnv;
  readonly model: string;
  readonly timeoutMs: number;
  readonly authTimeoutMs: number;
  readonly terminationGraceMs: number;
  readonly maxOutputBytes: number;
  readonly allowedWorkspaceRoots: string[];
  readonly sessionStore: CodeAgentSessionStore;
  readonly clock: () => Date;
  readonly onAudit?: CompanyCodeAgentCliOptions['onAudit'];
  readonly spawnProcess: typeof spawn;
  readonly killProcessGroup: (pid: number, signal: NodeJS.Signals) => void;

  constructor(options: CompanyCodeAgentCliOptions) {
    if (options.allowedWorkspaceRoots.length === 0) throw new Error('CODEAGENT_ALLOWED_ROOT_REQUIRED');
    this.command = options.command ?? 'codeagent';
    this.runArgs = [...(options.runArgs ?? ['run'])];
    this.env = { ...process.env, ...options.env };
    this.model = options.model ?? 'company-default';
    this.timeoutMs = options.timeoutMs ?? 600_000;
    this.authTimeoutMs = options.authTimeoutMs ?? 15_000;
    this.terminationGraceMs = options.terminationGraceMs ?? 2_000;
    this.maxOutputBytes = options.maxOutputBytes ?? 2 * 1024 * 1024;
    if (!this.command.trim() || !this.runArgs.every((value) => typeof value === 'string')) {
      throw new Error('CODEAGENT_COMMAND_INVALID');
    }
    if (!this.model.trim()) throw new Error('CODEAGENT_MODEL_INVALID');
    if (![this.timeoutMs, this.authTimeoutMs, this.terminationGraceMs, this.maxOutputBytes]
      .every((value) => Number.isSafeInteger(value) && value > 0)) {
      throw new Error('CODEAGENT_LIMIT_INVALID');
    }
    this.allowedWorkspaceRoots = [...options.allowedWorkspaceRoots];
    this.sessionStore = options.sessionStore;
    this.clock = options.clock ?? (() => new Date());
    this.onAudit = options.onAudit;
    this.spawnProcess = options.spawnProcess ?? spawn;
    this.killProcessGroup = options.killProcessGroup ?? ((pid, signal) => {
      if (process.platform === 'win32') return;
      process.kill(-pid, signal);
    });
  }

  async run(request: AgentRequest, signal?: AbortSignal): Promise<Record<string, unknown>> {
    if (!request.workspaceRoot) throw new Error('CODEAGENT_WORKSPACE_REQUIRED');
    if (!(request.role in ROLE_TOOLS)) throw new Error('CODEAGENT_ROLE_INVALID');
    if (signal?.aborted) throw new Error('AGENT_CANCELLED');
    const role = request.role as AgentId;
    const workspaceRoot = canonicalWorkspace(request.workspaceRoot, this.allowedWorkspaceRoots);
    const started = this.clock();
    let exitCode: number | null = null;
    let timedOut = false;
    let cancelled = false;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let errorCode: string | null = null;
    let sessionId = `wp-${randomUUID().replaceAll('-', '')}`;
    try {
      sessionId = this.sessionStore.load(request.idempotencyKey) ?? sessionId;
      const auth = await this.execute(['auth', 'status', '--json'], '', workspaceRoot, this.authTimeoutMs, signal,
        () => { timedOut = true; }, () => { cancelled = true; });
      try {
        parseAuth(auth.stdout);
      } catch (error) {
        const code = error instanceof Error ? error.message : '';
        if (code === 'CODEAGENT_AUTH_REQUIRED' || code === 'CODEAGENT_AUTH_EXPIRED') throw error;
        if (auth.exitCode !== 0) throw new Error(classifyAuthFailure(auth.stderr));
        throw error;
      }
      if (auth.exitCode !== 0) throw new Error(classifyAuthFailure(auth.stderr));
      const tools = ROLE_TOOLS[role];
      const args = [
        ...this.runArgs, '--non-interactive', '--output', 'jsonl', '--role', role,
        '--session', sessionId, '--model', this.model, '--tools', tools.length ? tools.join(',') : 'none',
      ];
      const result = await this.execute(args, providerPrompt(request), workspaceRoot, this.timeoutMs, signal,
        () => { timedOut = true; }, () => { cancelled = true; });
      exitCode = result.exitCode;
      stdoutBytes = result.stdoutBytes;
      stderrBytes = result.stderrBytes;
      if (result.exitCode !== 0) throw new Error(classifyExecutionFailure(result.stderr));
      const envelope = outputEnvelope(result.stdout);
      if (envelope.role !== null && envelope.role !== role) throw new Error('CODEAGENT_ROLE_MISMATCH');
      validateOutput(envelope.output, request.outputSchema);
      sessionId = envelope.sessionId ?? sessionId;
      this.sessionStore.save(request.idempotencyKey, sessionId);
      await auditWithoutChangingResult(() => this.audit(request, role, sessionId, started, {
        exitCode, timedOut, cancelled, stdoutBytes, stderrBytes, status: 'SUCCEEDED', errorCode: null,
      }));
      return envelope.output;
    } catch (error) {
      errorCode = error instanceof Error ? error.message.split(':', 1)[0] : 'CODEAGENT_EXECUTION_FAILED';
      await auditWithoutChangingResult(() => this.audit(request, role, sessionId, started, {
        exitCode, timedOut, cancelled, stdoutBytes, stderrBytes, status: 'FAILED', errorCode,
      }));
      throw error;
    }
  }

  private execute(
    args: string[], input: string, cwd: string, timeoutMs: number, signal: AbortSignal | undefined,
    markTimedOut: () => void, markCancelled: () => void,
  ): Promise<ProcessResult> {
    return new Promise((resolveResult, reject) => {
      const detached = process.platform !== 'win32';
      const child = this.spawnProcess(this.command, args, {
        cwd, env: this.env, shell: false, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, detached,
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let settled = false;
      let closed = false;
      let killTimer: NodeJS.Timeout | undefined;
      const kill = (kind: NodeJS.Signals) => {
        if (closed || child.pid === undefined) return;
        try {
          if (detached) this.killProcessGroup(child.pid, kind);
          else child.kill(kind);
        } catch { /* already exited */ }
      };
      const terminate = () => {
        kill('SIGTERM');
        if (killTimer) return;
        killTimer = setTimeout(() => kill('SIGKILL'), this.terminationGraceMs);
        killTimer.unref();
      };
      const rejectOnce = (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      const timeout = setTimeout(() => {
        markTimedOut();
        terminate();
        rejectOnce(new Error('CODEAGENT_TIMEOUT'));
      }, timeoutMs);
      timeout.unref();
      const abort = () => {
        markCancelled();
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
          rejectOnce(new Error('CODEAGENT_OUTPUT_LIMIT_EXCEEDED'));
          return;
        }
        target.push(chunk);
      };
      child.stdout.on('data', (chunk: Buffer) => collect(stdout, chunk, 'stdout'));
      child.stderr.on('data', (chunk: Buffer) => collect(stderr, chunk, 'stderr'));
      child.stdin.on('error', () => {
        terminate();
        rejectOnce(new Error('CODEAGENT_STDIN_FAILED'));
      });
      child.stdin.end(input, 'utf8');
      child.on('error', (error) => {
        closed = true;
        clearTimeout(timeout);
        if (killTimer) clearTimeout(killTimer);
        signal?.removeEventListener('abort', abort);
        rejectOnce(new Error(`CODEAGENT_CLI_UNAVAILABLE: ${(error as NodeJS.ErrnoException).code ?? 'UNKNOWN'}`));
      });
      child.on('close', (code) => {
        closed = true;
        clearTimeout(timeout);
        if (killTimer) clearTimeout(killTimer);
        signal?.removeEventListener('abort', abort);
        if (settled) return;
        settled = true;
        resolveResult({
          exitCode: code,
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
          stdoutBytes,
          stderrBytes,
        });
      });
    });
  }

  private async audit(
    request: AgentRequest, role: AgentId, sessionId: string, started: Date,
    outcome: Pick<CompanyCodeAgentAuditRecord,
      'exitCode' | 'timedOut' | 'cancelled' | 'stdoutBytes' | 'stderrBytes' | 'status' | 'errorCode'>,
  ): Promise<void> {
    if (!this.onAudit) return;
    const completed = this.clock();
    await this.onAudit({
      schemaVersion: '1.0', provider: 'company-codeagent-cli', role,
      idempotencyKey: request.idempotencyKey,
      runId: typeof request.metadata?.runId === 'string' ? request.metadata.runId : null,
      sessionId,
      promptSha256: digest(request.prompt), schemaSha256: digest(JSON.stringify(request.outputSchema)),
      startedAt: started.toISOString(), completedAt: completed.toISOString(),
      durationMs: Math.max(0, completed.getTime() - started.getTime()),
      ...outcome,
    });
  }
}
