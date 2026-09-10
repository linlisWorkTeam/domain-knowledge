/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：用无模型端口验证真实验收入口的持久次数、互斥、预检与取消。
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { acceptanceReason, parseAcceptanceArguments, runMvpAcceptance, type AcceptanceBackend, type AcceptanceOptions } from './RunMvpAcceptance.ts';

function options() {
  const root = mkdtempSync(join(tmpdir(), 'mvp-ledger-'));
  const paths: AcceptanceOptions = { source: join(root, 'source'), runtime: join(root, 'runtime'), evidence: join(root, 'evidence') };
  mkdirSync(paths.source);
  return { paths, close: () => rmSync(root, { recursive: true, force: true }) };
}
function backend(overrides: Partial<AcceptanceBackend> = {}): AcceptanceBackend {
  return { preflight: async () => {}, start: async () => ({ runId: 'controlled-run' }),
    wait: async () => ({ executionStatus: 'FAILED', error: 'SECRET_KEY_DO_NOT_PRINT: https://token.example.invalid' }),
    cancel: async () => {}, summarize: async () => ({ gates: [], publications: [], completedRoles: [] }), close: () => {}, ...overrides };
}
function ledger(paths: AcceptanceOptions) { return JSON.parse(readFileSync(join(paths.runtime, 'MvpAcceptanceLedger.json'), 'utf8')); }
function deferred() { let resolve!: () => void; const promise = new Promise<void>((done) => { resolve = done; }); return { promise, resolve }; }

test('real acceptance: installed current symlink enters the CLI and fails missing arguments', () => {
  const fixture = options();
  try {
    const entry = join(fixture.paths.source, 'Acceptance.ts');
    symlinkSync(fileURLToPath(new URL('./RunMvpAcceptance.ts', import.meta.url)), entry);
    const result = spawnSync(process.execPath, [entry], { encoding: 'utf8', timeout: 10_000 });
    assert.equal(result.status, 1, 'a symlink invocation must execute the CLI instead of silently returning success');
    assert.match(result.stderr, /ACCEPTANCE_ARGUMENT_INVALID/);
    assert.equal(existsSync(fixture.paths.runtime), false);
  } finally { fixture.close(); }
});

test('real acceptance: preflight failures consume no attempt and never start the model port', async () => {
  const fixture = options(); let starts = 0;
  try {
    await assert.rejects(runMvpAcceptance(fixture.paths, { backend: () => backend({
      preflight: async () => { throw new Error('ACCEPTANCE_MODEL_REQUIRED'); }, start: async () => { starts++; return { runId: 'wrong' }; },
    }) }), /ACCEPTANCE_MODEL_REQUIRED/);
    assert.equal(starts, 0);
    assert.equal(existsSync(join(fixture.paths.runtime, 'MvpAcceptanceLedger.json')), false);
    assert.equal(existsSync(join(fixture.paths.runtime, 'MvpAcceptance.lock')), false);
  } finally { fixture.close(); }
});

test('real acceptance: failed starts remain charged across invocations and the fourth cannot start', async () => {
  const fixture = options(); let starts = 0;
  try {
    for (let index = 1; index <= 3; index++) {
      const report = await runMvpAcceptance(fixture.paths, { backend: () => backend({
        start: async () => { starts++; throw new Error('SECRET_KEY_DO_NOT_PRINT'); },
      }) });
      assert.equal(report.attempt, index);
      assert.equal(report.outcome, 'FAILED');
      assert.equal(report.reasonCode, 'ACCEPTANCE_FAILED');
      assert.doesNotMatch(readFileSync(report.reportPath, 'utf8'), /SECRET_KEY_DO_NOT_PRINT|token.example/);
    }
    await assert.rejects(runMvpAcceptance(fixture.paths, { backend: () => backend({ start: async () => { starts++; return { runId: 'fourth' }; } }) }), /LIMIT_REACHED/);
    assert.equal(starts, 3);
    assert.equal(ledger(fixture.paths).attempts.length, 3);
  } finally { fixture.close(); }
});

test('real acceptance: a concurrent invocation cannot enter while preflight holds the runtime lock', async () => {
  const fixture = options(); const entered = deferred(); const release = deferred(); let secondPreflight = false;
  try {
    const first = runMvpAcceptance(fixture.paths, { backend: () => backend({ preflight: async () => { entered.resolve(); await release.promise; } }) });
    await entered.promise;
    await assert.rejects(runMvpAcceptance(fixture.paths, { backend: () => backend({ preflight: async () => { secondPreflight = true; } }) }), /ACCEPTANCE_LOCKED/);
    assert.equal(secondPreflight, false);
    release.resolve(); await first;
    assert.equal(ledger(fixture.paths).attempts.length, 1);
  } finally { release.resolve(); fixture.close(); }
});

