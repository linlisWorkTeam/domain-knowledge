import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
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
  try {
    const report = await buildDemoReport({
      runId: run.runId, runtimeDir, repository: composition.repository,
      service: composition.service, artifacts: composition.artifacts,
      clock: () => new Date('2026-09-02T00:00:02.000Z'),
    });
    assert.equal((report.snapshot as { run: { runId: string } }).run.runId, run.runId);
    assert.equal((report.agentCalls as unknown[]).length, 1);
    assert.equal(JSON.stringify(report).includes('PROMPT_MUST_NOT_LEAK'), false);
    assert.equal(JSON.stringify(report).includes('SECRET_MUST_NOT_LEAK'), false);
    assert.deepEqual(report.artifactIntegrity, { total: 0, verified: 0, failed: [] });
  } finally {
    composition.close();
    rmSync(runtimeDir, { recursive: true, force: true });
  }
});
