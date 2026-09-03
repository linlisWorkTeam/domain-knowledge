import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createKnowledgeServer, mapHttpError, resolveServerBinding } from '../../src/interfaces/runner/server.ts';
import { GOOD_BODY } from '../helpers/fixture.ts';

test('server binding defaults to config and supports explicit deployment overrides', () => {
  assert.deepEqual(
    resolveServerBinding({ host: '127.0.0.1', port: 4174 }, {}),
    { host: '127.0.0.1', port: 4174 },
  );
  assert.deepEqual(
    resolveServerBinding(
      { host: '127.0.0.1', port: 4174 },
      { WP_KNOWLEDGE_HOST: '0.0.0.0', WP_KNOWLEDGE_PORT: '8080' },
    ),
    { host: '0.0.0.0', port: 8080 },
  );
  assert.throws(
    () => resolveServerBinding({ host: '127.0.0.1', port: 4174 }, { WP_KNOWLEDGE_PORT: 'invalid' }),
    /WP_KNOWLEDGE_PORT must be 1\.\.65535/,
  );
});

test('HTTP errors distinguish client failures without exposing unexpected internals', () => {
  const invalid = mapHttpError(new Error('PAYLOAD_INVALID'), 'req_test');
  assert.equal(invalid.status, 422);
  assert.deepEqual(invalid.body.error, {
    code: 'PAYLOAD_INVALID', message: 'PAYLOAD_INVALID', requestId: 'req_test', retryable: false, details: {},
  });
  assert.deepEqual(mapHttpError(new Error('WORKFLOW_ALREADY_RUNNING: run-1')), {
    status: 409,
    body: { error: { code: 'WORKFLOW_ALREADY_RUNNING', message: 'WORKFLOW_ALREADY_RUNNING: run-1', requestId: 'req_unknown', retryable: false, details: {} } },
  });
  const internal = mapHttpError(new Error('database path D:\\secret failed'));
  assert.equal(internal.status, 500);
  assert.equal(internal.body.error.code, 'INTERNAL_ERROR');
  assert.doesNotMatch(JSON.stringify(internal.body), /secret/);
});

