import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import type { spawn } from 'node:child_process';
import type { AgentId, AgentRequest } from '../../src/application/ports/index.ts';
import {
  CompanyCodeAgentCliAdapter, FileCodeAgentSessionStore,
  type CodeAgentSessionStore, type CompanyCodeAgentAuditRecord,
} from '../../src/infrastructure/agents/company-codeagent/index.ts';

const OUTPUT_SCHEMA = {
  type: 'object', required: ['answer'], additionalProperties: false,
  properties: { answer: { type: 'string', minLength: 1 } },
};

class MemorySessions implements CodeAgentSessionStore {
  readonly values = new Map<string, string>();
  load(key: string) { return this.values.get(key) ?? null; }
  save(key: string, value: string) { this.values.set(key, value); }
}

interface Invocation {
  args: string[];
  options: Record<string, unknown>;
  input: string;
}

function fakeSpawn(handler: (invocation: Invocation) => {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  hang?: boolean;
}): { spawnProcess: typeof spawn; invocations: Invocation[]; signals: string[] } {
  const invocations: Invocation[] = [];
  const signals: string[] = [];
  let pid = 900_000;
  const spawnProcess = ((_command: string, args: string[], options: Record<string, unknown>) => {
    const child = new EventEmitter() as EventEmitter & {
      pid: number;
      stdin: PassThrough;
      stdout: PassThrough;
      stderr: PassThrough;
      kill: (signal?: string) => boolean;
    };
    child.pid = pid += 1;
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = (signal = 'SIGTERM') => { signals.push(signal); return true; };
    const chunks: Buffer[] = [];
    child.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.stdin.on('finish', () => {
      const invocation = { args: [...args], options, input: Buffer.concat(chunks).toString('utf8') };
      invocations.push(invocation);
      const result = handler(invocation);
      if (result.hang) return;
      queueMicrotask(() => {
        if (result.stdout) child.stdout.write(result.stdout);
        if (result.stderr) child.stderr.write(result.stderr);
        child.stdout.end();
        child.stderr.end();
        child.emit('close', result.exitCode ?? 0);
      });
    });
    return child;
  }) as unknown as typeof spawn;
  return { spawnProcess, invocations, signals };
}

function request(role: AgentId, workspaceRoot: string, prompt = `secret prompt for ${role}`): AgentRequest {
  return {
    role, prompt, outputSchema: OUTPUT_SCHEMA,
    idempotencyKey: `idempotency-${role}`, workspaceRoot,
    metadata: { runId: `run-${role}`, ignoredSecret: 'must-not-be-audited' },
  };
}

function adapter(input: {
  workspaceRoot: string;
  sessions?: CodeAgentSessionStore;
  spawnProcess: typeof spawn;
  onAudit?: (record: CompanyCodeAgentAuditRecord) => void;
  timeoutMs?: number;
  processSignals?: string[];
}) {
  return new CompanyCodeAgentCliAdapter({
    command: 'codeagent', model: 'company-model', allowedWorkspaceRoots: [input.workspaceRoot],
    sessionStore: input.sessions ?? new MemorySessions(), spawnProcess: input.spawnProcess,
    onAudit: input.onAudit, timeoutMs: input.timeoutMs, authTimeoutMs: input.timeoutMs,
    terminationGraceMs: 5,
    killProcessGroup: (_pid, signal) => input.processSignals?.push(signal),
  });
}

