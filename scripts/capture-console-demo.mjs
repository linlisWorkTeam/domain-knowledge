import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { SQLiteOperationalMetrics } from '../src/infrastructure/observability/sqlite-operational-metrics.ts';
import { createKnowledgeServer } from '../src/interfaces/runner/server.ts';
import { GOOD_BODY } from '../tests/helpers/fixture.ts';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const gifPath = join(projectRoot, 'site', 'console-dev007-dev008.gif');
const posterPath = join(projectRoot, 'site', 'console-dev007-dev008-poster.webp');
const runtimeDir = mkdtempSync(join(tmpdir(), 'domain-knowledge-site-demo-runtime-'));
const repositoryDir = mkdtempSync(join(tmpdir(), 'domain-knowledge-site-demo-source-'));
const writeToken = 'site-demo-governance-token';
const providerSecret = 'site-demo-secret-never-render';
const sourceLocator = 'knowledge/inbox/console-governance.md';
const viewport = { width: 1280, height: 800 };
const output = { width: 960, height: 600 };
const capturedAt = new Date().toISOString();
const clockOrigin = Date.parse('2026-09-04T08:30:00.000Z');
let tick = 0;

function demoClock() {
  return new Date(clockOrigin + tick++ * 30_000).toISOString();
}

function offset(instant, milliseconds) {
  return new Date(Date.parse(instant) + milliseconds).toISOString();
}

const revisedBody = `${GOOD_BODY}

## 修订说明

新增知识血缘、版本差异与来源漂移的治理验收。`;

const instance = createKnowledgeServer({
  repositoryRoot: repositoryDir,
  runtimeDir,
  writeToken,
  clock: demoClock,
  providerEndpointPolicy: {
    async validate(apiUrl) {
      const url = new URL(apiUrl);
      if (url.protocol !== 'https:' || url.hostname !== 'provider.demo.invalid') {
        throw new Error('PROVIDER_URL_DENIED: endpoint is outside the capture allowlist');
      }
      if (!url.pathname.endsWith('/')) url.pathname += '/';
      return { url, addresses: ['203.0.113.42'] };
    },
  },
  providerProbe: {
    async verify({ model }) {
      return { status: 'VERIFIED', reasonCode: 'READY', model: model ?? 'pi-governance-demo' };
    },
  },
});

const persistedMetrics = new SQLiteOperationalMetrics(
  instance.composition.repository.database,
  () => new Date(demoClock()),
);

function mutationHeaders(key) {
  return {
    authorization: `Bearer ${writeToken}`,
    'content-type': 'application/json',
    'idempotency-key': key,
  };
}

async function api(baseUrl, path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  assert.ok(response.ok, `${init.method ?? 'GET'} ${path} failed (${response.status}): ${text}`);
  return text ? JSON.parse(text) : null;
}

function recordNodeAttempt({
  run, nodeId, agentId, iteration, attempt,
  readyAfterMs, startedAfterMs, completedAfterMs,
  status = 'COMPLETED', detail, error = null,
}) {
  const readyAt = offset(run.createdAt, readyAfterMs);
  const startedAt = offset(run.createdAt, startedAfterMs);
  const completedAt = offset(run.createdAt, completedAfterMs);
  assert.ok(Date.parse(readyAt) <= Date.parse(startedAt), 'readyAt must not follow startedAt');
  assert.ok(Date.parse(startedAt) <= Date.parse(completedAt), 'startedAt must not follow completedAt');
  const common = {
    runId: run.runId,
    nodeId,
    agentId,
    iteration,
    attempt,
    readyAt,
    startedAt,
  };
  instance.composition.workflowObserver.record({
    ...common,
    status: 'RUNNING',
    detail: `开始${detail}`,
    error: null,
    completedAt: null,
    updatedAt: startedAt,
  });
  instance.composition.workflowObserver.record({
    ...common,
    status,
    detail,
    error,
    completedAt,
    updatedAt: completedAt,
  });
}

