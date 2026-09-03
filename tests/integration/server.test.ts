import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createKnowledgeServer, mapHttpError, resolveServerBinding } from '../../src/interfaces/runner/server.ts';

async function readSse(response: Response, expected: RegExp): Promise<string> {
  assert.ok(response.body);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (let index = 0; index < 20 && !expected.test(text); index += 1) {
    const next = await reader.read();
    if (next.done) break;
    text += decoder.decode(next.value, { stream: true });
  }
  await reader.cancel();
  assert.match(text, expected);
  return text;
}
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
    const mismatchedEventCursor = await fetch(
      `${base}/api/v1/runs/${encodeURIComponent(runId)}/event-stream?after=1`,
      { headers: { 'last-event-id': '2' } },
    );
    assert.equal(mismatchedEventCursor.status, 400);
    assert.equal((await mismatchedEventCursor.json()).error.code, 'INVALID_EVENT_CURSOR');
    const runStream = await fetch(
      `${base}/api/v1/runs/${encodeURIComponent(runId)}/event-stream?after=0`,
    );
    assert.equal(runStream.headers.get('content-type'), 'text/event-stream; charset=utf-8');
    const runEvents = await readSse(runStream, /event: run-event/);
    assert.match(runEvents, /event: ready/);
    assert.match(runEvents, /id: 1/);

    const components = await (await fetch(`${base}/api/v1/system/components`)).json();
    assert.equal(components.items.length, 5);
    assert.equal(components.overall, 'DEGRADED');
    assert.deepEqual(components.items.map((item: { component: string }) => item.component), [
      'registry', 'artifactStore', 'workflow', 'provider', 'evaluator',
    ]);
    assert.doesNotMatch(JSON.stringify(components), /test-secret/);

    const initialProgress = await (await fetch(
      `${base}/api/v1/runs/${encodeURIComponent(runId)}/progress`,
    )).json();
    assert.equal(initialProgress.mode, 'INDETERMINATE');
    assert.equal(initialProgress.ratio, null);
    assert.equal(Object.hasOwn(initialProgress, 'eta'), false);

    await instance.composition.runConfiguration.capture(runId);

    instance.composition.workflowObserver.record({
      runId, nodeId: 'orchestrator', agentId: 'orchestrator', status: 'COMPLETED',
      iteration: 0, attempt: 1, detail: 'planned', error: null,
      startedAt: created.createdAt, completedAt: created.updatedAt, updatedAt: created.updatedAt,
    });
    instance.composition.workflowObserver.record({
      runId, nodeId: 'doc_gen', agentId: 'doc-gen', status: 'RUNNING',
      iteration: 0, attempt: 1, detail: 'generating', error: null,
      startedAt: created.createdAt, completedAt: null, updatedAt: created.updatedAt,
    });
    const measuredProgress = await (await fetch(
      `${base}/api/v1/runs/${encodeURIComponent(runId)}/progress`,
    )).json();
    assert.equal(measuredProgress.mode, 'DETERMINATE');
    assert.equal(measuredProgress.completedUnits, 1);
    assert.equal(measuredProgress.totalUnits, 7);
    assert.equal(measuredProgress.ratio, 1 / 7);
    assert.equal(measuredProgress.currentStage, 'doc_gen');

    instance.composition.service.transition(runId, 'PLANNED');
    instance.composition.service.transition(runId, 'GENERATING');
    instance.composition.service.transition(runId, 'ITERATING');
    instance.composition.workflowObserver.record({
      runId, nodeId: 'orchestrator', agentId: 'orchestrator', status: 'COMPLETED',
      iteration: 0, attempt: 2, detail: 'retried', error: null,
      startedAt: created.createdAt, completedAt: created.updatedAt, updatedAt: created.updatedAt,
    });
    const iteratedProgress = await (await fetch(
      `${base}/api/v1/runs/${encodeURIComponent(runId)}/progress`,
    )).json();
    assert.equal(iteratedProgress.totalUnits, 14);
    assert.equal(iteratedProgress.completedUnits, 1);

    instance.composition.service.transition(runId, 'FAILED');
    const anonymousActionItems = await (await fetch(`${base}/api/v1/action-items?status=OPEN`)).json();
    assert.deepEqual(anonymousActionItems.items[0].allowedActions, []);
    const actionItems = await (await fetch(`${base}/api/v1/action-items?status=OPEN`, {
      headers: { authorization: 'Bearer test-secret' },
    })).json();
    assert.equal(actionItems.items.length, 1);
    assert.equal(actionItems.items[0].type, 'RUN_FAILED');
    assert.equal(actionItems.items[0].runId, runId);
    assert.deepEqual(actionItems.items[0].allowedActions, ['ACKNOWLEDGE', 'RESOLVE', 'RETRY']);
    const actionDetail = await (await fetch(
      `${base}/api/v1/action-items/${encodeURIComponent(actionItems.items[0].actionItemId)}`,
    )).json();
    assert.equal(actionDetail.fingerprint, actionItems.items[0].fingerprint);
    assert.equal(actionDetail.observedSources.length, 1);
    assert.deepEqual(actionDetail.history, []);

    const actionBase = `${base}/api/v1/action-items/${encodeURIComponent(actionDetail.actionItemId)}/actions`;
    const deniedAction = await fetch(`${actionBase}/acknowledge`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': 'action-denied' },
      body: JSON.stringify({ expectedRevision: 1, reason: '开始处理' }),
    });
    assert.equal(deniedAction.status, 401);
    const acknowledge = await fetch(`${actionBase}/acknowledge`, {
      method: 'POST', headers: { ...authHeaders, 'idempotency-key': 'action-ack-1' },
      body: JSON.stringify({ expectedRevision: 1, reason: '开始处理' }),
    });
    assert.equal(acknowledge.status, 200);
    const acknowledged = await acknowledge.json();
    assert.equal(acknowledged.status, 'ACKNOWLEDGED');
    assert.equal(acknowledged.revision, 2);
    const replay = await fetch(`${actionBase}/acknowledge`, {
      method: 'POST', headers: { ...authHeaders, 'idempotency-key': 'action-ack-1' },
      body: JSON.stringify({ expectedRevision: 1, reason: '开始处理' }),
    });
    assert.deepEqual(await replay.json(), acknowledged);
    const staleResolve = await fetch(`${actionBase}/resolve`, {
      method: 'POST', headers: { ...authHeaders, 'idempotency-key': 'action-resolve-stale' },
      body: JSON.stringify({ expectedRevision: 1, reason: '问题已核实' }),
    });
    assert.equal(staleResolve.status, 409);
    assert.equal((await staleResolve.json()).error.code, 'REVISION_CONFLICT');
    const resolveAction = await fetch(`${actionBase}/resolve`, {
      method: 'POST', headers: { ...authHeaders, 'idempotency-key': 'action-resolve-1' },
      body: JSON.stringify({ expectedRevision: 2, reason: '问题已核实并关闭' }),
    });
    assert.equal(resolveAction.status, 200);
    const resolvedDetail = await (await fetch(
      `${base}/api/v1/action-items/${encodeURIComponent(actionDetail.actionItemId)}`,
    )).json();
    assert.equal(resolvedDetail.status, 'RESOLVED');
    assert.equal(resolvedDetail.revision, 3);
    assert.equal(resolvedDetail.history.length, 2);
    assert.deepEqual(resolvedDetail.history.map((entry: { action: string }) => entry.action), [
      'ACKNOWLEDGE', 'RESOLVE',
    ]);
    assert.ok(resolvedDetail.history.every((entry: { actor: string }) => entry.actor === 'local-admin'));
    assert.doesNotMatch(JSON.stringify(resolvedDetail), /test-secret/);

    const regenerationParent = instance.composition.service.createRun('ohmyworkpanel-mentions', 'local-v1');
    instance.composition.service.transition(regenerationParent.runId, 'PLANNED');
    instance.composition.service.transition(regenerationParent.runId, 'GENERATING');
    instance.composition.service.transition(regenerationParent.runId, 'LOW_CONFIDENCE');
    const regenerationItems = await (await fetch(
      `${base}/api/v1/action-items?runId=${encodeURIComponent(regenerationParent.runId)}`,
    )).json();
    assert.equal(regenerationItems.items.length, 1);
    const regenerate = await fetch(
      `${base}/api/v1/action-items/${encodeURIComponent(regenerationItems.items[0].actionItemId)}/regenerate`,
      {
        method: 'POST',
        headers: { ...authHeaders, 'idempotency-key': 'action-regenerate-1' },
        body: JSON.stringify({
          expectedRevision: 1,
          reason: '根据人工复核重新生成',
          feedback: '补充失败边界和可验证示例。',
        }),
      },
    );
    const regenerationResult = await regenerate.json();
    assert.equal(regenerate.status, 202, JSON.stringify(regenerationResult));
    assert.notEqual(regenerationResult.commandRunId, regenerationParent.runId);
    const regeneratedSnapshot = await (await fetch(
      `${base}/api/v1/runs/${encodeURIComponent(regenerationResult.commandRunId)}`,
    )).json();
    assert.equal(regeneratedSnapshot.governanceTrigger.parentRunId, regenerationParent.runId);
    assert.equal(
      regeneratedSnapshot.governanceTrigger.causedByActionItemId,
      regenerationItems.items[0].actionItemId,
    );
    assert.ok(regeneratedSnapshot.governanceTrigger.feedbackRef.artifactId);
    assert.doesNotMatch(JSON.stringify(regeneratedSnapshot.governanceTrigger), /补充失败边界/);

    const affectedRun = instance.composition.service.createRun('component-watch', 'local-v1');
    instance.composition.service.transition(affectedRun.runId, 'PLANNED');
    instance.composition.service.observeComponentUnavailable('provider', 'PROVIDER_DOWN', [affectedRun.runId]);
    const componentItems = instance.composition.service.listActionItems({ runId: affectedRun.runId });
    assert.equal(componentItems.length, 1);
    assert.equal(componentItems[0].type, 'COMPONENT_UNAVAILABLE');
    instance.composition.service.applyActionItemAction({
      actionItemId: String(componentItems[0].actionItemId), action: 'RESOLVE', expectedRevision: 1,
      reason: 'Provider 已恢复', actor: 'test-admin',
    });
    instance.composition.service.observeComponentUnavailable('provider', 'PROVIDER_DOWN', [affectedRun.runId]);
    const recurred = instance.composition.service.listActionItems({
      runId: affectedRun.runId, status: 'OPEN',
    });
    assert.equal(recurred.length, 1);
    assert.equal(recurred[0].previousOccurrenceId, componentItems[0].actionItemId);

    const retryRun = instance.composition.service.createRun('retry-command', 'local-v1');
    instance.composition.service.transition(retryRun.runId, 'FAILED');
    const retryItems = instance.composition.service.listActionItems({ runId: retryRun.runId });
    const originalStatus = instance.composition.apps.orchestrator.status.bind(instance.composition.apps.orchestrator);
    const originalResume = instance.composition.apps.orchestrator.resume.bind(instance.composition.apps.orchestrator);
    instance.composition.apps.orchestrator.status = async () => ({
      runId: retryRun.runId, executionStatus: 'FAILED', currentNode: 'code',
      iteration: 0, maxIterations: 3, route: 'FAILED', error: 'controlled failure',
    });
    instance.composition.apps.orchestrator.resume = async () => ({
      runId: retryRun.runId, executionStatus: 'RUNNING',
    });
    const retryResponse = await fetch(
      `${base}/api/v1/action-items/${encodeURIComponent(String(retryItems[0].actionItemId))}/actions/retry`,
      {
        method: 'POST', headers: { ...authHeaders, 'idempotency-key': 'action-retry-1' },
        body: JSON.stringify({ expectedRevision: 1, reason: '恢复失败 checkpoint' }),
      },
    );
    instance.composition.apps.orchestrator.status = originalStatus;
    instance.composition.apps.orchestrator.resume = originalResume;
    assert.equal(retryResponse.status, 202);
    const retryResult = await retryResponse.json();
    assert.equal(retryResult.commandRunId, retryRun.runId);
    const retriedDetail = instance.composition.service.getActionItem(String(retryItems[0].actionItemId));
    assert.equal((retriedDetail?.history as { action: string }[])[0].action, 'RETRY');

    const activities = await (await fetch(`${base}/api/v1/activity?runId=${encodeURIComponent(runId)}`)).json();
    assert.ok(activities.items.length >= 2);
    assert.ok(activities.items.every((item: { runId: string }) => item.runId === runId));
    assert.ok(activities.items.every((item: { cursor: string }) => /^act_[A-Za-z0-9_-]+$/.test(item.cursor)));
    const activityStream = await fetch(`${base}/api/v1/activity/stream`);
    const activityEvents = await readSse(activityStream, /event: activity/);
    assert.match(activityEvents, /event: ready/);
    assert.match(activityEvents, /id: act_[A-Za-z0-9_-]+/);
    const firstActivityPage = await (await fetch(
      `${base}/api/v1/activity?runId=${encodeURIComponent(runId)}&limit=1`,
    )).json();
    assert.equal(firstActivityPage.items.length, 1);
    assert.ok(firstActivityPage.nextCursor);
    const secondActivityPage = await (await fetch(
      `${base}/api/v1/activity?runId=${encodeURIComponent(runId)}&limit=1&cursor=${encodeURIComponent(firstActivityPage.nextCursor)}`,
    )).json();
    assert.equal(secondActivityPage.items.length, 1);
    assert.notEqual(secondActivityPage.items[0].activityId, firstActivityPage.items[0].activityId);
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