test('HTTP adapter rejects missing credentials and accepts authenticated candidates', async () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), 'wp-server-'));
  const instance = createKnowledgeServer({ runtimeDir, writeToken: 'test-secret' });
  instance.server.listen(0, '127.0.0.1');
  await once(instance.server, 'listening');
  const address = instance.server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.equal((await fetch(`${base}/api/v1/system/status`)).status, 200);
    const denied = await fetch(`${base}/api/v1/knowledge/candidates`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    assert.equal(denied.status, 401);
    const malformed = await fetch(`${base}/api/v1/knowledge/candidates`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-secret' },
      body: '{',
    });
    assert.equal(malformed.status, 422);
    assert.equal((await malformed.json()).error.code, 'PAYLOAD_INVALID');
    const accepted = await fetch(`${base}/api/v1/knowledge/candidates`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-secret' },
      body: JSON.stringify({
        moduleId: 'server-card', body: GOOD_BODY, title: 'Server Card',
        description: 'Authenticated candidate ingestion.',
        provenance: [{ path: 'specs/README.md', commit: 'abc123', pinned: true }],
      }),
    });
    assert.equal(accepted.status, 201);
    const payload = await accepted.json();
    assert.equal(payload.version.status, 'CANDIDATE');
    const defaultQuery = await fetch(`${base}/api/v1/knowledge?q=${encodeURIComponent('行为')}`);
    const defaultQueryPayload = await defaultQuery.json();
    assert.equal(defaultQueryPayload.items.length, 1);
    assert.equal(defaultQueryPayload.items[0].status, 'CANDIDATE');
    const verifiedQuery = await fetch(`${base}/api/v1/knowledge?q=${encodeURIComponent('行为')}&status=VERIFIED`);
    assert.equal((await verifiedQuery.json()).items.length, 0);
    const allStatusQuery = await fetch(`${base}/api/v1/knowledge?q=${encodeURIComponent('行为')}&status=CANDIDATE`);
    const allStatusPayload = await allStatusQuery.json();
    assert.equal(allStatusPayload.items.length, 1);
    assert.equal(allStatusPayload.items[0].status, 'CANDIDATE');
    assert.equal(allStatusPayload.nextCursor, null);
    assert.ok(allStatusPayload.sampledAt);
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /知识飞轮控制台/);

    const capabilities = await (await fetch(`${base}/api/v1/system/capabilities`)).json();
    assert.equal(capabilities.writeEnabled, true);
    assert.equal(capabilities.automatedWorkflow, true);
    assert.equal(capabilities.langGraphInfrastructure, true);
    assert.equal(capabilities.agentPromptTransport, 'in-process-fixture');
    assert.equal(capabilities.agentSourceIsolation, 'not-proven');
    assert.equal(capabilities.hostileCodeIsolation, false);

    const agents = await (await fetch(`${base}/api/v1/agents`)).json();
    assert.equal(agents.agents.length, 7);
    assert.deepEqual(agents.agents.map((agent: { agentId: string }) => agent.agentId), [
      'orchestrator', 'doc-gen', 'doc-worker', 'test-gen', 'code', 'check', 'review',
    ]);

    const authHeaders = { 'content-type': 'application/json', authorization: 'Bearer test-secret' };
    const configuredAgent = await fetch(`${base}/api/v1/agents/doc-gen/prompt`, {
      method: 'PUT', headers: authHeaders, body: JSON.stringify({ promptAddon: '优先写清适用边界。' }),
    });
    assert.equal(configuredAgent.status, 200);
    const configuredAgentPayload = await configuredAgent.json();
    assert.equal(configuredAgentPayload.promptAddon, '优先写清适用边界。');
    assert.equal(configuredAgentPayload.revision, 1);
    const deniedAgentMutation = await fetch(`${base}/api/v1/agents/doc-gen/prompt`, {
      method: 'PUT', headers: authHeaders,
      body: JSON.stringify({ promptAddon: 'ok', tools: ['Bash'] }),
    });
    assert.equal(deniedAgentMutation.status, 422);
    assert.match(JSON.stringify(await deniedAgentMutation.json()), /only promptAddon/);
    const deniedPromptType = await fetch(`${base}/api/v1/agents/doc-gen/prompt`, {
      method: 'PUT', headers: authHeaders,
      body: JSON.stringify({ promptAddon: { text: 'not a string' } }),
    });
    assert.equal(deniedPromptType.status, 422);
    assert.match(JSON.stringify(await deniedPromptType.json()), /must be a string/);
    const feedbackResponse = await fetch(`${base}/api/v1/knowledge/${encodeURIComponent(payload.version.versionId)}/feedback`, {
      method: 'POST', headers: authHeaders, body: JSON.stringify({ action: 'hit' }),
    });
    assert.equal(feedbackResponse.status, 200);
    const scanResponse = await fetch(`${base}/api/v1/sources/scan`);
    assert.equal(scanResponse.status, 200);
    const runWithoutIdempotency = await fetch(`${base}/api/v1/runs`, {
      method: 'POST', headers: authHeaders, body: JSON.stringify({ repositoryRoot: '/tmp' }),
    });
    assert.equal(runWithoutIdempotency.status, 422);
    assert.equal((await runWithoutIdempotency.json()).error.code, 'IDEMPOTENCY_KEY_REQUIRED');
    const created = instance.composition.service.createRun('server-card', 'local-v1');
    const runId = created.runId;

    const runsPayload = await (await fetch(`${base}/api/v1/runs`)).json();
    assert.equal(runsPayload.items.length, 1);
    assert.equal(runsPayload.items[0].runId, runId);
    const plannedRuns = await (await fetch(`${base}/api/v1/runs?status=CREATED`)).json();
    assert.equal(plannedRuns.items.length, 1);

    const snapshotResponse = await fetch(`${base}/api/v1/runs/${encodeURIComponent(runId)}`);
    assert.equal(snapshotResponse.status, 200);
    const snapshot = await snapshotResponse.json();
    assert.equal(snapshot.run.runId, runId);
    assert.equal(snapshot.evaluations.length, 0);
    assert.equal(snapshot.publications.length, 0);
    assert.ok(snapshot.events.length >= 1);
    assert.deepEqual(snapshot.events.map((record: { eventSeq: number }) => record.eventSeq),
      snapshot.events.map((_: unknown, index: number) => index + 1));

    const demoResponse = await fetch(`${base}/api/v1/runs/${encodeURIComponent(runId)}/report`);
    assert.equal(demoResponse.status, 200);
    assert.match(demoResponse.headers.get('content-disposition') ?? '', /attachment/);
    const demoReport = await demoResponse.json();
    assert.equal(demoReport.snapshot.run.runId, runId);
    assert.equal(demoReport.snapshot.publications.length, 0);
    assert.equal(demoReport.artifactIntegrity.failed.length, 0);

    const eventTail = await (await fetch(
      `${base}/api/v1/runs/${encodeURIComponent(runId)}/events?after=0`,
    )).json();
    assert.ok(eventTail.events.length > 0);
    assert.ok(eventTail.events.every((record: { eventSeq: number }) => record.eventSeq > 0));
    const invalidEventCursor = await fetch(
      `${base}/api/v1/runs/${encodeURIComponent(runId)}/events?after=invalid`,
    );
    assert.equal(invalidEventCursor.status, 422);
    for (const legacyPath of [
      '/api/v1/status', '/api/v1/capabilities', '/api/v1/query', '/api/v1/scan',
      '/api/v1/ingest', '/api/v1/feedback', '/api/v1/run-commands/start',
      '/api/v1/transition', '/api/v1/evaluate', '/api/v1/publish',
      `/api/v1/runs/${encodeURIComponent(runId)}/demo-report`,
    ]) {
      const legacy = await fetch(`${base}${legacyPath}`);
      assert.equal(legacy.status, 404, legacyPath);
    }
    for (const legacyPath of ['/api/v1/ingest', '/api/v1/feedback', '/api/v1/run-commands/start', '/api/v1/transition', '/api/v1/evaluate', '/api/v1/publish']) {
      const legacy = await fetch(`${base}${legacyPath}`, { method: 'POST', headers: authHeaders, body: '{}' });
      assert.equal(legacy.status, 404, legacyPath);
    }
  } finally {
    instance.server.close();
    await once(instance.server, 'close');
    rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test('HTTP mutation API is disabled when no write token is configured', async () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), 'wp-server-disabled-'));
  const instance = createKnowledgeServer({ runtimeDir });
  instance.server.listen(0, '127.0.0.1');
  await once(instance.server, 'listening');
  const address = instance.server.address();
  assert.ok(address && typeof address === 'object');
  try {
    const capabilities = await (await fetch(`http://127.0.0.1:${address.port}/api/v1/system/capabilities`)).json();
    assert.equal(capabilities.writeEnabled, false);
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/knowledge/candidates`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, 'WRITE_API_DISABLED');
  } finally {
    instance.server.close();
    await once(instance.server, 'close');
    rmSync(runtimeDir, { recursive: true, force: true });
  }
});