test('real acceptance: cancellation waits for shutdown and preserves the charged run', async () => {
  const fixture = options(); const controller = new AbortController(); const waiting = deferred();
  const order: string[] = [];
  try {
    const report = await runMvpAcceptance(fixture.paths, { signal: controller.signal, backend: () => backend({
      start: async () => { queueMicrotask(() => controller.abort()); return { runId: 'cancelled-run' }; },
      wait: async () => { await waiting.promise; order.push('settled'); return { executionStatus: 'CANCELLED' }; },
      cancel: async () => { order.push('cancel'); await Promise.resolve(); waiting.resolve(); order.push('shutdown'); },
      close: () => { order.push('closed'); },
    }) });
    assert.equal(report.outcome, 'CANCELLED');
    assert.equal(ledger(fixture.paths).attempts[0].runId, 'cancelled-run');
    assert.equal(ledger(fixture.paths).attempts[0].status, 'CANCELLED');
    assert.ok(order.indexOf('closed') > order.indexOf('shutdown'));
    assert.equal(existsSync(join(fixture.paths.runtime, 'MvpAcceptance.lock')), false);
  } finally { fixture.close(); }
});

test('real acceptance: a dead owner lock can recover without resetting an interrupted ledger', async () => {
  const fixture = options();
  try {
    mkdirSync(fixture.paths.runtime);
    writeFileSync(join(fixture.paths.runtime, 'MvpAcceptanceLedger.json'), JSON.stringify({ schemaVersion: 'mvp-real-attempts-v1',
      attempts: [{ ordinal: 1, startedAt: '2026-09-09T00:00:00Z', status: 'STARTING' }] }));
    writeFileSync(join(fixture.paths.runtime, 'MvpAcceptance.lock'), JSON.stringify({ pid: 2147483647, identity: 'terminated', nonce: 'old' }));
    const report = await runMvpAcceptance(fixture.paths, { backend: () => backend() });
    assert.equal(report.attempt, 2);
    assert.equal(ledger(fixture.paths).attempts[0].status, 'STARTING');
    assert.equal(ledger(fixture.paths).attempts.length, 2);
  } finally { fixture.close(); }
});

test('real acceptance: CLI rejects credentials and source tree writes, and errors are allowlisted', async () => {
  assert.throws(() => parseAcceptanceArguments(['--api-key', 'secret']), /ARGUMENT_INVALID/);
  assert.throws(() => parseAcceptanceArguments(['--source', '/a', '--runtime', '/b']), /ARGUMENT_INVALID/);
  assert.equal(acceptanceReason(new Error('secret-key: provider failed')), 'ACCEPTANCE_FAILED');
  assert.equal(acceptanceReason(new Error('TEST_ORACLE_REJECTED: private response')), 'TEST_ORACLE_REJECTED');
  const fixture = options();
  try {
    await assert.rejects(runMvpAcceptance({ ...fixture.paths, runtime: join(fixture.paths.source, 'runtime') }, { backend: () => backend() }), /DIRECTORY_INVALID/);
    assert.equal(existsSync(join(fixture.paths.source, 'runtime')), false);
    mkdirSync(fixture.paths.runtime);
    writeFileSync(join(fixture.paths.runtime, 'MvpAcceptanceLedger.json'), 'null');
    await assert.rejects(runMvpAcceptance(fixture.paths, { backend: () => backend() }), /ACCEPTANCE_LEDGER_INVALID/);
    assert.equal(readFileSync(join(fixture.paths.runtime, 'MvpAcceptanceLedger.json'), 'utf8'), 'null');
  } finally { fixture.close(); }
});


test('real acceptance: explicit hash-bound authorization preserves three attempts and allows only the fourth', async () => {
  const fixture = options(); let starts = 0;
  try {
    for (let i = 0; i < 3; i++) await runMvpAcceptance(fixture.paths, { backend: () => backend() });
    const path = join(fixture.paths.runtime, 'MvpAcceptanceLedger.json');
    const before = readFileSync(path, 'utf8');
    const authorization = join(fixture.paths.runtime, 'Authorization.json');
    const grant = { authorizationId: 'user-approved-fourth', approvedAt: '2026-09-10T00:00:00Z',
      previousLedgerSha256: createHash('sha256').update(before).digest('hex'), maximumAttempts: 4 };
    writeFileSync(authorization, JSON.stringify({ ...grant, previousLedgerSha256: '0'.repeat(64) }));
    await assert.rejects(runMvpAcceptance({ ...fixture.paths, authorization }, { backend: () => backend() }), /AUTHORIZATION_INVALID/);
    assert.equal(readFileSync(path, 'utf8'), before);
    writeFileSync(authorization, JSON.stringify(grant));
    const report = await runMvpAcceptance({ ...fixture.paths, authorization }, { backend: () => backend({ start: async () => { starts++; return { runId: 'fourth' }; } }) });
    assert.equal(report.attempt, 4);
    assert.deepEqual(ledger(fixture.paths).attempts.slice(0, 3), JSON.parse(before).attempts);
    assert.equal(ledger(fixture.paths).schemaVersion, 'mvp-real-attempts-v2');
    for (const input of [fixture.paths, { ...fixture.paths, authorization }]) {
      await assert.rejects(runMvpAcceptance(input, { backend: () => backend({ start: async () => { starts++; return { runId: 'fifth' }; } }) }), /LIMIT_REACHED/);
    }
    assert.equal(starts, 1);
    const modified = ledger(fixture.paths); modified.attempts[0].status = 'PASSED';
    writeFileSync(path, JSON.stringify(modified));
    await assert.rejects(runMvpAcceptance(fixture.paths, { backend: () => backend() }), /LEDGER_INVALID/);
  } finally { fixture.close(); }
});
