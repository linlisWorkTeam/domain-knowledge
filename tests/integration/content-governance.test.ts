import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
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

test('DEV-008 content governance APIs preserve lineage, evidence, rules, sources, and health inputs', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'wp-content-project-'));
  const runtimeDir = join(projectRoot, '.runtime');
  const inbox = join(projectRoot, 'knowledge', 'inbox');
  mkdirSync(inbox, { recursive: true });
  const sourcePath = join(inbox, 'source.md');
  writeFileSync(sourcePath, '# Source\n\nPinned source v1.\n');
  writeFileSync(join(projectRoot, 'outside.md'), '# Outside\n');
  const token = 'content-admin-secret';
  const instance = createKnowledgeServer({ repositoryRoot: projectRoot, runtimeDir, writeToken: token });
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
        kind: 'FILE', locator: 'knowledge/inbox/source.md', displayName: 'Pinned Source', project: 'default',
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
    const firstEvaluationDetail = await (await fetch(
      `${base}/api/v1/evaluations/${encodeURIComponent(firstEvaluation.report.reportId)}`,
    )).json();
    assert.equal(firstEvaluationDetail.immutable, true);
    assert.deepEqual(firstEvaluationDetail.ruleRef, { ruleId: 'publication-gate', revision: 1 });
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
      body: JSON.stringify({ expectedRevision: 3, reason: 'Disable source after verification', enabled: false }),
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
