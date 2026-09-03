import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import type { spawn } from 'node:child_process';
import {
  DeepSeekHarnessHeadlessAgent, DeepSeekHarnessSdkAgent, type DeepSeekHarnessAuditRecord,
} from '../../src/infrastructure/agents/deepseek-harness/index.ts';

const OUTPUT_SCHEMA = {
  type: 'object', required: ['answer'], additionalProperties: false,
  properties: { answer: { type: 'string', minLength: 1 } },
};

function request(workspaceRoot: string) {
  return {
    role: 'doc-gen', prompt: '生成结构化结果。', outputSchema: OUTPUT_SCHEMA,
    idempotencyKey: 'run-1:doc-gen:0', workspaceRoot,
    metadata: { runId: 'run-1', iteration: 0 },
  };
}

function writeFakeSdkRuntime(path: string, mode: 'success' | 'hang' | 'invalid-once' = 'success'): void {
  writeFileSync(path, `
import { createInterface } from 'node:readline';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
let sequence = 0;
const write = (value) => process.stdout.write(JSON.stringify(value) + '\\n');
const notify = (method, params) => write({ jsonrpc: '2.0', method, params });
const event = (sessionId, type, data) => notify('session.event', {
  sessionId, event: { type, seq: sequence++, time: 0, data },
});
createInterface({ input: process.stdin }).on('line', (line) => {
  const frame = JSON.parse(line);
  const respond = (result) => write({ jsonrpc: '2.0', id: frame.id, result });
  if (frame.method === 'initialize') {
    respond({ serverInfo: { name: 'deepseek-harness-sdk-runtime', version: 'test' } });
    return;
  }
  if (frame.method === 'session/prompt') {
    if (${JSON.stringify(mode)} === 'hang') return;
    const sessionId = frame.params.sessionId;
    const prompt = frame.params.contentBlocks[0].text;
    if (process.argv.includes(prompt)) process.exit(19);
    const messageId = 'fake-user-1';
    event(sessionId, 'agent/inbox/spliced', {
      target: 'next-turn', start: 0,
      inserted: [{ id: messageId, role: 'user', content: [], source: { kind: 'user' } }],
    });
    notify('session.status', { sessionId, status: 'running' });
    let procEnvironmentVisible = false;
    try {
      procEnvironmentVisible = Boolean(process.env.FAKE_SECRET_MARKER)
        && readFileSync('/proc/self/environ').includes(Buffer.from(process.env.FAKE_SECRET_MARKER));
    } catch {}
    const retryMarker = '.fake-sdk-retried';
    const responseText = ${JSON.stringify(mode)} === 'invalid-once' && !existsSync(retryMarker)
      ? (writeFileSync(retryMarker, '1'), 'not-json')
      : JSON.stringify({ answer:
          procEnvironmentVisible || (process.env.FAKE_FORBIDDEN_PATH && existsSync(process.env.FAKE_FORBIDDEN_PATH))
            ? 'sandbox-escaped' : 'sdk-validated' });
    event(sessionId, 'assistant/message', {
      turn: 0, step: 0,
      message: { id: 'fake-assistant-1', role: 'assistant',
        content: [{ type: 'text', text: responseText }],
        source: { kind: 'model', provider: 'fake', model: 'fake' } },
    });
    event(sessionId, 'turn/end', { turn: 0, reason: { kind: 'completed' } });
    notify('session.status', { sessionId, status: 'idle' });
    respond({ messageId });
    return;
  }
  if (frame.method === 'shutdown') {
    respond({});
    setImmediate(() => process.exit(0));
  }
});
`);
}