function recordProviderInvocation({
  invocationId, run, agentId, startedAfterMs, durationMs,
  status = 'SUCCEEDED', retryCount = 0,
  inputTokens = null, outputTokens = null, errorCode = null,
}) {
  const startedAt = offset(run.createdAt, startedAfterMs);
  persistedMetrics.recordProviderInvocation({
    invocationId,
    runId: run.runId,
    agentId,
    provider: 'pi-agent',
    model: 'pi-governance-demo',
    startedAt,
    completedAt: offset(startedAt, durationMs),
    durationMs,
    status,
    retryCount,
    inputTokens,
    outputTokens,
    cacheReadTokens: inputTokens === null ? null : Math.floor(inputTokens * 0.18),
    cacheWriteTokens: inputTokens === null ? null : Math.floor(inputTokens * 0.04),
    estimatedCostUsd: null,
    fixture: false,
    errorCode,
  });
}

async function captureRunConfiguration(run) {
  const snapshot = await instance.composition.runConfiguration.capture(run.runId);
  assert.equal(snapshot.provider.kind, 'pi-agent');
  assert.equal(snapshot.provider.model, 'pi-governance-demo');
  return snapshot;
}

async function createFailedRun(moduleId) {
  let run = instance.composition.apps.flywheel.createRun(moduleId, 'local-v1');
  await captureRunConfiguration(run);
  for (const state of ['PLANNED', 'GENERATING', 'EVALUATING', 'FAILED']) {
    run = instance.composition.apps.flywheel.transition(run.runId, state);
  }
  return run;
}

