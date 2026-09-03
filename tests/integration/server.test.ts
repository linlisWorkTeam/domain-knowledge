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
  assert.deepEqual(mapHttpError(new Error('PAYLOAD_INVALID')), {
    status: 400, body: { error: 'PAYLOAD_INVALID', message: 'PAYLOAD_INVALID' },
  });
  assert.deepEqual(mapHttpError(new Error('WORKFLOW_ALREADY_RUNNING: run-1')), {
    status: 409,
    body: { error: 'WORKFLOW_ALREADY_RUNNING', message: 'WORKFLOW_ALREADY_RUNNING: run-1' },
  });
  assert.deepEqual(mapHttpError(new Error('database path D:\\secret failed')), {
    status: 500, body: { error: 'INTERNAL_ERROR' },
  });
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
    assert.equal((await fetch(`${base}/api/v1/status`)).status, 200);
    const denied = await fetch(`${base}/api/v1/ingest`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    assert.equal(denied.status, 401);
    const malformed = await fetch(`${base}/api/v1/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-secret' },
      body: '{',
    });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { error: 'PAYLOAD_INVALID', message: 'PAYLOAD_INVALID' });
    const accepted = await fetch(`${base}/api/v1/ingest`, {
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
    const defaultQuery = await fetch(`${base}/api/v1/query?q=${encodeURIComponent('行为')}`);
    assert.equal((await defaultQuery.json()).hits.length, 0);
    const allStatusQuery = await fetch(`${base}/api/v1/query?q=${encodeURIComponent('行为')}&status=`);
    const allStatusPayload = await allStatusQuery.json();
    assert.equal(allStatusPayload.hits.length, 1);
    assert.equal(allStatusPayload.hits[0].status, 'CANDIDATE');
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /知识飞轮控制台/);

    const capabilities = await (await fetch(`${base}/api/v1/capabilities`)).json();
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
    const post = (path: string, input: Record<string, unknown>) => fetch(`${base}${path}`, {
      method: 'POST', headers: authHeaders, body: JSON.stringify(input),
    });
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
    assert.equal(deniedAgentMutation.status, 400);
    assert.match(JSON.stringify(await deniedAgentMutation.json()), /only promptAddon/);
    const deniedPromptType = await fetch(`${base}/api/v1/agents/doc-gen/prompt`, {
      method: 'PUT', headers: authHeaders,
      body: JSON.stringify({ promptAddon: { text: 'not a string' } }),
    });
    assert.equal(deniedPromptType.status, 400);
    assert.match(JSON.stringify(await deniedPromptType.json()), /must be a string/);
    const createdRun = await post('/api/v1/runs', { moduleId: 'server-card', policyId: 'local-v1' });
    assert.equal(createdRun.status, 201);
    const runId = String((await createdRun.json()).runId);
    for (const state of ['PLANNED', 'GENERATING', 'EVALUATING']) {
      const transition = await post('/api/v1/transition', { runId, state });
      assert.equal(transition.status, 200, await transition.text());
    }
    const evidenceRef = await instance.composition.artifacts.put(Buffer.from('{"passed":true}'), 'application/json');
    const evaluated = await post('/api/v1/evaluate', {
      runId, versionId: payload.version.versionId, evidenceRefs: [evidenceRef],
      toolchainFingerprint: 'server-test@1', criticalFailures: 0,
      testsPassed: 1, testsTotal: 1, stability: 1,
    });
    const evaluatedPayload = await evaluated.json();
    assert.equal(evaluated.status, 201, JSON.stringify(evaluatedPayload));
    const decision = evaluatedPayload.decision;
    assert.equal(decision.outcome, 'PASS');
    assert.equal(instance.composition.repository.getRun(runId)?.state, 'REVIEWING');
    const published = await post('/api/v1/publish', {
      runId, versionId: payload.version.versionId, decisionId: decision.decisionId,
    });
    assert.equal(published.status, 201, await published.text());
    assert.equal(instance.composition.service.getKnowledgeVersion(payload.version.versionId)?.status, 'VERIFIED');

    const runsPayload = await (await fetch(`${base}/api/v1/runs`)).json();
    assert.equal(runsPayload.runs.length, 1);
    assert.equal(runsPayload.runs[0].runId, runId);
    assert.equal(runsPayload.runs[0].state, 'VERIFIED');
    assert.equal(runsPayload.runs[0].latestDecision.outcome, 'PASS');
    const verifiedRuns = await (await fetch(`${base}/api/v1/runs?state=VERIFIED`)).json();
    assert.equal(verifiedRuns.runs.length, 1);

    const snapshotResponse = await fetch(`${base}/api/v1/runs/${encodeURIComponent(runId)}`);
    assert.equal(snapshotResponse.status, 200);
    const snapshot = await snapshotResponse.json();
    assert.equal(snapshot.run.runId, runId);
    assert.equal(snapshot.evaluations.length, 1);
    assert.equal(snapshot.evaluations[0].decision.outcome, 'PASS');
    assert.equal(snapshot.latestDecision.decisionId, decision.decisionId);
    assert.equal(snapshot.versions[0].status, 'VERIFIED');
    assert.equal(snapshot.publications.length, 1);
    assert.equal(snapshot.publications[0].versionId, payload.version.versionId);
    assert.ok(snapshot.events.length >= 7);
    assert.deepEqual(snapshot.events.map((record: { eventSeq: number }) => record.eventSeq),
      snapshot.events.map((_: unknown, index: number) => index + 1));

    const demoResponse = await fetch(`${base}/api/v1/runs/${encodeURIComponent(runId)}/demo-report`);
    assert.equal(demoResponse.status, 200);
    assert.match(demoResponse.headers.get('content-disposition') ?? '', /attachment/);
    const demoReport = await demoResponse.json();
    assert.equal(demoReport.snapshot.run.runId, runId);
    assert.equal(demoReport.snapshot.publications.length, 1);
    assert.equal(demoReport.artifactIntegrity.failed.length, 0);

    const eventTail = await (await fetch(
      `${base}/api/v1/runs/${encodeURIComponent(runId)}/events?after=2`,
    )).json();
    assert.ok(eventTail.events.length > 0);
    assert.ok(eventTail.events.every((record: { eventSeq: number }) => record.eventSeq > 2));
    const invalidEventCursor = await fetch(
      `${base}/api/v1/runs/${encodeURIComponent(runId)}/events?after=invalid`,
    );
    assert.equal(invalidEventCursor.status, 400);
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
    const capabilities = await (await fetch(`http://127.0.0.1:${address.port}/api/v1/capabilities`)).json();
    assert.equal(capabilities.writeEnabled, false);
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/ingest`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'WRITE_API_DISABLED');
  } finally {
    instance.server.close();
    await once(instance.server, 'close');
    rmSync(runtimeDir, { recursive: true, force: true });
  }
});
