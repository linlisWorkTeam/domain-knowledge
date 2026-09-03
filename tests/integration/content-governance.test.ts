import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { MockAgent } from 'undici';
import { sha256 } from '../../src/domain/index.ts';
import {
  LocalCasArtifactStore, SQLiteFlywheelRepository,
} from '../../src/infrastructure/persistence/sqlite-cas/index.ts';
import { SQLiteContentGovernance } from '../../src/infrastructure/persistence/sqlite-content-governance/index.ts';
import { PublicHttpsEndpointPolicy } from '../../src/infrastructure/security/public-https.ts';
import { createKnowledgeServer } from '../../src/interfaces/runner/server.ts';
import { GOOD_BODY } from '../helpers/fixture.ts';

async function listen(instance: ReturnType<typeof createKnowledgeServer>): Promise<string> {
  instance.server.listen(0, '127.0.0.1');
  await once(instance.server, 'listening');
  const address = instance.server.address();
  assert.ok(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}`;
}

async function close(instance: ReturnType<typeof createKnowledgeServer>): Promise<void> {
  instance.server.close();
  await once(instance.server, 'close');
}

test('HTTPS Sources hash approved content, reject redirects, and use the one approved DNS resolution', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'wp-https-source-'));
  const repository = new SQLiteFlywheelRepository(join(projectRoot, 'registry.sqlite'));
  repository.initialize();
  const approvedAddresses = ['1.1.1.1', '2606:4700:4700::1111'] as const;
  const resolvedHosts: string[] = [];
  const dispatched: { url: string; addresses: readonly string[]; maxResponseSize: number }[] = [];
  const body = Buffer.from('# Approved source\n\nPinned transport fixture.\n');
  const governance = new SQLiteContentGovernance({
    database: repository.database,
    artifacts: new LocalCasArtifactStore(join(projectRoot, 'cas')),
    repositoryRoot: projectRoot,
    configuredRoots: [],
    allowedRemoteHosts: ['public.source.example'],
    remoteEndpointPolicy: new PublicHttpsEndpointPolicy(async (hostname) => {
      resolvedHosts.push(hostname);
      return approvedAddresses;
    }),
    sourceHttpsDispatcherFactory: (endpoint, maxResponseSize) => {
      dispatched.push({
        url: endpoint.url.toString(), addresses: endpoint.addresses, maxResponseSize,
      });
      const agent = new MockAgent();
      agent.disableNetConnect();
      const pool = agent.get(endpoint.url.origin);
      if (endpoint.url.pathname === '/approved.md') {
        pool.intercept({ method: 'GET', path: '/approved.md' }).reply(200, body, {
          headers: {
            'content-length': String(body.byteLength),
            'last-modified': 'Fri, 04 Sep 2026 00:00:00 GMT',
          },
        });
      } else {
        pool.intercept({ method: 'GET', path: '/redirect.md' }).reply(302, '', {
          headers: { location: 'https://unapproved.example/private' },
        });
      }
      return agent;
    },
    defaultRule: {
      policyId: 'local-v1', minimumStability: 0.8, requireAllTests: true, maxIterations: 3,
    },
    clock: () => '2026-09-04T00:00:00.000Z',
  });
  governance.initialize();
  try {
    const created = await governance.createSource({
      kind: 'HTTPS', locator: 'https://public.source.example/approved.md',
      displayName: 'Approved remote source', project: 'default',
    }, {
      idempotencyKey: 'https-source-approved-1', fingerprint: 'approved', actor: 'acceptance',
    });
    const source = created.source as Record<string, unknown>;
    assert.equal(source.status, 'ACTIVE');
    assert.equal(source.locator, 'https://public.source.example/approved.md');
    assert.equal(source.revision, `sha256:${sha256(body)}`);
    assert.equal(source.observedRevision, `sha256:${sha256(body)}`);
    assert.equal(source.lastSyncAt, '2026-09-04T00:00:00.000Z');

    await assert.rejects(governance.createSource({
      kind: 'HTTPS', locator: 'https://public.source.example/redirect.md',
      displayName: 'Redirecting remote source', project: 'default',
    }, {
      idempotencyKey: 'https-source-redirect-1', fingerprint: 'redirect', actor: 'acceptance',
    }), /SOURCE_ACCESS_DENIED: HTTPS source redirects are forbidden/);

    assert.deepEqual(resolvedHosts, ['public.source.example', 'public.source.example']);
    assert.deepEqual(dispatched.map((entry) => entry.url), [
      'https://public.source.example/approved.md',
      'https://public.source.example/redirect.md',
    ]);
    for (const entry of dispatched) assert.deepEqual(entry.addresses, approvedAddresses);
    assert.ok(dispatched.every((entry) => entry.maxResponseSize === 10 * 1024 * 1024));
    assert.equal(governance.listSources().length, 1);
  } finally {
    repository.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('DEV-008 content governance APIs preserve lineage, evidence, rules, sources, and health inputs', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'wp-content-project-'));
  const runtimeDir = join(projectRoot, '.runtime');
  const inbox = join(projectRoot, 'knowledge', 'inbox');
  mkdirSync(inbox, { recursive: true });
  const sourcePath = join(inbox, 'source.md');
  writeFileSync(sourcePath, '# Source\n\nPinned source v1.\n');
  writeFileSync(join(projectRoot, 'outside.md'), '# Outside\n');
  const token = 'content-admin-secret';
  const instance = createKnowledgeServer({
    repositoryRoot: projectRoot,
    runtimeDir,
    writeToken: token,
    allowedSourceHosts: ['127.0.0.1', 'mixed.source.example', 'public.source.example'],
    sourceEndpointPolicy: new PublicHttpsEndpointPolicy(async (hostname) => (
      hostname === 'mixed.source.example' ? ['1.1.1.1', '10.0.0.1'] : ['1.1.1.1']
    )),
  });
  const base = await listen(instance);
  const auth = {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };
  let sourceId = '';
  try {
    const unavailableHealth = await (await fetch(`${base}/api/v1/knowledge/health?window=30d`)).json();
    assert.equal(unavailableHealth.overall.value, null);
    assert.equal(unavailableHealth.metrics.coverage.status, 'unavailable');
    assert.equal(unavailableHealth.metrics.coverage.denominator, null);
    const invalidHealth = await fetch(`${base}/api/v1/knowledge/health?window=forever`);
    assert.equal(invalidHealth.status, 422);
    assert.equal((await invalidHealth.json()).error.code, 'ARGUMENT_INVALID');

    const scan = await (await fetch(`${base}/api/v1/sources/scan`)).json();
    assert.ok(scan.candidates.some((candidate: { path: string }) => (
      candidate.path === 'knowledge/inbox/source.md'
    )));

    const deniedSource = await fetch(`${base}/api/v1/sources`, {
      method: 'POST',
      headers: { ...auth, 'idempotency-key': 'source-outside-1' },
      body: JSON.stringify({ kind: 'FILE', locator: 'outside.md', displayName: 'Outside' }),
    });
    assert.equal(deniedSource.status, 403);
    assert.equal((await deniedSource.json()).error.code, 'SOURCE_ACCESS_DENIED');

    for (const [key, locator] of [
      ['source-loopback-1', 'https://127.0.0.1/private'],
      ['source-mixed-dns-1', 'https://mixed.source.example/private'],
      ['source-query-secret-1', 'https://public.source.example/source.md?token=must-not-persist'],
    ]) {
      const deniedRemote = await fetch(`${base}/api/v1/sources`, {
        method: 'POST',
        headers: { ...auth, 'idempotency-key': key },
        body: JSON.stringify({ kind: 'HTTPS', locator, displayName: 'Denied remote source' }),
      });
      assert.equal(deniedRemote.status, 403, locator);
      assert.equal((await deniedRemote.json()).error.code, 'SOURCE_ACCESS_DENIED');
    }
    const sourcesAfterRemoteDenials = await (await fetch(`${base}/api/v1/sources`)).text();
    assert.doesNotMatch(sourcesAfterRemoteDenials, /must-not-persist|127\.0\.0\.1|mixed\.source\.example/);

    const missingIdempotencyKey = await fetch(`${base}/api/v1/sources`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ kind: 'FILE', locator: 'knowledge/inbox/source.md' }),
    });
    assert.equal(missingIdempotencyKey.status, 422);
    assert.equal((await missingIdempotencyKey.json()).error.code, 'IDEMPOTENCY_KEY_REQUIRED');

    const sourceResponse = await fetch(`${base}/api/v1/sources`, {
      method: 'POST',
      headers: { ...auth, 'idempotency-key': 'source-create-1' },
      body: JSON.stringify({
        project: 'default', displayName: 'Pinned Source',
        locator: 'knowledge/inbox/source.md', kind: 'FILE',
      }),
    });
    assert.equal(sourceResponse.status, 201);
    const createdSource = await sourceResponse.json();
    assert.equal(createdSource.source.status, 'ACTIVE');
    assert.equal(createdSource.source.recordRevision, 1);
    assert.match(createdSource.source.revision, /^sha256:[a-f0-9]{64}$/);
    assert.equal(createdSource.source.credentialConfigured, false);
    assert.equal(Object.hasOwn(createdSource.source, 'credentialRef'), false);
    sourceId = String(createdSource.source.sourceId);
    assert.equal(createdSource.resourceId, sourceId);
    assert.match(createdSource.eventId, /^audit_/);
    assert.equal(createdSource.revision, 1);
    assert.equal(createdSource.acceptedAt, createdSource.source.createdAt);
    const unsupportedDelete = await fetch(`${base}/api/v1/sources/${encodeURIComponent(sourceId)}`, {
      method: 'DELETE', headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(unsupportedDelete.status, 404);
    const replayedSource = await fetch(`${base}/api/v1/sources`, {
      method: 'POST',
      headers: { ...auth, 'idempotency-key': 'source-create-1' },
      body: JSON.stringify({
        kind: 'FILE', locator: 'knowledge/inbox/source.md', displayName: 'Pinned Source', project: 'default',
      }),
    });
    assert.equal((await replayedSource.json()).replayed, true);

    const first = await instance.composition.service.ingestCandidate({
      moduleId: 'content-governance',
      body: GOOD_BODY,
      title: 'Content Governance',
      description: 'First immutable knowledge revision.',
      category: 'governance',
      tags: ['dev-008'],
      provenance: [{ path: 'knowledge/inbox/source.md', commit: 'source-v1', pinned: true }],
    });
    let firstRun = instance.composition.service.createRun('content-governance', instance.composition.config.publicationGate.policyId);
    firstRun = instance.composition.service.transition(firstRun.runId, 'PLANNED');
    firstRun = instance.composition.service.transition(firstRun.runId, 'GENERATING');
    firstRun = instance.composition.service.transition(firstRun.runId, 'EVALUATING');
    assert.equal(firstRun.state, 'EVALUATING');
    const firstEvidence = await instance.composition.artifacts.put(
      Buffer.from('first immutable evaluation evidence'), 'text/plain; charset=utf-8',
    );
    const firstEvaluation = await instance.composition.service.recordEvaluation({
      runId: firstRun.runId,
      versionId: first.version.versionId,
      evidenceRefs: [firstEvidence],
      toolchainFingerprint: 'node-22-test',
      criticalFailures: 0,
      testsPassed: 2,
      testsTotal: 2,
      stability: 1,
    }, instance.composition.config.publicationGate);
    assert.equal(firstEvaluation.decision.outcome, 'PASS');
    await instance.composition.service.publish(
      firstRun.runId, first.version.versionId, firstEvaluation.decision.decisionId,
    );

    const rulesBefore = await (await fetch(`${base}/api/v1/evaluation-rules`)).json();
    assert.equal(rulesBefore.items.length, 1);
    assert.equal(rulesBefore.items[0].revision, 1);
    const deniedRule = await fetch(`${base}/api/v1/evaluation-rules/publication-gate`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'idempotency-key': 'rule-denied-1' },
      body: JSON.stringify({ expectedRevision: 1, reason: 'denied', config: { minimumStability: 0.9 } }),
    });
    assert.equal(deniedRule.status, 401);
    const updatedRuleResponse = await fetch(`${base}/api/v1/evaluation-rules/publication-gate`, {
      method: 'PATCH',
      headers: { ...auth, 'idempotency-key': 'rule-update-1' },
      body: JSON.stringify({
        expectedRevision: 1,
        reason: 'Exercise immutable rule revisions',
        config: { policyId: 'local-v1', minimumStability: 0.9, requireAllTests: true, maxIterations: 3 },
      }),
    });
    assert.equal(updatedRuleResponse.status, 200);
    const updatedRule = await updatedRuleResponse.json();
    assert.equal(updatedRule.rule.revision, 2);
    assert.equal(updatedRule.rule.createdBy, 'local-admin');
    assert.equal(updatedRule.resourceId, 'publication-gate');
    assert.equal(updatedRule.eventId, updatedRule.rule.auditId);
    assert.equal(updatedRule.revision, 2);
    assert.equal(updatedRule.acceptedAt, updatedRule.rule.createdAt);
    const replayedRule = await fetch(`${base}/api/v1/evaluation-rules/publication-gate`, {
      method: 'PATCH',
      headers: { ...auth, 'idempotency-key': 'rule-update-1' },
      body: JSON.stringify({
        expectedRevision: 1,
        reason: 'Exercise immutable rule revisions',
        config: { policyId: 'local-v1', minimumStability: 0.9, requireAllTests: true, maxIterations: 3 },
      }),
    });
    assert.equal((await replayedRule.json()).replayed, true);
    const staleRule = await fetch(`${base}/api/v1/evaluation-rules/publication-gate`, {
      method: 'PATCH',
      headers: { ...auth, 'idempotency-key': 'rule-update-stale' },
      body: JSON.stringify({ expectedRevision: 1, reason: 'stale', enabled: false }),
    });
    assert.equal(staleRule.status, 409);
    assert.equal((await staleRule.json()).error.code, 'REVISION_CONFLICT');

    const second = await instance.composition.service.ingestCandidate({
      moduleId: 'content-governance',
      body: `${GOOD_BODY}\n\n## 修订\n\n第二版补充了结构化差异和证据访问边界。`,
      title: 'Content Governance',
      description: 'Second immutable knowledge revision.',
      category: 'governance',
      tags: ['dev-008', 'lineage'],
      provenance: [{ path: 'knowledge/inbox/source.md', commit: 'source-v1', pinned: true }],
      metadata: { correctionId: 'COR-DEV008-001', correctionEvidenceRefs: [firstEvidence] },
    });
    assert.equal(second.version.parentVersionId, first.version.versionId);
    let secondRun = instance.composition.service.createRun('content-governance', instance.composition.config.publicationGate.policyId);
    secondRun = instance.composition.service.transition(secondRun.runId, 'PLANNED');
    secondRun = instance.composition.service.transition(secondRun.runId, 'GENERATING');
    secondRun = instance.composition.service.transition(secondRun.runId, 'EVALUATING');
    const secondEvidence = await instance.composition.artifacts.put(
      Buffer.from('second private evidence payload'), 'text/plain; charset=utf-8',
    );
    const secondEvaluation = await instance.composition.service.recordEvaluation({
      runId: secondRun.runId,
      versionId: second.version.versionId,
      evidenceRefs: [secondEvidence],
      toolchainFingerprint: 'node-22-test',
      criticalFailures: 1,
      testsPassed: 1,
      testsTotal: 2,
      stability: 0.5,
    }, instance.composition.config.publicationGate);
    assert.equal(secondEvaluation.decision.outcome, 'ITERATE');

    let ruleDrivenRun = instance.composition.service.createRun(
      'content-governance', instance.composition.config.publicationGate.policyId,
    );
    ruleDrivenRun = instance.composition.service.transition(ruleDrivenRun.runId, 'PLANNED');
    ruleDrivenRun = instance.composition.service.transition(ruleDrivenRun.runId, 'GENERATING');
    ruleDrivenRun = instance.composition.service.transition(ruleDrivenRun.runId, 'EVALUATING');
    const ruleDrivenEvidence = await instance.composition.artifacts.put(
      Buffer.from('rule-driven evaluation evidence'), 'text/plain; charset=utf-8',
    );
    const ruleDrivenEvaluation = await instance.composition.service.recordEvaluation({
      runId: ruleDrivenRun.runId,
      versionId: second.version.versionId,
      evidenceRefs: [ruleDrivenEvidence],
      toolchainFingerprint: 'node-22-test',
      criticalFailures: 0,
      testsPassed: 2,
      testsTotal: 2,
      stability: 0.95,
    }, instance.composition.config.publicationGate);
    // The original config requires stability=1; PASS proves revision 2 governs later evaluations.
    assert.equal(ruleDrivenEvaluation.decision.outcome, 'PASS');

    const lineageResponse = await fetch(
      `${base}/api/v1/knowledge/${encodeURIComponent(second.version.versionId)}/lineage`,
    );
    assert.equal(lineageResponse.status, 200);
    const lineage = await lineageResponse.json();
    assert.equal(lineage.target.versionId, second.version.versionId);
    assert.deepEqual(lineage.nodes.map((node: { versionId: string }) => node.versionId), [
      first.version.versionId, second.version.versionId,
    ]);
    assert.deepEqual(lineage.edges, [{
      type: 'PARENT_OF', fromVersionId: first.version.versionId, toVersionId: second.version.versionId,
    }]);
    assert.equal(lineage.relations.evaluations.length, 3);
    assert.equal(lineage.relations.publications.length, 1);
    assert.equal(lineage.relations.corrections[0].correctionId, 'COR-DEV008-001');

    const diffResponse = await fetch(
      `${base}/api/v1/knowledge/${encodeURIComponent(second.version.versionId)}/diff?against=${encodeURIComponent(first.version.versionId)}`,
    );
    assert.equal(diffResponse.status, 200);
    const diff = await diffResponse.json();
    assert.equal(diff.rangeValidation.status, 'PASS');
    assert.equal(diff.rangeValidation.validated, true);
    assert.ok(diff.hunks.some((hunk: { lines: { type: string }[] }) => (
      hunk.lines.some((line) => line.type === 'ADD')
    )));
    assert.ok(diff.changedSections.includes('## 修订'));

    const failedEvaluations = await (await fetch(
      `${base}/api/v1/evaluations?moduleId=content-governance&gate=ITERATE&status=FAILED`,
    )).json();
    assert.equal(failedEvaluations.items.length, 1);
    assert.equal(failedEvaluations.items[0].evaluationId, secondEvaluation.report.reportId);
    assert.deepEqual(failedEvaluations.items[0].ruleRef, { ruleId: 'publication-gate', revision: 2 });
    assert.deepEqual(failedEvaluations.items[0].ruleBinding, {
      status: 'BOUND', reasonCode: 'RULE_REVISION_BOUND',
    });
    const firstEvaluationDetail = await (await fetch(
      `${base}/api/v1/evaluations/${encodeURIComponent(firstEvaluation.report.reportId)}`,
    )).json();
    assert.equal(firstEvaluationDetail.immutable, true);
    assert.deepEqual(firstEvaluationDetail.ruleRef, { ruleId: 'publication-gate', revision: 1 });
    assert.deepEqual(firstEvaluationDetail.ruleBinding, {
      status: 'BOUND', reasonCode: 'RULE_REVISION_BOUND',
    });
    const ruleHistory = await (await fetch(`${base}/api/v1/evaluation-rules/publication-gate`)).json();
    assert.deepEqual(ruleHistory.history.map((rule: { revision: number }) => rule.revision), [2, 1]);

    const anonymousArtifacts = await (await fetch(
      `${base}/api/v1/evaluations/${encodeURIComponent(secondEvaluation.report.reportId)}/artifacts`,
    )).json();
    assert.equal(anonymousArtifacts.items[0].downloadUrl, null);
    assert.doesNotMatch(JSON.stringify(anonymousArtifacts), /second private evidence payload/);
    const authorizedArtifacts = await (await fetch(
      `${base}/api/v1/evaluations/${encodeURIComponent(secondEvaluation.report.reportId)}/artifacts`,
      { headers: { authorization: `Bearer ${token}` } },
    )).json();
    assert.match(authorizedArtifacts.items[0].downloadUrl, /\/artifacts\//);
    const deniedDownload = await fetch(`${base}${authorizedArtifacts.items[0].downloadUrl}`);
    assert.equal(deniedDownload.status, 401);
    const downloaded = await fetch(`${base}${authorizedArtifacts.items[0].downloadUrl}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(downloaded.status, 200);
    assert.equal(await downloaded.text(), 'second private evidence payload');

    const sourceDetail = await (await fetch(`${base}/api/v1/sources/${encodeURIComponent(sourceId)}`)).json();
    assert.equal(sourceDetail.knowledge.total, 2);
    assert.equal(sourceDetail.knowledge.verified, 1);
    const health = await (await fetch(`${base}/api/v1/knowledge/health?window=30d`)).json();
    assert.equal(health.metrics.freshness.value, 1);
    assert.equal(health.metrics.coverage.value, 1);
    assert.equal(health.metrics.quality.numerator, 2);
    assert.equal(health.metrics.quality.denominator, 3);
    assert.equal(health.metrics.quality.value, 0.6667);
    assert.equal(health.overall.value, 88.9);
    assert.equal(health.overall.unit, 'score-out-of-100');

    writeFileSync(sourcePath, '# Source\n\nPinned source v2 with drift.\n');
    const refreshResponse = await fetch(`${base}/api/v1/sources/${encodeURIComponent(sourceId)}/refresh`, {
      method: 'POST',
      headers: { ...auth, 'idempotency-key': 'source-refresh-1' },
      body: '{}',
    });
    assert.equal(refreshResponse.status, 202);
    const refresh = await refreshResponse.json();
    assert.equal(refresh.status, 'SUCCEEDED');
    assert.equal(refresh.resourceId, sourceId);
    assert.match(refresh.eventId, /^audit_/);
    assert.equal(refresh.revision, 2);
    assert.equal(refresh.acceptedAt, refresh.source.updatedAt);
    assert.equal(refresh.source.status, 'STALE');
    assert.notEqual(refresh.source.observedRevision, refresh.source.revision);
    assert.equal(refresh.source.recordRevision, 2);
    const driftItems = await (await fetch(`${base}/api/v1/action-items?type=SOURCE_DRIFT`, {
      headers: { authorization: `Bearer ${token}` },
    })).json();
    assert.equal(driftItems.items.length, 1);
    assert.equal(driftItems.items[0].severity, 'MEDIUM');
    assert.deepEqual(driftItems.items[0].subject, { kind: 'SOURCE', id: sourceId });
    assert.equal(driftItems.items[0].runId, null);
    assert.equal(driftItems.items[0].reasonCode, 'SOURCE_REVISION_DRIFT');
    assert.equal(driftItems.items[0].sourceEventId, refresh.eventId);
    assert.deepEqual(driftItems.items[0].allowedActions, ['ACKNOWLEDGE', 'RESOLVE']);
    const acceptedDrift = await fetch(`${base}/api/v1/sources/${encodeURIComponent(sourceId)}`, {
      method: 'PATCH',
      headers: { ...auth, 'idempotency-key': 'source-update-1' },
      body: JSON.stringify({
        expectedRevision: 2,
        reason: 'Accept reviewed source drift',
        revision: refresh.source.observedRevision,
      }),
    });
    const updatedSource = await acceptedDrift.json();
    assert.equal(acceptedDrift.status, 200, JSON.stringify(updatedSource));
    assert.equal(updatedSource.resourceId, sourceId);
    assert.match(updatedSource.eventId, /^audit_/);
    assert.equal(updatedSource.revision, 3);
    assert.equal(updatedSource.acceptedAt, updatedSource.source.updatedAt);
    assert.equal(updatedSource.source.status, 'ACTIVE');
    assert.equal(updatedSource.source.revision, refresh.source.observedRevision);
    assert.equal(updatedSource.source.recordRevision, 3);
    assert.deepEqual(updatedSource.source.audit.map((entry: { action: string }) => entry.action), [
      'CREATE', 'REFRESH', 'UPDATE',
    ]);
    assert.doesNotMatch(JSON.stringify(updatedSource), /content-admin-secret|secret:\/\//);

    rmSync(sourcePath);
    const failedRefreshResponse = await fetch(`${base}/api/v1/sources/${encodeURIComponent(sourceId)}/refresh`, {
      method: 'POST',
      headers: { ...auth, 'idempotency-key': 'source-refresh-failed-1' },
      body: '{}',
    });
    assert.equal(failedRefreshResponse.status, 202);
    const failedRefresh = await failedRefreshResponse.json();
    assert.equal(failedRefresh.status, 'FAILED');
    assert.equal(failedRefresh.reasonCode, 'SOURCE_NOT_FOUND');
    assert.equal(failedRefresh.source.status, 'DEGRADED');
    assert.equal(failedRefresh.source.lastErrorCode, 'SOURCE_NOT_FOUND');
    assert.equal(failedRefresh.source.recordRevision, 4);

    const repeatedFailureResponse = await fetch(`${base}/api/v1/sources/${encodeURIComponent(sourceId)}/refresh`, {
      method: 'POST',
      headers: { ...auth, 'idempotency-key': 'source-refresh-failed-2' },
      body: '{}',
    });
    assert.equal(repeatedFailureResponse.status, 202);
    const repeatedFailure = await repeatedFailureResponse.json();
    assert.equal(repeatedFailure.status, 'FAILED');
    assert.equal(repeatedFailure.reasonCode, 'SOURCE_NOT_FOUND');
    assert.equal(repeatedFailure.source.recordRevision, 5);
    const unavailableItems = await (await fetch(`${base}/api/v1/action-items?type=SOURCE_UNAVAILABLE`, {
      headers: { authorization: `Bearer ${token}` },
    })).json();
    assert.equal(unavailableItems.items.length, 1);
    assert.equal(unavailableItems.items[0].severity, 'HIGH');
    assert.deepEqual(unavailableItems.items[0].subject, { kind: 'SOURCE', id: sourceId });
    assert.equal(unavailableItems.items[0].runId, null);
    assert.equal(unavailableItems.items[0].reasonCode, 'SOURCE_NOT_FOUND');
    assert.equal(unavailableItems.items[0].sourceEventId, failedRefresh.eventId);
    assert.deepEqual(unavailableItems.items[0].allowedActions, ['ACKNOWLEDGE', 'RESOLVE']);
    const unavailableDetail = await (await fetch(
      `${base}/api/v1/action-items/${encodeURIComponent(unavailableItems.items[0].actionItemId)}`,
      { headers: { authorization: `Bearer ${token}` } },
    )).json();
    assert.deepEqual(
      new Set(unavailableDetail.observedSources.map((entry: { eventId: string }) => entry.eventId)),
      new Set([failedRefresh.eventId, repeatedFailure.eventId]),
    );

    const renamedResponse = await fetch(`${base}/api/v1/sources/${encodeURIComponent(sourceId)}`, {
      method: 'PATCH',
      headers: { ...auth, 'idempotency-key': 'source-rename-degraded-1' },
      body: JSON.stringify({
        expectedRevision: 5,
        reason: 'Clarify the display name without claiming recovery',
        displayName: 'Pinned Source (offline)',
      }),
    });
    assert.equal(renamedResponse.status, 200);
    const renamed = await renamedResponse.json();
    assert.equal(renamed.source.recordRevision, 6);
    assert.equal(renamed.source.displayName, 'Pinned Source (offline)');
    assert.equal(renamed.source.status, 'DEGRADED');
    assert.equal(renamed.source.lastErrorCode, 'SOURCE_NOT_FOUND');
  } finally {
    await close(instance);
  }

  const restarted = createKnowledgeServer({ repositoryRoot: projectRoot, runtimeDir, writeToken: token });
  const restartedBase = await listen(restarted);
  try {
    const replayAfterRestart = await fetch(`${restartedBase}/api/v1/sources`, {
      method: 'POST',
      headers: { ...auth, 'idempotency-key': 'source-create-1' },
      body: JSON.stringify({
        kind: 'FILE', locator: 'knowledge/inbox/source.md', displayName: 'Pinned Source', project: 'default',
      }),
    });
    const replayedCreate = await replayAfterRestart.json();
    assert.equal(replayAfterRestart.status, 201);
    assert.equal(replayedCreate.replayed, true);
    assert.equal(replayedCreate.resourceId, sourceId);
    const persistedSources = await (await fetch(`${restartedBase}/api/v1/sources`)).json();
    assert.equal(persistedSources.items.length, 1);
    const persistedRules = await (await fetch(`${restartedBase}/api/v1/evaluation-rules/publication-gate`)).json();
    assert.deepEqual(persistedRules.history.map((rule: { revision: number }) => rule.revision), [2, 1]);
    const source = persistedSources.items[0];
    const disabledResponse = await fetch(`${restartedBase}/api/v1/sources/${encodeURIComponent(source.sourceId)}`, {
      method: 'PATCH',
      headers: { ...auth, 'idempotency-key': 'source-disable-1' },
      body: JSON.stringify({ expectedRevision: 6, reason: 'Disable source after verification', enabled: false }),
    });
    assert.equal(disabledResponse.status, 200);
    const disabled = await disabledResponse.json();
    assert.equal(disabled.source.status, 'DISABLED');
    const filtered = await (await fetch(`${restartedBase}/api/v1/sources?status=DISABLED`)).json();
    assert.equal(filtered.items.length, 1);
  } finally {
    await close(restarted);
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('legacy evaluations remain explicitly unbound when no contemporaneous rule is provable', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'wp-legacy-evaluation-'));
  const runtimeDir = join(projectRoot, '.runtime');
  const now = '2026-09-04T12:00:00.000Z';
  const first = createKnowledgeServer({
    repositoryRoot: projectRoot, runtimeDir, clock: () => now,
  });
  const firstBase = await listen(first);
  let evaluationId = '';
  try {
    const candidate = await first.composition.service.ingestCandidate({
      moduleId: 'legacy-evaluation',
      body: GOOD_BODY,
      title: 'Legacy evaluation',
      description: 'Migration fixture.',
      category: 'governance',
      tags: [],
      provenance: [{ path: 'legacy/source.md', commit: 'legacy-commit', pinned: true }],
    });
    let run = first.composition.service.createRun(
      'legacy-evaluation', first.composition.config.publicationGate.policyId,
    );
    run = first.composition.service.transition(run.runId, 'PLANNED');
    run = first.composition.service.transition(run.runId, 'GENERATING');
    run = first.composition.service.transition(run.runId, 'EVALUATING');
    const evidence = await first.composition.artifacts.put(
      Buffer.from('legacy evaluation evidence'), 'text/plain; charset=utf-8',
    );
    const evaluation = await first.composition.service.recordEvaluation({
      runId: run.runId,
      versionId: candidate.version.versionId,
      evidenceRefs: [evidence],
      toolchainFingerprint: 'legacy-toolchain',
      criticalFailures: 0,
      testsPassed: 1,
      testsTotal: 1,
      stability: 1,
    }, first.composition.config.publicationGate);
    evaluationId = evaluation.report.reportId;
    assert.ok(firstBase);
  } finally {
    await close(first);
  }

  const database = new DatabaseSync(join(runtimeDir, 'registry.sqlite'));
  try {
    const row = database.prepare('SELECT report_json FROM evaluations WHERE report_id = ?')
      .get(evaluationId) as { report_json: string };
    const report = JSON.parse(row.report_json) as Record<string, unknown>;
    const legacyCreatedAt = '2026-08-01T00:00:00.000Z';
    report.createdAt = legacyCreatedAt;
    database.prepare('UPDATE evaluations SET report_json = ?, created_at = ? WHERE report_id = ?')
      .run(JSON.stringify(report), legacyCreatedAt, evaluationId);
  } finally {
    database.close();
  }

  const restarted = createKnowledgeServer({
    repositoryRoot: projectRoot, runtimeDir, clock: () => now,
  });
  const base = await listen(restarted);
  try {
    const response = await fetch(`${base}/api/v1/evaluations/${encodeURIComponent(evaluationId)}`);
    assert.equal(response.status, 200);
    const detail = await response.json();
    assert.equal(detail.ruleRef, null);
    assert.deepEqual(detail.ruleBinding, {
      status: 'UNBOUND', reasonCode: 'RULE_REVISION_NOT_PROVABLE',
    });
    assert.equal(restarted.composition.repository.database.prepare(
      'SELECT COUNT(*) AS count FROM evaluation_rule_bindings WHERE report_id = ?',
    ).get(evaluationId)?.count, 0);
  } finally {
    await close(restarted);
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
