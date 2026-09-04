import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { SQLiteOperationalMetrics } from '../../src/infrastructure/observability/sqlite-operational-metrics.ts';
import { createComposition } from '../../src/interfaces/runner/composition.ts';
import { buildDemoReport } from '../../src/interfaces/runner/demo-report.ts';

test('demo report exports authoritative run facts and allowlisted Agent audit fields only', async () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), 'wp-demo-report-'));
  const composition = createComposition({ runtimeDir });
  const run = composition.service.createRun('demo-module', 'local-v1');
  const auditDir = join(runtimeDir, 'demo');
  mkdirSync(auditDir);
  writeFileSync(join(auditDir, 'agent-runs.jsonl'), `${JSON.stringify({
    provider: 'deepseek-harness-sdk', role: 'code', idempotencyKey: `${run.runId}:code:0`,
    workspaceRoot: '/isolated/code', promptSha256: 'a'.repeat(64), schemaSha256: 'b'.repeat(64),
    startedAt: '2026-09-02T00:00:00.000Z', completedAt: '2026-09-02T00:00:01.000Z',
    durationMs: 1000, status: 'SUCCEEDED', errorCode: null, notificationCount: 3,
    metadata: { runId: run.runId, nodeId: 'code', iteration: 0 },
    prompt: 'PROMPT_MUST_NOT_LEAK', credential: 'SECRET_MUST_NOT_LEAK',
  })}\n`);
  const piStartedAt = '2026-09-02T00:00:02.000Z';
  const piCompletedAt = '2026-09-02T00:00:03.000Z';
  appendFileSync(join(auditDir, 'agent-runs.jsonl'), `${JSON.stringify({
    provider: 'pi-agent', role: 'doc-gen', idempotencyKey: 'PI_KEY_MUST_NOT_LEAK',
    workspaceRoot: '/PI_PATH_MUST_NOT_LEAK', promptSha256: 'c'.repeat(64), schemaSha256: 'd'.repeat(64),
    startedAt: piStartedAt, completedAt: piCompletedAt, durationMs: 1000,
    status: 'FAILED', errorCode: 'AGENT_OUTPUT_INVALID', notificationCount: 0,
    metadata: { runId: run.runId }, prompt: 'PI_PROMPT_MUST_NOT_LEAK',
  })}\n`);
  const metrics = new SQLiteOperationalMetrics(composition.repository.database);
  metrics.recordProviderInvocation({
    invocationId: 'pi-report-target', runId: run.runId, agentId: 'doc-gen',
    provider: 'pi-agent', model: 'MODEL_BODY_MUST_NOT_LEAK',
    startedAt: piStartedAt, completedAt: piCompletedAt, durationMs: 1000,
    status: 'FAILED', retryCount: 1,
    inputTokens: 12, outputTokens: 5, cacheReadTokens: 2, cacheWriteTokens: 1,
    estimatedCostUsd: null, fixture: false, errorCode: 'AGENT_OUTPUT_INVALID',
  });
  metrics.recordProviderInvocation({
    invocationId: 'pi-report-target-2', runId: run.runId, agentId: 'doc-gen',
    provider: 'pi-agent', model: 'MODEL_BODY_MUST_NOT_LEAK',
    startedAt: piStartedAt, completedAt: piCompletedAt, durationMs: 1000,
    status: 'FAILED', retryCount: 1,
    inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0,
    estimatedCostUsd: null, fixture: false, errorCode: 'AGENT_OUTPUT_INVALID',
  });
  const unrelated = composition.service.createRun('other-module', 'local-v1');
  metrics.recordProviderInvocation({
    invocationId: 'pi-report-other', runId: unrelated.runId, agentId: 'review',
    provider: 'pi-agent', model: 'other-model',
    startedAt: piStartedAt, completedAt: piCompletedAt, durationMs: 1000,
    status: 'SUCCEEDED', retryCount: 0,
    inputTokens: 999, outputTokens: 999, cacheReadTokens: 0, cacheWriteTokens: 0,
    estimatedCostUsd: 99, fixture: false, errorCode: null,
  });
  try {
    const report = await buildDemoReport({
      runId: run.runId, runtimeDir, repository: composition.repository,
      service: composition.service, artifacts: composition.artifacts,
      clock: () => new Date('2026-09-02T00:00:02.000Z'),
    });
    assert.equal((report.snapshot as { run: { runId: string } }).run.runId, run.runId);
    const calls = report.agentCalls as Array<Record<string, unknown>>;
    assert.equal(calls.length, 3,
      'one file duplicate is replaced, while distinct persisted attempts remain separate');
    const piCalls = calls.filter((call) => call.provider === 'pi-agent');
    assert.equal(piCalls.length, 2);
    const pi = piCalls.find((call) => (call.tokens as { total?: number })?.total === 20);
    assert.deepEqual(pi, {
      provider: 'pi-agent', role: 'doc-gen',
      startedAt: piStartedAt, completedAt: piCompletedAt, durationMs: 1000,
      status: 'FAILED', retryCount: 1,
      tokens: { input: 12, output: 5, cacheRead: 2, cacheWrite: 1, total: 20 },
      estimatedCostUsd: null, errorCode: 'AGENT_OUTPUT_INVALID',
    });
    assert.equal(JSON.stringify(report).includes('PROMPT_MUST_NOT_LEAK'), false);
    assert.equal(JSON.stringify(report).includes('SECRET_MUST_NOT_LEAK'), false);
    assert.doesNotMatch(
      JSON.stringify(report),
      /PI_KEY_MUST_NOT_LEAK|PI_PATH_MUST_NOT_LEAK|MODEL_BODY_MUST_NOT_LEAK/,
    );
    assert.equal(calls.some((call) => {
      const tokens = call.tokens as { input?: number; output?: number } | undefined;
      return tokens?.input === 999 || tokens?.output === 999;
    }), false);
    assert.deepEqual(report.artifactIntegrity, { total: 0, verified: 0, failed: [] });
  } finally {
    composition.close();
    rmSync(runtimeDir, { recursive: true, force: true });
  }
});