async function seed(baseUrl) {
  mkdirSync(join(repositoryDir, 'knowledge', 'inbox'), { recursive: true });
  writeFileSync(join(repositoryDir, sourceLocator), `${GOOD_BODY}\n\n来源初始修订。\n`);

  await api(baseUrl, '/api/v1/provider-settings', {
    method: 'PUT',
    headers: mutationHeaders('site-demo-provider-save'),
    body: JSON.stringify({
      provider: 'pi-agent',
      apiUrl: 'https://provider.demo.invalid/v1',
      apiKey: providerSecret,
      model: 'pi-governance-demo',
      expectedRevision: 0,
    }),
  });
  const providerVerification = await api(baseUrl, '/api/v1/provider-settings/verify', {
    method: 'POST',
    headers: mutationHeaders('site-demo-provider-verify'),
    body: JSON.stringify({ expectedRevision: 1, enable: true }),
  });
  assert.equal(providerVerification.status, 'VERIFIED');
  assert.equal(providerVerification.enabled, true);

  const first = await api(baseUrl, '/api/v1/knowledge/candidates', {
    method: 'POST',
    headers: mutationHeaders('site-demo-candidate-v1'),
    body: JSON.stringify({
      moduleId: 'governance-console',
      title: '控制台治理知识',
      description: '用于复验知识健康度和真实证据链。',
      body: GOOD_BODY,
      category: 'governance',
      tags: ['evidence', 'console'],
      provenance: [{ path: sourceLocator, commit: 'source-v1', pinned: true }],
    }),
  });

  let verifiedRun = instance.composition.apps.flywheel.createRun('governance-console', 'local-v1');
  await captureRunConfiguration(verifiedRun);
  for (const state of ['PLANNED', 'GENERATING', 'EVALUATING']) {
    verifiedRun = instance.composition.apps.flywheel.transition(verifiedRun.runId, state);
  }
  const firstEvaluationEvidence = await instance.composition.artifacts.put(
    Buffer.from(JSON.stringify({ tests: 24, passed: 23, suite: 'console-governance', iteration: 0 })),
    'application/json',
  );
  const firstEvaluation = await instance.composition.apps.flywheel.recordEvaluation({
    runId: verifiedRun.runId,
    versionId: first.version.versionId,
    evidenceRefs: [firstEvaluationEvidence],
    toolchainFingerprint: 'site-console-demo@deterministic-acceptance-seed',
    criticalFailures: 1,
    testsPassed: 23,
    testsTotal: 24,
    stability: 0.95,
  }, instance.composition.config.publicationGate);
  assert.equal(firstEvaluation.decision.outcome, 'ITERATE');

  const correctionEvidence = await instance.composition.artifacts.put(
    Buffer.from(JSON.stringify({ correctionId: 'COR-SITE-DEMO-001', reason: '补充治理证据导航' })),
    'application/json',
  );
  const revised = await api(baseUrl, '/api/v1/knowledge/candidates', {
    method: 'POST',
    headers: mutationHeaders('site-demo-candidate-v2'),
    body: JSON.stringify({
      moduleId: 'governance-console',
      title: '控制台治理知识（修订）',
      description: '补充版本血缘、差异、评测和来源漂移的反向导航。',
      body: revisedBody,
      category: 'governance',
      tags: ['evidence', 'console', 'lineage'],
      provenance: [{ path: sourceLocator, commit: 'source-v1', pinned: true }],
      metadata: {
        correctionId: 'COR-SITE-DEMO-001',
        correctionEvidenceRefs: [correctionEvidence],
      },
    }),
  });

  for (const state of ['ITERATING', 'GENERATING', 'EVALUATING']) {
    verifiedRun = instance.composition.apps.flywheel.transition(verifiedRun.runId, state);
  }
  const evaluationEvidence = await instance.composition.artifacts.put(
    Buffer.from(JSON.stringify({ tests: 24, passed: 24, suite: 'console-governance', iteration: 1 })),
    'application/json',
  );
  const evaluation = await instance.composition.apps.flywheel.recordEvaluation({
    runId: verifiedRun.runId,
    versionId: revised.version.versionId,
    evidenceRefs: [evaluationEvidence],
    toolchainFingerprint: 'site-console-demo@deterministic-acceptance-seed',
    criticalFailures: 0,
    testsPassed: 24,
    testsTotal: 24,
    stability: 1,
  }, instance.composition.config.publicationGate);
  await instance.composition.apps.flywheel.publish(
    verifiedRun.runId,
    revised.version.versionId,
    evaluation.decision.decisionId,
  );

  const resolvedFailedRun = await createFailedRun('governance-remediation');
  const visibleFailedRun = await createFailedRun('source-reconciliation');

  recordNodeAttempt({
    run: verifiedRun, nodeId: 'orchestrator', agentId: 'orchestrator', iteration: 0, attempt: 1,
    readyAfterMs: 0, startedAfterMs: 1_200, completedAfterMs: 9_800, detail: '完成治理计划',
  });
  recordNodeAttempt({
    run: verifiedRun, nodeId: 'doc_gen', agentId: 'doc-gen', iteration: 0, attempt: 1,
    readyAfterMs: 9_800, startedAfterMs: 12_600, completedAfterMs: 44_500, detail: '生成知识候选',
  });
  recordNodeAttempt({
    run: verifiedRun, nodeId: 'test_gen', agentId: 'test-gen', iteration: 0, attempt: 1,
    readyAfterMs: 9_800, startedAfterMs: 14_200, completedAfterMs: 37_800, detail: '生成确定性评测',
  });
  recordNodeAttempt({
    run: verifiedRun, nodeId: 'code', agentId: 'code', iteration: 0, attempt: 1,
    readyAfterMs: 44_500, startedAfterMs: 47_100, completedAfterMs: 58_300,
    status: 'FAILED', detail: '模型响应未通过结构校验', error: 'PROVIDER_RESPONSE_INVALID',
  });
  recordNodeAttempt({
    run: verifiedRun, nodeId: 'code', agentId: 'code', iteration: 0, attempt: 2,
    readyAfterMs: 58_300, startedAfterMs: 61_900, completedAfterMs: 91_400, detail: '重试后生成实现',
  });
  recordNodeAttempt({
    run: verifiedRun, nodeId: 'check', agentId: 'check', iteration: 1, attempt: 1,
    readyAfterMs: 91_400, startedAfterMs: 93_000, completedAfterMs: 108_600, detail: '完成只读检查',
  });
  recordNodeAttempt({
    run: verifiedRun, nodeId: 'review', agentId: 'review', iteration: 1, attempt: 1,
    readyAfterMs: 108_600, startedAfterMs: 111_800, completedAfterMs: 132_100, detail: '完成证据复核',
  });
  recordNodeAttempt({
    run: resolvedFailedRun, nodeId: 'doc_gen', agentId: 'doc-gen', iteration: 0, attempt: 1,
    readyAfterMs: 0, startedAfterMs: 2_900, completedAfterMs: 18_700,
    status: 'FAILED', detail: '上游模型暂不可用', error: 'PROVIDER_UNAVAILABLE',
  });
  recordNodeAttempt({
    run: visibleFailedRun, nodeId: 'test_gen', agentId: 'test-gen', iteration: 0, attempt: 1,
    readyAfterMs: 0, startedAfterMs: 4_100, completedAfterMs: 22_900,
    status: 'FAILED', detail: '评测运行未完成', error: 'PROVIDER_TIMEOUT',
  });

  recordProviderInvocation({
    invocationId: 'pinv_site_orchestrator', run: verifiedRun, agentId: 'orchestrator',
    startedAfterMs: 1_200, durationMs: 8_600, inputTokens: 1_240, outputTokens: 380,
  });
  recordProviderInvocation({
    invocationId: 'pinv_site_doc_gen', run: verifiedRun, agentId: 'doc-gen',
    startedAfterMs: 12_600, durationMs: 31_900, inputTokens: 4_820, outputTokens: 1_680,
  });
  recordProviderInvocation({
    invocationId: 'pinv_site_test_gen', run: verifiedRun, agentId: 'test-gen',
    startedAfterMs: 14_200, durationMs: 23_600, inputTokens: 2_760, outputTokens: 920,
  });
  recordProviderInvocation({
    invocationId: 'pinv_site_code', run: verifiedRun, agentId: 'code',
    startedAfterMs: 47_100, durationMs: 44_300, retryCount: 1,
    inputTokens: 6_430, outputTokens: 2_180,
  });
  recordProviderInvocation({
    invocationId: 'pinv_site_check', run: verifiedRun, agentId: 'check',
    startedAfterMs: 93_000, durationMs: 15_600, inputTokens: 2_140, outputTokens: 510,
  });
  recordProviderInvocation({
    invocationId: 'pinv_site_review', run: verifiedRun, agentId: 'review',
    startedAfterMs: 111_800, durationMs: 20_300, inputTokens: 3_060, outputTokens: 740,
  });
  recordProviderInvocation({
    invocationId: 'pinv_site_failed', run: resolvedFailedRun, agentId: 'doc-gen',
    startedAfterMs: 2_900, durationMs: 15_800, status: 'FAILED',
    inputTokens: null, outputTokens: null, errorCode: 'PROVIDER_UNAVAILABLE',
  });

  const sourceResult = await api(baseUrl, '/api/v1/sources', {
    method: 'POST',
    headers: mutationHeaders('site-demo-source-create'),
    body: JSON.stringify({
      kind: 'FILE',
      locator: sourceLocator,
      displayName: '控制台治理规范',
      project: 'wpKnowledge',
    }),
  });
  writeFileSync(join(repositoryDir, sourceLocator), `${revisedBody}\n\n来源在固定后发生变化。\n`);
  await api(baseUrl, `/api/v1/sources/${encodeURIComponent(sourceResult.resourceId)}/refresh`, {
    method: 'POST',
    headers: mutationHeaders('site-demo-source-refresh'),
    body: JSON.stringify({ reason: '录制来源漂移复验' }),
  });

  const actionItems = await api(baseUrl, '/api/v1/action-items?status=OPEN', {
    headers: { authorization: `Bearer ${writeToken}` },
  });
  const actionToResolve = actionItems.items.find((item) => item.runId === resolvedFailedRun.runId);
  assert.ok(actionToResolve, 'resolved acceptance-seed run must project an action item');
  const acknowledged = await api(
    baseUrl,
    `/api/v1/action-items/${encodeURIComponent(actionToResolve.actionItemId)}/actions/acknowledge`,
    {
      method: 'POST',
      headers: mutationHeaders('site-demo-action-acknowledge'),
      body: JSON.stringify({ expectedRevision: actionToResolve.revision, reason: '验收种子：已确认失败原因' }),
    },
  );
  assert.equal(acknowledged.status, 'ACKNOWLEDGED');
  const resolvedAction = await api(
    baseUrl,
    `/api/v1/action-items/${encodeURIComponent(actionToResolve.actionItemId)}/actions/resolve`,
    {
      method: 'POST',
      headers: mutationHeaders('site-demo-action-resolve'),
      body: JSON.stringify({ expectedRevision: acknowledged.revision, reason: '验收种子：治理证据已复验' }),
    },
  );
  assert.equal(resolvedAction.status, 'RESOLVED');

  const remainingActions = await api(baseUrl, '/api/v1/action-items?status=OPEN', {
    headers: { authorization: `Bearer ${writeToken}` },
  });
  assert.equal(remainingActions.items.length, 2);
  assert.ok(remainingActions.items.some((item) => item.runId === visibleFailedRun.runId));
  assert.ok(remainingActions.items.some((item) => item.subject?.id === sourceResult.resourceId));

  const runMetrics = await api(baseUrl, '/api/v1/metrics/runs?window=7d');
  assert.equal(runMetrics.cohort.kind, 'REAL');
  assert.equal(runMetrics.cohort.runCount, 3);
  assert.equal(runMetrics.providerCalls.total, 7);
  assert.equal(runMetrics.providerCalls.retries, 1);
  assert.equal(runMetrics.workflowNodeRetries.total, 1);
  assert.ok(runMetrics.queueDurationMs.sampleSize > 0);
  assert.equal(runMetrics.estimatedCostUsd.sampleSize, 0);
  assert.equal(runMetrics.estimatedCostUsd.total, null);

  const governanceMetrics = await api(baseUrl, '/api/v1/metrics/governance?window=7d');
  assert.equal(governanceMetrics.cohort.kind, 'REAL');
  assert.equal(governanceMetrics.firstRevisionPassRate.value, 1);
  assert.equal(governanceMetrics.threeIterationConvergenceRate.value, 1);
  assert.equal(governanceMetrics.meanResolutionTimeMs.sampleSize, 1);

  const providerSettings = await api(baseUrl, '/api/v1/provider-settings', {
    method: 'GET',
  });
  assert.equal(providerSettings.apiKeyConfigured, true);
  assert.doesNotMatch(JSON.stringify(providerSettings), new RegExp(providerSecret));

  const providerStatus = await api(baseUrl, '/api/v1/agents/providers/status', {
    method: 'GET',
  });
  assert.doesNotMatch(JSON.stringify(providerStatus), new RegExp(providerSecret));

  return {
    firstVersionId: first.version.versionId,
    revisedVersionId: revised.version.versionId,
    evidenceRunId: verifiedRun.runId,
    evaluationId: evaluation.report.reportId,
    sourceId: sourceResult.resourceId,
    resolvedActionItemId: actionToResolve.actionItemId,
  };
}