test('all seven roles use auth preflight, stdin prompts, fixed tools, JSONL, and recoverable sessions', async () => {
  const root = mkdtempSync(join(tmpdir(), 'company-codeagent-'));
  const sessions = new MemorySessions();
  const audits: CompanyCodeAgentAuditRecord[] = [];
  const roles: AgentId[] = ['orchestrator', 'doc-gen', 'doc-worker', 'test-gen', 'code', 'check', 'review'];
  const fake = fakeSpawn(({ args }) => {
    if (args[0] === 'auth') return { stdout: '{"authenticated":true}\n' };
    const role = args[args.indexOf('--role') + 1];
    return {
      stdout: [
        JSON.stringify({ type: 'progress', message: 'working' }),
        JSON.stringify({ type: 'final', role, sessionId: `session-${role}`, result: { answer: role } }),
      ].join('\n'),
    };
  });
  try {
    const provider = adapter({ workspaceRoot: root, sessions, spawnProcess: fake.spawnProcess, onAudit: (value) => audits.push(value) });
    for (const role of roles) assert.deepEqual(await provider.run(request(role, root)), { answer: role });
    assert.equal(fake.invocations.length, 14);
    for (let index = 0; index < roles.length; index += 1) {
      const auth = fake.invocations[index * 2];
      const run = fake.invocations[index * 2 + 1];
      const role = roles[index];
      assert.deepEqual(auth.args, ['auth', 'status', '--json']);
      assert.equal(auth.input, '');
      assert.match(run.input, new RegExp(`secret prompt for ${role}`));
      assert.match(run.input, /JSON Schema/);
      assert.equal(run.options.shell, false);
      assert.equal(run.options.cwd, root);
      assert.ok(!run.args.join(' ').includes('secret prompt'));
      assert.equal(run.args[run.args.indexOf('--role') + 1], role);
      const expectedTools = role === 'orchestrator' ? 'none'
        : role === 'code' ? 'read,write,edit,shell,glob,grep'
          : role === 'check' || role === 'review' ? 'read,glob,grep'
            : 'read,write,glob,grep';
      assert.equal(run.args[run.args.indexOf('--tools') + 1], expectedTools);
      assert.equal(sessions.load(`idempotency-${role}`), `session-${role}`);
    }
    assert.equal(audits.length, 7);
    assert.doesNotMatch(JSON.stringify(audits), /secret prompt|must-not-be-audited/);
    assert.ok(audits.every((value) => value.status === 'SUCCEEDED' && value.promptSha256.length === 64));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('session store survives adapter recreation with owner-only files', async () => {
  const root = mkdtempSync(join(tmpdir(), 'company-codeagent-session-'));
  const sessionRoot = join(root, 'sessions');
  const first = new FileCodeAgentSessionStore(sessionRoot);
  first.save('stable-key', 'recoverable-session');
  const second = new FileCodeAgentSessionStore(sessionRoot);
  try {
    assert.equal(second.load('stable-key'), 'recoverable-session');
    assert.equal(statSync(sessionRoot).mode & 0o777, 0o700);
    const stored = join(sessionRoot, `${await import('node:crypto').then(({ createHash }) => createHash('sha256').update('stable-key').digest('hex'))}.json`);
    assert.equal(statSync(stored).mode & 0o777, 0o600);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('authentication states fail closed before starting an Agent turn', async () => {
  const root = mkdtempSync(join(tmpdir(), 'company-codeagent-auth-'));
  try {
    for (const [body, code] of [
      ['{"authenticated":false}', 'CODEAGENT_AUTH_REQUIRED'],
      ['{"status":"expired"}', 'CODEAGENT_AUTH_EXPIRED'],
      ['not-json', 'CODEAGENT_AUTH_STATUS_INVALID'],
    ]) {
      const fake = fakeSpawn(() => ({ stdout: body }));
      await assert.rejects(adapter({ workspaceRoot: root, spawnProcess: fake.spawnProcess }).run(request('review', root)), new RegExp(code));
      assert.equal(fake.invocations.length, 1);
    }
    const nonzero = fakeSpawn(() => ({ stdout: '{"authenticated":false}', stderr: 'login required', exitCode: 1 }));
    await assert.rejects(adapter({ workspaceRoot: root, spawnProcess: nonzero.spawnProcess }).run(request('review', root)), /CODEAGENT_AUTH_REQUIRED/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('invalid JSON, schema, role, session, permission, and model failures have stable codes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'company-codeagent-errors-'));
  const cases: Array<[string, { stdout?: string; stderr?: string; exitCode?: number }, string]> = [
    ['not-json', { stdout: 'diagnostic only' }, 'CODEAGENT_OUTPUT_NOT_JSON'],
    ['schema', { stdout: '{"answer":1}' }, 'AGENT_OUTPUT_INVALID'],
    ['role', { stdout: '{"type":"final","role":"code","result":{"answer":"x"}}' }, 'CODEAGENT_ROLE_MISMATCH'],
    ['session', { stderr: 'invalid session id', exitCode: 2 }, 'CODEAGENT_SESSION_INVALID'],
    ['permission', { stderr: 'permission denied', exitCode: 2 }, 'CODEAGENT_PERMISSION_DENIED'],
    ['model', { stderr: 'model unavailable', exitCode: 2 }, 'CODEAGENT_MODEL_UNAVAILABLE'],
  ];
  try {
    for (const [, result, code] of cases) {
      const fake = fakeSpawn(({ args }) => args[0] === 'auth' ? { stdout: '{"status":"authenticated"}' } : result);
      await assert.rejects(adapter({ workspaceRoot: root, spawnProcess: fake.spawnProcess }).run(request('review', root)), new RegExp(code));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('timeout and AbortSignal terminate the isolated process group', async () => {
  const root = mkdtempSync(join(tmpdir(), 'company-codeagent-cancel-'));
  try {
    const timeoutFake = fakeSpawn(({ args }) => args[0] === 'auth'
      ? { stdout: '{"authenticated":true}' } : { hang: true });
    const timeoutSignals: string[] = [];
    await assert.rejects(adapter({ workspaceRoot: root, spawnProcess: timeoutFake.spawnProcess, timeoutMs: 10, processSignals: timeoutSignals }).run(request('check', root)), /CODEAGENT_TIMEOUT/);
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    assert.deepEqual(timeoutSignals, ['SIGTERM', 'SIGKILL']);

    const abortFake = fakeSpawn(({ args }) => args[0] === 'auth'
      ? { stdout: '{"authenticated":true}' } : { hang: true });
    const controller = new AbortController();
    const abortSignals: string[] = [];
    const running = adapter({ workspaceRoot: root, spawnProcess: abortFake.spawnProcess, timeoutMs: 1_000, processSignals: abortSignals }).run(request('check', root), controller.signal);
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
    controller.abort();
    await assert.rejects(running, /AGENT_CANCELLED/);
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    assert.deepEqual(abortSignals, ['SIGTERM', 'SIGKILL']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('workspace outside the deployment allowlist is denied before CLI execution', async () => {
  const root = mkdtempSync(join(tmpdir(), 'company-codeagent-root-'));
  const outside = mkdtempSync(join(tmpdir(), 'company-codeagent-outside-'));
  mkdirSync(join(root, 'allowed'));
  const fake = fakeSpawn(() => ({ stdout: '{}' }));
  try {
    await assert.rejects(adapter({ workspaceRoot: join(root, 'allowed'), spawnProcess: fake.spawnProcess }).run(request('code', outside)), /CODEAGENT_WORKSPACE_DENIED/);
    assert.equal(fake.invocations.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