test('action command receipt survives a server restart', async () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), 'wp-server-replay-'));
  const requestBody = JSON.stringify({ expectedRevision: 1, reason: '已接手排查' });
  let actionItemId = '';
  let original: Record<string, unknown>;
  const first = createKnowledgeServer({ runtimeDir, writeToken: 'test-secret' });
  first.server.listen(0, '127.0.0.1');
  await once(first.server, 'listening');
  const firstAddress = first.server.address();
  assert.ok(firstAddress && typeof firstAddress === 'object');
  try {
    const run = first.composition.service.createRun('restart-test', 'local-v1');
    first.composition.service.transition(run.runId, 'FAILED');
    const listing = await (await fetch(`http://127.0.0.1:${firstAddress.port}/api/v1/action-items`)).json();
    actionItemId = listing.items[0].actionItemId;
    const response = await fetch(
      `http://127.0.0.1:${firstAddress.port}/api/v1/action-items/${encodeURIComponent(actionItemId)}/actions/acknowledge`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json', authorization: 'Bearer test-secret',
          'idempotency-key': 'restart-safe-action',
        },
        body: requestBody,
      },
    );
    assert.equal(response.status, 200);
    original = await response.json();
  } finally {
    first.server.close();
    await once(first.server, 'close');
  }

  const second = createKnowledgeServer({ runtimeDir, writeToken: 'test-secret' });
  second.server.listen(0, '127.0.0.1');
  await once(second.server, 'listening');
  const secondAddress = second.server.address();
  assert.ok(secondAddress && typeof secondAddress === 'object');
  try {
    const replay = await fetch(
      `http://127.0.0.1:${secondAddress.port}/api/v1/action-items/${encodeURIComponent(actionItemId)}/actions/acknowledge`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json', authorization: 'Bearer test-secret',
          'idempotency-key': 'restart-safe-action',
        },
        body: requestBody,
      },
    );
    assert.equal(replay.status, 200);
    assert.deepEqual(await replay.json(), original);
    const conflict = await fetch(
      `http://127.0.0.1:${secondAddress.port}/api/v1/action-items/${encodeURIComponent(actionItemId)}/actions/acknowledge`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json', authorization: 'Bearer test-secret',
          'idempotency-key': 'restart-safe-action',
        },
        body: JSON.stringify({ expectedRevision: 1, reason: '不同请求' }),
      },
    );
    assert.equal(conflict.status, 409);
  } finally {
    second.server.close();
    await once(second.server, 'close');
    rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test('component checks fail closed without side effects and monitor observations deduplicate', async () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), 'wp-server-components-'));
  const instance = createKnowledgeServer({
    runtimeDir,
    componentCheckTimeoutMs: 10,
    componentChecks: {
      provider: () => { throw new Error('secret upstream diagnostic'); },
      evaluator: () => new Promise<void>(() => {}),
    },
  });
  instance.server.listen(0, '127.0.0.1');
  await once(instance.server, 'listening');
  const address = instance.server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const run = instance.composition.service.createRun('component-health', 'local-v1');
    instance.composition.service.transition(run.runId, 'PLANNED');
    const first = await (await fetch(`${base}/api/v1/system/components`)).json();
    assert.equal(first.overall, 'UNAVAILABLE');
    assert.equal(first.items.find((item: { component: string }) => item.component === 'provider').reasonCode, 'COMPONENT_CHECK_FAILED');
    assert.equal(first.items.find((item: { component: string }) => item.component === 'evaluator').reasonCode, 'COMPONENT_CHECK_TIMEOUT');
    assert.doesNotMatch(JSON.stringify(first), /secret upstream diagnostic/);
    await fetch(`${base}/api/v1/system/components`);
    const unchanged = await (await fetch(`${base}/api/v1/action-items?runId=${encodeURIComponent(run.runId)}`)).json();
    assert.equal(unchanged.items.length, 0);
    instance.composition.service.observeComponentUnavailable('provider', 'COMPONENT_CHECK_FAILED', [run.runId]);
    instance.composition.service.observeComponentUnavailable('provider', 'COMPONENT_CHECK_FAILED', [run.runId]);
    const actionItems = await (await fetch(`${base}/api/v1/action-items?runId=${encodeURIComponent(run.runId)}`)).json();
    assert.equal(actionItems.items.length, 1);
    assert.equal(actionItems.items[0].type, 'COMPONENT_UNAVAILABLE');
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