async function waitForTitle(page, title) {
  await page.waitForFunction((expected) => document.querySelector('#page-title')?.textContent?.trim() === expected, title);
  await page.waitForTimeout(220);
}

async function recordFrame(page, frames, label, delay = 1_450) {
  const passwordValues = await page.locator('input[type="password"]').evaluateAll((inputs) => (
    inputs.map((input) => input.value).filter(Boolean)
  ));
  assert.deepEqual(passwordValues, [], `${label} contains a populated password field`);
  const visibleText = await page.locator('body').innerText();
  assert.doesNotMatch(visibleText, new RegExp(providerSecret), `${label} renders the provider secret`);
  const screenshot = await page.screenshot({ animations: 'disabled' });
  const pixels = await sharp(screenshot)
    .resize({ width: output.width, height: output.height, fit: 'cover', position: 'top' })
    .ensureAlpha()
    .raw()
    .toBuffer();
  frames.push({ label, delay, pixels, screenshot });
}

async function capture(baseUrl, seeded) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    locale: 'zh-CN',
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  });
  await context.addInitScript(() => localStorage.setItem('wp-knowledge-theme', 'dark'));
  const page = await context.newPage();
  const frames = [];
  try {
    // The Console keeps an SSE activity stream open, so `networkidle` is not a
    // valid readiness signal. The rendered page title below is the stable gate.
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await waitForTitle(page, '操作中心');
    await page.locator('#operator-button').click();
    await page.locator('#operator-token').fill(writeToken);
    await page.locator('#operator-dialog .primary-button').click();
    await page.waitForFunction(() => document.querySelector('#mode-pill')?.textContent === '治理模式');
    await recordFrame(page, frames, '操作中心');

    await page.locator('[data-page="knowledge"]').click();
    await waitForTitle(page, '知识');
    await page.locator(`[data-version-id="${seeded.revisedVersionId}"]`).click();
    await page.waitForFunction(() => document.querySelector('#detail-drawer')?.getAttribute('aria-hidden') === 'false');
    await recordFrame(page, frames, '知识血缘');
    await page.locator('#knowledge-diff-form button[type="submit"]').click();
    await page.getByText('变更范围符合修订约束').waitFor();
    await page.locator('#knowledge-diff-result').scrollIntoViewIfNeeded();
    await recordFrame(page, frames, '知识差异', 1_700);
    await page.locator('#drawer-close').click();

    await page.locator('[data-page="evaluations"]').click();
    await waitForTitle(page, '评测');
    await page.locator('.quality-layout').waitFor();
    await recordFrame(page, frames, '评测与规则');

    await page.locator('[data-page="sources"]').click();
    await waitForTitle(page, '来源');
    await page.getByText('控制台治理规范').waitFor();
    await recordFrame(page, frames, '来源漂移');

    await page.locator('[data-page="agent-settings"]').click();
    await waitForTitle(page, 'Agent 设置');
    await page.getByText('pi-governance-demo').first().waitFor();
    await recordFrame(page, frames, 'Agent 设置与运行观测', 1_700);
    await page.locator('.governance-metrics').scrollIntoViewIfNeeded();
    await recordFrame(page, frames, '治理效果');

    await page.locator('#theme-button').click();
    await page.locator('.provider-layout').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await recordFrame(page, frames, '浅色主题', 1_850);

    const stacked = Buffer.concat(frames.map((frame) => frame.pixels));
    await sharp(stacked, {
      raw: {
        width: output.width,
        height: output.height * frames.length,
        channels: 4,
        pageHeight: output.height,
      },
    }).gif({
      loop: 0,
      delay: frames.map((frame) => frame.delay),
      colours: 96,
      dither: 0.65,
      effort: 8,
    }).toFile(gifPath);
    await sharp(frames[0].screenshot)
      .resize({ width: output.width, height: output.height, fit: 'cover', position: 'top' })
      .webp({ quality: 84, effort: 6 })
      .toFile(posterPath);
    return frames.map(({ label, delay }) => ({ label, delay }));
  } finally {
    await context.close();
    await browser.close();
  }
}

let listening = false;
try {
  instance.server.listen(0, '127.0.0.1');
  await once(instance.server, 'listening');
  listening = true;
  const address = instance.server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const seeded = await seed(baseUrl);
  const frames = await capture(baseUrl, seeded);
  process.stdout.write(`${JSON.stringify({
    capturedAt,
    source: 'actual Console served by createKnowledgeServer with persisted deterministic acceptance-seed facts',
    viewport,
    output,
    frames,
    evidence: seeded,
    secretRendered: false,
    assets: [gifPath, posterPath],
  }, null, 2)}\n`);
} finally {
  if (listening) {
    instance.server.close();
    await once(instance.server, 'close');
  } else {
    instance.composition.close();
  }
  rmSync(runtimeDir, { recursive: true, force: true });
  rmSync(repositoryDir, { recursive: true, force: true });
}