test('DSH SDK bubblewrap runtime can see its role view but not sibling source files', {
  skip: !existsSync('/usr/bin/bwrap'),
}, async () => {
  const root = mkdtempSync(join(tmpdir(), 'wp-dsh-sdk-sandbox-'));
  const workspace = join(root, 'workspace');
  const dshHome = join(root, 'dsh-home');
  const forbidden = join(root, 'reference-source-secret.ts');
  mkdirSync(workspace);
  writeFileSync(forbidden, 'REFERENCE_SOURCE_MUST_NOT_BE_VISIBLE');
  const script = join(workspace, 'fake-sdk.mjs');
  writeFakeSdkRuntime(script);
  try {
    const provider = new DeepSeekHarnessSdkAgent({
      dshBin: script,
      processIsolation: 'bubblewrap',
      dshHome,
      env: {
        ...process.env,
        FAKE_FORBIDDEN_PATH: forbidden,
        FAKE_SECRET_MARKER: 'do-not-expose-test-marker',
      },
      allowedWorkspaceRoots: [workspace], timeoutMs: 3_000,
      initializeTimeoutMs: 1_000, shutdownTimeoutMs: 100,
      disposeEofGraceMs: 100, disposeGraceMs: 100,
    });
    assert.deepEqual(await provider.run(request(workspace)), { answer: 'sdk-validated' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('DSH SDK provider transports prompts over stdin JSON-RPC and validates the final response', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'wp-dsh-sdk-agent-'));
  const script = join(workspace, 'fake-sdk.mjs');
  writeFakeSdkRuntime(script);
  const audits: DeepSeekHarnessAuditRecord[] = [];
  try {
    const provider = new DeepSeekHarnessSdkAgent({
      dshBin: script, allowedWorkspaceRoots: [workspace], timeoutMs: 2_000,
      initializeTimeoutMs: 1_000, shutdownTimeoutMs: 100,
      disposeEofGraceMs: 100, disposeGraceMs: 100,
      onAudit: (record) => { audits.push(record); },
    });
    assert.deepEqual(await provider.run(request(workspace)), { answer: 'sdk-validated' });
    assert.equal(audits[0]?.provider, 'deepseek-harness-sdk');
    assert.equal(audits[0]?.status, 'SUCCEEDED');
    assert.equal((audits[0]?.notificationCount ?? 0) > 0, true);
    assert.equal(JSON.stringify(audits[0]).includes('生成结构化结果'), false);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('DSH SDK audit failure cannot replace a successful Agent result', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'wp-dsh-sdk-audit-'));
  const script = join(workspace, 'fake-sdk.mjs');
  writeFakeSdkRuntime(script);
  const statuses: DeepSeekHarnessAuditRecord['status'][] = [];
  try {
    const provider = new DeepSeekHarnessSdkAgent({
      dshBin: script, allowedWorkspaceRoots: [workspace], timeoutMs: 2_000,
      initializeTimeoutMs: 1_000, shutdownTimeoutMs: 100,
      disposeEofGraceMs: 100, disposeGraceMs: 100,
      onAudit: (record) => {
        statuses.push(record.status);
        throw new Error('AUDIT_WRITE_FAILED');
      },
    });
    assert.deepEqual(await provider.run(request(workspace)), { answer: 'sdk-validated' });
    assert.deepEqual(statuses, ['SUCCEEDED']);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('DSH SDK provider closes a hung runtime at the overall turn deadline', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'wp-dsh-sdk-timeout-'));
  const script = join(workspace, 'fake-sdk.mjs');
  writeFakeSdkRuntime(script, 'hang');
  try {
    const provider = new DeepSeekHarnessSdkAgent({
      dshBin: script, allowedWorkspaceRoots: [workspace], timeoutMs: 100,
      initializeTimeoutMs: 100, shutdownTimeoutMs: 50,
      disposeEofGraceMs: 50, disposeGraceMs: 50,
    });
    await assert.rejects(provider.run(request(workspace)), /DSH_AGENT_TIMEOUT/);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('DSH SDK provider retries a schema failure once with a fresh runtime attempt', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'wp-dsh-sdk-retry-'));
  const script = join(workspace, 'fake-sdk.mjs');
  writeFakeSdkRuntime(script, 'invalid-once');
  const audits: DeepSeekHarnessAuditRecord[] = [];
  try {
    const provider = new DeepSeekHarnessSdkAgent({
      dshBin: script, allowedWorkspaceRoots: [workspace], timeoutMs: 2_000,
      maxSchemaAttempts: 2, initializeTimeoutMs: 1_000, shutdownTimeoutMs: 100,
      disposeEofGraceMs: 100, disposeGraceMs: 100,
      onAudit: (record) => { audits.push(record); },
    });
    assert.deepEqual(await provider.run(request(workspace)), { answer: 'sdk-validated' });
    assert.deepEqual(audits.map((audit) => audit.status), ['FAILED', 'SUCCEEDED']);
    assert.deepEqual(audits.map((audit) => audit.metadata.providerAttempt), [1, 2]);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('DeepSeek Harness provider validates structured output and emits a redacted audit record', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'wp-dsh-agent-'));
  const script = join(workspace, 'fake-dsh.mjs');
  writeFileSync(script, `
import { readFileSync } from 'node:fs';
const prompt = readFileSync(0, 'utf8');
if (process.argv.includes(prompt)) process.exit(19);
if (!prompt.includes('JSON Schema') || !prompt.includes('run-1:doc-gen:0')) process.exit(8);
process.stdout.write(JSON.stringify({ answer: 'validated' }));
`);
  const audits: DeepSeekHarnessAuditRecord[] = [];
  try {
    const provider = new DeepSeekHarnessHeadlessAgent({
      command: process.execPath, args: [script], allowedWorkspaceRoots: [workspace],
      onAudit: (record) => { audits.push(record); },
    });
    const output = await provider.run(request(workspace));
    assert.deepEqual(output, { answer: 'validated' });
    assert.equal(audits.length, 1);
    assert.equal(audits[0]?.status, 'SUCCEEDED');
    assert.equal(audits[0]?.role, 'doc-gen');
    assert.match(audits[0]?.promptSha256 ?? '', /^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(audits[0]).includes('生成结构化结果'), false);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('DSH SDK provider audits and closes when harness.run throws synchronously', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'wp-dsh-sdk-sync-failure-'));
  const audits: DeepSeekHarnessAuditRecord[] = [];
  let closed = false;
  try {
    const provider = new DeepSeekHarnessSdkAgent({
      allowedWorkspaceRoots: [workspace], timeoutMs: 50,
      harnessFactory: () => ({
        run: (() => { throw new Error('DSH_RUN_SYNC_FAILED'); }) as never,
        close: async () => { closed = true; },
      }),
      onAudit: (record) => { audits.push(record); },
    });
    await assert.rejects(provider.run(request(workspace)), /DSH_RUN_SYNC_FAILED/);
    assert.equal(closed, true);
    assert.deepEqual(audits.map((audit) => [audit.status, audit.errorCode]), [
      ['FAILED', 'DSH_RUN_SYNC_FAILED'],
    ]);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('DeepSeek Harness headless provider escalates to SIGKILL when SIGTERM does not close the child', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'wp-dsh-agent-timeout-'));
  const signals: NodeJS.Signals[] = [];
  class IgnoringChild extends EventEmitter {
    readonly stdin = new PassThrough();
    readonly stdout = new PassThrough();
    readonly stderr = new PassThrough();
    killed = false;

    kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
      signals.push(signal);
      this.killed = true;
      if (signal === 'SIGKILL') setImmediate(() => this.emit('close', null, signal));
      return true;
    }
  }
  const child = new IgnoringChild();
  try {
    const provider = new DeepSeekHarnessHeadlessAgent({
      command: 'fake-dsh',
      allowedWorkspaceRoots: [workspace],
      timeoutMs: 5,
      terminationGraceMs: 5,
      spawnProcess: (() => child) as unknown as typeof spawn,
    });
    await assert.rejects(provider.run(request(workspace)), /DSH_AGENT_TIMEOUT/);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('DeepSeek Harness headless audit failure cannot replace success or the original execution error', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'wp-dsh-agent-audit-'));
  const successScript = join(workspace, 'success.mjs');
  const failureScript = join(workspace, 'failure.mjs');
  writeFileSync(successScript, `process.stdout.write(JSON.stringify({ answer: 'validated' }));\n`);
  writeFileSync(failureScript, `process.stdout.write(JSON.stringify({ wrong: true }));\n`);
  const statuses: DeepSeekHarnessAuditRecord['status'][] = [];
  const options = {
    command: process.execPath,
    allowedWorkspaceRoots: [workspace],
    onAudit: (record: DeepSeekHarnessAuditRecord) => {
      statuses.push(record.status);
      throw new Error('AUDIT_WRITE_FAILED');
    },
  };
  try {
    const successful = new DeepSeekHarnessHeadlessAgent({ ...options, args: [successScript] });
    assert.deepEqual(await successful.run(request(workspace)), { answer: 'validated' });
    const failing = new DeepSeekHarnessHeadlessAgent({ ...options, args: [failureScript] });
    await assert.rejects(failing.run(request(workspace)), /AGENT_OUTPUT_INVALID/);
    assert.deepEqual(statuses, ['SUCCEEDED', 'FAILED']);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('DeepSeek Harness provider selects the last schema-valid object from a duplicated final answer', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'wp-dsh-agent-duplicated-'));
  const script = join(workspace, 'fake-dsh.mjs');
  writeFileSync(script, `process.stdout.write('{"wrong":true}\\n\\n{"answer":"last-valid"}\\n');\n`);
  try {
    const provider = new DeepSeekHarnessHeadlessAgent({
      command: process.execPath, args: [script], allowedWorkspaceRoots: [workspace],
    });
    assert.deepEqual(await provider.run(request(workspace)), { answer: 'last-valid' });
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('DeepSeek Harness provider ignores unmatched quotes in CLI diagnostics before JSON', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'wp-dsh-agent-diagnostics-'));
  const script = join(workspace, 'fake-dsh.mjs');
  const output = 'diagnostic: model said "unfinished\n{"answer":"valid-after-log"}\n';
  writeFileSync(script, `process.stdout.write(${JSON.stringify(output)});\n`);
  try {
    const provider = new DeepSeekHarnessHeadlessAgent({
      command: process.execPath, args: [script], allowedWorkspaceRoots: [workspace],
    });
    assert.deepEqual(await provider.run(request(workspace)), { answer: 'valid-after-log' });
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('DeepSeek Harness provider fails closed on schema-invalid model output', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'wp-dsh-agent-invalid-'));
  const script = join(workspace, 'fake-dsh.mjs');
  writeFileSync(script, `process.stdout.write(JSON.stringify({ wrong: true }));\n`);
  try {
    const provider = new DeepSeekHarnessHeadlessAgent({
      command: process.execPath, args: [script], allowedWorkspaceRoots: [workspace],
    });
    await assert.rejects(provider.run(request(workspace)), /AGENT_OUTPUT_INVALID/);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('DeepSeek Harness provider denies workspaces outside the deployment allowlist', async () => {
  const allowed = mkdtempSync(join(tmpdir(), 'wp-dsh-agent-allowed-'));
  const denied = mkdtempSync(join(tmpdir(), 'wp-dsh-agent-denied-'));
  try {
    const provider = new DeepSeekHarnessHeadlessAgent({
      command: process.execPath, args: ['-e', 'process.stdout.write(`{}`)'],
      allowedWorkspaceRoots: [allowed],
    });
    await assert.rejects(provider.run(request(denied)), /DSH_AGENT_WORKSPACE_DENIED/);
  } finally {
    rmSync(allowed, { recursive: true, force: true });
    rmSync(denied, { recursive: true, force: true });
  }
});

test('DeepSeek Harness provider accepts a nested workspace on the host path platform', async () => {
  const allowed = mkdtempSync(join(tmpdir(), 'wp-dsh-agent-nested-'));
  const workspace = join(allowed, 'run', 'agent');
  mkdirSync(workspace, { recursive: true });
  const script = join(allowed, 'fake-dsh.mjs');
  writeFileSync(script, 'process.stdout.write(JSON.stringify({ answer: "nested" }));\n');
  try {
    const provider = new DeepSeekHarnessHeadlessAgent({
      command: process.execPath, args: [script], allowedWorkspaceRoots: [allowed],
    });
    assert.deepEqual(await provider.run(request(workspace)), { answer: 'nested' });
  } finally {
    rmSync(allowed, { recursive: true, force: true });
  }
});
