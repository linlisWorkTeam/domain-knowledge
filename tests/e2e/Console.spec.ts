/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证Console的行为、约束及失败场景。
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createKnowledgeServer } from '../../src/interfaces/runner/Server.ts';
import { assertModelOutput } from '../../src/infrastructure/agentAdapters/ModelExecution.ts';
import { GENERIC_SCENARIO, GOOD_BODY } from '../helpers/Fixture.ts';

let instance: ReturnType<typeof createKnowledgeServer>;
let runtimeDir = '';
let repositoryDir = '';
let baseUrl = '';
let firstVersionId = '';
let latestVersionId = '';
let lineageRunId = '';
let lineageEvaluationId = '';
let providerVerification: 'VERIFIED' | 'FAILED' = 'FAILED';

const SOURCE_LOCATOR = 'knowledge/inbox/console-source.md';
const HEALTH_SOURCE_LOCATOR = 'knowledge/inbox/health-source.md';
const PROVIDER_SECRET = 'sk-e2e-never-render-this';
const METRICS_SAMPLED_AT = '2026-09-04T08:30:00.000Z';
const REVISED_BODY = `${GOOD_BODY}\n\n## 修订说明\n\n新增真实 API 的前台反向导航验收。`;

const operationalMetrics = {
  recordProviderInvocation() {},
  runs(window: string) {
    return {
      window,
      from: '2026-08-28T08:30:00.000Z',
      to: METRICS_SAMPLED_AT,
      sampledAt: METRICS_SAMPLED_AT,
      cohort: { kind: 'MIXED', isFixture: null, runCount: 4, providerInvocationCount: 4 },
      definitions: {
        runDurationMs: 'terminal run updatedAt minus createdAt',
        nodeDurationMs: 'node completedAt minus startedAt',
        queueDurationMs: 'node startedAt minus readyAt',
        providerRetries: 'additional Provider attempts after invalid output',
        workflowNodeRetries: 'workflow attempts after the first attempt',
        estimatedCostUsd: 'provider usage multiplied by configured model pricing',
      },
      runDurationMs: { sampleSize: 3, p50: 1_500, p95: 4_500 },
      nodeDurationMs: { sampleSize: 8, p50: 600, p95: 1_800 },
      queueDurationMs: { sampleSize: 8, p50: 350, p95: 900 },
      providerCalls: { sampleSize: 4, total: 12, succeeded: 10, failed: 2, retries: 3 },
      workflowNodeRetries: { sampleSize: 8, total: 2 },
      tokens: { sampleSize: 4, input: 2_400, output: 1_056, total: 3_456 },
      estimatedCostUsd: { sampleSize: 4, total: 0.0312 },
      nodes: [],
      providers: [],
    };
  },
  governance(window: string) {
    return {
      window,
      from: '2026-08-28T08:30:00.000Z',
      to: METRICS_SAMPLED_AT,
      sampledAt: METRICS_SAMPLED_AT,
      cohort: { kind: 'MIXED', isFixture: null, runCount: 4, providerInvocationCount: 4 },
      definitions: {
        firstRevisionPassRate: 'second gate decision passes among eligible runs',
        threeIterationConvergenceRate: 'runs passing within three decisions',
        humanInterventionRate: 'runs with audited human governance actions',
        meanResolutionTimeMs: 'resolvedAt minus createdAt',
        shortTermRecurrenceRate: 'linked recurrence within seven days',
      },
      firstRevisionPassRate: { sampleSize: 2, numerator: 1, denominator: 2, value: 0.5 },
      threeIterationConvergenceRate: { sampleSize: 4, numerator: 3, denominator: 4, value: 0.75 },
      humanInterventionRate: { sampleSize: 4, numerator: 1, denominator: 4, value: 0.25 },
      meanResolutionTimeMs: { sampleSize: 2, numerator: null, denominator: null, value: 2_000 },
      shortTermRecurrenceRate: { sampleSize: 10, numerator: 1, denominator: 10, value: 0.1 },
    };
  },
};

async function enterGovernance(page: Page) {
  await expect(page.locator('#mode-pill')).toHaveText('只读模式');
  await page.getByRole('button', { name: '＋ 新建批次' }).click();
  await page.getByLabel('治理令牌').fill('ui-e2e-token');
  await page.getByRole('button', { name: '确认' }).click();
  await expect(page.locator('#mode-pill')).toHaveText('治理模式');
}

async function navigateTo(page: Page, label: string) {
  await page.getByRole('button', { name: new RegExp(`^${label}$`) }).click();
  await expect(page.getByRole('heading', { name: label, level: 1 })).toBeVisible();
}

test.beforeAll(async () => {
  runtimeDir = mkdtempSync(join(tmpdir(), 'domain-knowledge-ui-e2e-'));
  repositoryDir = mkdtempSync(join(tmpdir(), 'domain-knowledge-source-e2e-'));
  mkdirSync(join(repositoryDir, 'knowledge', 'inbox'), { recursive: true });
  writeFileSync(join(repositoryDir, SOURCE_LOCATOR), `${GOOD_BODY}\n\n来源初始修订。\n`);
  writeFileSync(join(repositoryDir, HEALTH_SOURCE_LOCATOR), REVISED_BODY);
  writeFileSync(join(repositoryDir, 'outside-acquisition-root.md'), GOOD_BODY);
  instance = createKnowledgeServer({
    repositoryRoot: repositoryDir,
    runtimeDir,
    writeToken: 'ui-e2e-token',
    providerEndpointPolicy: {
      async validate(apiUrl: string) {
        const url = new URL(apiUrl);
        if (url.hostname === 'denied.example.test') {
          throw new Error('PROVIDER_URL_DENIED: endpoint is outside the E2E allowlist');
        }
        if (!url.pathname.endsWith('/')) url.pathname += '/';
        return { url, addresses: ['203.0.113.10'] };
      },
    },
    providerProbe: {
      async verify({ model }: { model: string | null }) {
        return providerVerification === 'VERIFIED'
          ? { status: 'VERIFIED' as const, reasonCode: 'GENERATION_READY', model: model ?? 'pi-e2e-model', checks: { modelList: 'PASSED' as const, generation: 'PASSED' as const } }
          : { status: 'FAILED' as const, reasonCode: 'PROVIDER_AUTH_INVALID', model, checks: { modelList: 'FAILED' as const, generation: 'NOT_RUN' as const } };
      },
    },
    operationalMetrics,
  });
  instance.server.listen(0, '127.0.0.1');
  await once(instance.server, 'listening');
  const address = instance.server.address();
  assert.ok(address && typeof address === 'object');
  baseUrl = `http://127.0.0.1:${address.port}`;

  const headers = {
    authorization: 'Bearer ui-e2e-token',
    'content-type': 'application/json',
  };
  const candidate = await fetch(`${baseUrl}/api/v1/knowledge/candidates`, {
    method: 'POST', headers: { ...headers, 'idempotency-key': 'console-e2e-candidate' }, body: JSON.stringify({
      moduleId: 'browser-contract',
      title: '浏览器验收知识',
      description: '用于验证控制台真实查询与详情交互。',
      body: GOOD_BODY,
      provenance: [{ path: HEALTH_SOURCE_LOCATOR, commit: 'source-v1', pinned: true }],
    }),
  });
  assert.equal(candidate.status, 201);
  const firstCandidate = await candidate.json();
  firstVersionId = firstCandidate.version.versionId;

  const correctionEvidence = await instance.composition.artifacts.put(
    Buffer.from(JSON.stringify({ correctionId: 'COR-E2E-001', scope: 'browser contract' })),
    'application/json',
  );
  const revisedCandidate = await fetch(`${baseUrl}/api/v1/knowledge/candidates`, {
    method: 'POST', headers: { ...headers, 'idempotency-key': 'console-e2e-candidate-v2' }, body: JSON.stringify({
      moduleId: 'browser-contract',
      title: '浏览器验收知识（修订）',
      description: '用于验证血缘、差异和反向证据导航。',
      body: REVISED_BODY,
      provenance: [{ path: HEALTH_SOURCE_LOCATOR, commit: 'source-v1', pinned: true }],
      metadata: { correctionId: 'COR-E2E-001', correctionEvidenceRefs: [correctionEvidence] },
    }),
  });
  assert.equal(revisedCandidate.status, 201);
  const revisedPayload = await revisedCandidate.json();
  latestVersionId = revisedPayload.version.versionId;

  let verifiedRun = instance.composition.apps.flywheel.createRun('browser-contract', 'local-v1');
  for (const nextState of ['PLANNED', 'GENERATING', 'EVALUATING'] as const) {
    verifiedRun = instance.composition.apps.flywheel.transition(verifiedRun.runId, nextState);
  }
  const evaluationEvidence = await instance.composition.artifacts.put(
    Buffer.from(JSON.stringify({ tests: 12, passed: 12 })),
    'application/json',
  );
  const verifiedEvaluation = await instance.composition.apps.flywheel.recordEvaluation({
    runId: verifiedRun.runId,
    versionId: latestVersionId,
    evidenceRefs: [evaluationEvidence],
    toolchainFingerprint: 'console-e2e@1',
    criticalFailures: 0,
    testsPassed: 12,
    testsTotal: 12,
    stability: 1,
  }, instance.composition.config.publicationGate);
  await instance.composition.apps.flywheel.publish(
    verifiedRun.runId,
    latestVersionId,
    verifiedEvaluation.decision.decisionId,
  );
  lineageRunId = verifiedRun.runId;
  lineageEvaluationId = verifiedEvaluation.report.reportId;

  const healthSource = await fetch(`${baseUrl}/api/v1/sources`, {
    method: 'POST', headers: { ...headers, 'idempotency-key': 'console-e2e-health-source' }, body: JSON.stringify({
      kind: 'FILE', locator: HEALTH_SOURCE_LOCATOR, displayName: '健康度基准来源', project: 'console-e2e',
    }),
  });
  assert.equal(healthSource.status, 201);

  const { runId } = instance.composition.apps.flywheel.createRun('browser-contract', 'local-v1');
  for (const nextState of ['PLANNED', 'GENERATING', 'EVALUATING', 'FAILED'] as const) {
    instance.composition.apps.flywheel.transition(runId, nextState);
  }
});

test('工作流图由标准节点 API 支撑并保持只读', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));
  await page.goto(baseUrl);
  await page.getByRole('button', { name: /^工作流图$/ }).click();
  await expect(page.getByRole('heading', { name: '工作流图', level: 1 })).toBeVisible();
  await expect(page.getByLabel('只读 Agent 工作流图')).toBeVisible();
  await expect(page.getByText(/仅查看 · 自动更新；断线后每 10 秒刷新/)).toBeVisible();
  await expect(page.locator('.workflow-graph')).toHaveCount(1);
  await expect(page.locator('.graph-node')).toHaveCount(7);
  await expect(page.locator('.graph-edge')).toHaveCount(7);
  await expect(page.locator('.graph-status-legend')).toContainText('运行中');
  await expect(page.locator('.graph-status-legend')).toContainText('已完成');
  expect(requests.some((path) => /\/api\/v1\/runs\/[^/]+\/workflow-nodes$/.test(path))).toBe(true);
  expect(requests.some((path) => /\/api\/v1\/runs\/[^/]+\/workflow-status$/.test(path))).toBe(true);
  expect(requests.some((path) => /\/api\/v1\/runs\/[^/]+\/events$/.test(path))).toBe(true);
  const runSelector = page.locator('#graph-run-select');
  const alternateRun = await runSelector.locator('option').evaluateAll((options, selected) => (
    options.map((option) => (option as HTMLOptionElement).value).find((value) => value && value !== selected)
  ), await runSelector.inputValue());
  assert.ok(alternateRun);
  await runSelector.selectOption(alternateRun);
  await expect(page.locator('.workflow-graph')).toHaveCount(1);
  await expect(page.locator('.graph-node')).toHaveCount(7);
  await page.locator('[data-graph-agent]').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '关闭详情' }).click();
  await expect(page.locator('[data-graph-agent]').first()).toBeFocused();
});

test.afterAll(async () => {
  instance.server.close();
  await once(instance.server, 'close');
  rmSync(runtimeDir, { recursive: true, force: true });
  rmSync(repositoryDir, { recursive: true, force: true });
});

test('seven-page Console keeps one H1 and does not scan Sources on entry', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto(baseUrl);

  await expect(page.getByRole('heading', { name: '操作中心', level: 1 })).toBeVisible();
  await expect(page.getByText('browser-contract').first()).toBeVisible();
  await expect(page.getByText(/项需要确认/)).toBeVisible();

  const labels = ['操作中心', '飞轮批次', '知识', '工作流图', '评测', '来源', 'Agent 设置'];
  for (const label of labels) {
    await expect(page.getByRole('button', { name: new RegExp(label) }).first()).toBeVisible();
    if (label !== '操作中心') await page.getByRole('button', { name: new RegExp(`^${label}$`) }).click();
    await expect(page.getByRole('heading', { name: label, exact: true })).toHaveCount(1);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.getByText(/Action Center|Flywheel Runs|Knowledge Health|Recent Pulse|New run|Run history|PARTIAL|DISABLED/)).toHaveCount(0);
  }

  await page.getByRole('button', { name: /^来源$/ }).click();
  await expect(page.getByRole('heading', { name: '来源注册' })).toBeVisible();
  await expect(page.getByText('尚未执行扫描')).toBeVisible();
  expect(requests.some((url) => url.includes('/api/v1/sources?limit=50'))).toBe(true);
  expect(requests.some((url) => url.endsWith('/api/v1/sources/scan'))).toBe(false);
  expect(requests.every((url) => url.startsWith(baseUrl))).toBe(true);
  await expect(page.getByText(/预计完成|Workspace owner/)).toHaveCount(0);
});

test('Action Center uses persisted items and submits an audited governance action', async ({ page }) => {
  await page.goto(baseUrl);
  await expect(page.getByText('批次执行失败').first()).toBeVisible();
  await page.getByRole('button', { name: '＋ 新建批次' }).click();
  await page.getByLabel('治理令牌').fill('ui-e2e-token');
  await page.getByRole('button', { name: '确认' }).click();
  page.once('dialog', (dialog) => dialog.accept('浏览器验收接手'));
  await page.getByRole('button', { name: '接手' }).first().click();
  await expect(page.getByText('治理操作已提交并记录审计。')).toBeVisible();
  await expect(page.getByRole('button', { name: '接手' })).toHaveCount(0);
  const items = await (await fetch(`${baseUrl}/api/v1/action-items?status=ACKNOWLEDGED`)).json();
  assert.equal(items.items.length, 1);
  const detail = await (await fetch(`${baseUrl}/api/v1/action-items/${items.items[0].actionItemId}`)).json();
  assert.equal(detail.history[0].action, 'ACKNOWLEDGE');
  assert.equal(detail.history[0].reason, '浏览器验收接手');
});

test('knowledge search and detail drawer are keyboard operable and restore focus', async ({ page }) => {
  await page.goto(baseUrl);
  await page.getByRole('button', { name: '搜索知识' }).click();
  const search = page.getByRole('searchbox');
  await expect(search).toBeFocused();
  await page.getByRole('combobox', { name: '知识状态' }).selectOption('');
  const searchResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/api/v1/cards' && url.searchParams.get('q') === '浏览器验收';
  });
  await search.fill('浏览器验收');
  await searchResponse;
  await expect(page.getByRole('button', { name: /浏览器验收知识/ }).first()).toBeVisible();

  const card = page.getByRole('button', { name: /浏览器验收知识/ }).first();
  const openedVersionId = await card.getAttribute('data-version-id');
  assert.ok(openedVersionId);
  await card.focus();
  await card.press('Enter');
  const drawer = page.getByRole('dialog', { name: '浏览器验收知识（修订）' });
  await expect(drawer).toBeVisible();
  await expect(page.getByRole('button', { name: '关闭详情' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(page.locator(`#knowledge-list [data-version-id="${openedVersionId}"]`)).toBeFocused();
});

test('partial API failures remain explicit without replacing persisted facts', async ({ page }) => {
  await page.route('**/api/v1/system/status', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'STATUS_UNAVAILABLE', message: '状态服务暂不可用' }),
  }));
  await page.goto(baseUrl);
  await expect(page.getByText('部分数据暂不可用')).toBeVisible();
  await expect(page.getByText('browser-contract').first()).toBeVisible();
  await expect(page.getByText('状态服务暂不可用')).toHaveCount(0);
});

test('Provider 配置与验证通过真实 API fail closed，且密钥不回填不泄漏', async ({ page }) => {
  providerVerification = 'FAILED';
  await page.goto(baseUrl);
  await enterGovernance(page);
  await navigateTo(page, 'Agent 设置');
  await expect(page.getByRole('heading', { name: '补充 Agent 提示词' })).toBeVisible();
  await expect(page.locator('.settings-list')).toContainText('DeepSeek Harness');

  await expect(page.locator('.provider-card .form-note')).toContainText('调用模型生成一段短文本');
  await expect(page.locator('.provider-card .form-note')).toContainText('不会自动重试');
  const form = page.locator('#provider-settings-form');
  await form.getByLabel('API 地址').fill('https://denied.example.test/v1');
  await form.getByLabel('API Key', { exact: true }).fill(PROVIDER_SECRET);
  await form.getByLabel('模型').fill('pi-e2e-model');
  page.once('dialog', (dialog) => dialog.accept());
  const rejectedSavePromise = page.waitForResponse((response) => (
    new URL(response.url()).pathname === '/api/v1/provider-settings'
    && response.request().method() === 'PUT'
  ));
  await form.getByRole('button', { name: '保存配置' }).click();
  const rejectedSave = await rejectedSavePromise;
  assert.equal(rejectedSave.status(), 422);
  assert.doesNotMatch(await rejectedSave.text(), new RegExp(PROVIDER_SECRET));
  await expect(page.locator('#toast')).toHaveText('该 API 地址不在允许的网络范围内。');
  await expect(page.getByText('配置已安全保存，请完成连接验证。')).toHaveCount(0);
  const settingsAfterRejectedSave = await (await fetch(`${baseUrl}/api/v1/provider-settings`)).json();
  assert.equal(settingsAfterRejectedSave.revision, 0);
  assert.equal(settingsAfterRejectedSave.apiKeyConfigured, false);

  await form.getByLabel('API 地址').fill('https://provider.example.test/v1');
  await form.getByLabel('API Key', { exact: true }).fill(PROVIDER_SECRET);
  await form.getByLabel('模型').fill('pi-e2e-model');
  page.once('dialog', (dialog) => dialog.accept());
  const savePromise = page.waitForResponse((response) => (
    new URL(response.url()).pathname === '/api/v1/provider-settings'
    && response.request().method() === 'PUT'
  ));
  await form.getByRole('button', { name: '保存配置' }).click();
  const saveResponse = await savePromise;
  assert.equal(saveResponse.status(), 200);
  const saveText = await saveResponse.text();
  assert.doesNotMatch(saveText, new RegExp(PROVIDER_SECRET));
  assert.equal(JSON.parse(saveText).settings.apiKeyConfigured, true);
  await expect(page.locator('#toast')).toHaveText('配置已安全保存，请完成连接验证。');
  await expect(page.locator('input[name="apiKey"]')).toHaveValue('');
  await expect(page.locator('input[name="apiKey"]')).toHaveAttribute('placeholder', '留空表示保留现有密钥');

  const failedVerificationPromise = page.waitForResponse((response) => (
    new URL(response.url()).pathname === '/api/v1/provider-settings/verify'
    && response.request().method() === 'POST'
  ));
  await page.getByRole('button', { name: '验证并启用' }).click();
  const failedVerification = await failedVerificationPromise;
  assert.equal(failedVerification.status(), 200);
  const failedPayload = await failedVerification.json();
  assert.equal(failedPayload.status, 'FAILED');
  assert.equal(failedPayload.reasonCode, 'PROVIDER_AUTH_INVALID');
  assert.equal(failedPayload.enabled, false);
  await expect(page.locator('#toast')).toHaveText('API Key 验证失败。');
  await expect(page.getByText('连接验证成功，新批次将默认使用 DSH。')).toHaveCount(0);
  await expect(page.locator('.reference-metrics').getByText('尚未启用')).toBeVisible();

  providerVerification = 'VERIFIED';
  const successfulVerificationPromise = page.waitForResponse((response) => (
    new URL(response.url()).pathname === '/api/v1/provider-settings/verify'
    && response.request().method() === 'POST'
  ));
  await page.getByRole('button', { name: '验证并启用' }).click();
  const successfulVerification = await successfulVerificationPromise;
  assert.equal(successfulVerification.status(), 200);
  const successfulPayload = await successfulVerification.json();
  assert.equal(successfulPayload.status, 'VERIFIED');
  assert.equal(successfulPayload.enabled, true);
  assert.deepEqual(successfulPayload.checks, { modelList: 'PASSED', generation: 'PASSED' });
  await expect(page.locator('.provider-checks')).toContainText('生成测试');
  await expect(page.locator('.provider-checks dd').last()).toHaveText('已通过');
  await expect(page.locator('#toast')).toHaveText('连接验证成功，新批次将默认使用 DSH。');
  await expect(page.locator('.settings-list')).toContainText('DeepSeek Harness');
  await expect(page.locator('.reference-metrics').getByText('新批次将使用此配置')).toBeVisible();

  const storedSettingsText = await (await fetch(`${baseUrl}/api/v1/provider-settings`)).text();
  assert.doesNotMatch(storedSettingsText, new RegExp(PROVIDER_SECRET));
  assert.equal(JSON.parse(storedSettingsText).apiKeyConfigured, true);
  expect(await page.evaluate(() => document.body.textContent)).not.toContain(PROVIDER_SECRET);
  expect(await page.evaluate(() => [...Object.values(localStorage), ...Object.values(sessionStorage)])).not.toContain(PROVIDER_SECRET);

  const runMetrics = page.locator('.metrics-card');
  const queueMetric = runMetrics.locator('.compact-metrics > div').filter({ hasText: '排队耗时 P50 / P95' });
  await expect(queueMetric).toContainText('350 毫秒 / 900 毫秒');
  await expect(queueMetric).toContainText('8 个样本');
  const providerCalls = runMetrics.locator('.compact-metrics > div').filter({ hasText: '服务提供方调用' });
  await expect(providerCalls).toContainText('12');
  await expect(providerCalls).toContainText('4 个样本');
  const retries = runMetrics.locator('.compact-metrics > div').filter({ hasText: '模型调用重试' });
  await expect(retries).toContainText('3');
  const workflowRetries = runMetrics.locator('.compact-metrics > div').filter({ hasText: '工作流节点重试' });
  await expect(workflowRetries).toContainText('2');
  const governance = page.locator('.governance-metrics');
  await expect(governance.locator('.compact-metrics > div').filter({ hasText: '首次修订通过率' })).toContainText('50%');
  await expect(governance.locator('.compact-metrics > div').filter({ hasText: '三轮内通过率' })).toContainText('75%');
  await expect(governance.locator('.compact-metrics > div').filter({ hasText: '人工介入比例' })).toContainText('25%');
  await expect(governance.locator('.compact-metrics > div').filter({ hasText: '短期复发率' })).toContainText('10%');
  await governance.getByText('查看指标口径').click();
  await expect(governance).toContainText('queueDurationMs');
  await expect(governance).toContainText('节点开始时间减去最近可执行时间');
  await expect(governance).toContainText('统计窗口内记录过人工治理动作的批次比例');

  const metricsRequest = page.waitForResponse((response) => response.url().includes('/api/v1/metrics/runs?window=24h'));
  await page.getByLabel('统计窗口').selectOption('24h');
  assert.equal((await metricsRequest).status(), 200);
  await expect(queueMetric).toContainText('8 个样本');
});

test('Knowledge Health 保持 0..100 总分与 0..1 比率的真实 API 口径', async ({ page }) => {
  const response = await fetch(`${baseUrl}/api/v1/knowledge/health`);
  assert.equal(response.status, 200);
  const health = await response.json();
  assert.equal(health.overall.unit, 'score-out-of-100');
  assert.equal(typeof health.overall.value, 'number');
  assert.ok(health.overall.value >= 0 && health.overall.value <= 100);
  for (const name of ['coverage', 'freshness', 'quality']) {
    const metric = health.metrics[name];
    assert.equal(metric.unit, 'ratio');
    assert.equal(typeof metric.value, 'number');
    assert.ok(metric.value >= 0 && metric.value <= 1);
    assert.ok(metric.numerator >= 0);
    assert.ok(metric.denominator > 0);
    assert.ok(metric.numerator <= metric.denominator);
  }

  await page.goto(baseUrl);
  const healthCard = page.locator('.knowledge-summary');
  await expect(healthCard.locator('strong')).toHaveText(new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(health.overall.value));
  await expect(healthCard.locator('small').filter({ hasText: '/ 100' })).toBeVisible();
  for (const [name, label] of [['coverage', '覆盖率'], ['freshness', '新鲜度'], ['quality', '质量']] as const) {
    const metric = health.metrics[name];
    const item = healthCard.locator('footer > span').filter({ hasText: label });
    const percent = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(metric.value * 100);
    await expect(item).toContainText(`${percent}%`);
    await expect(item).toContainText(`${metric.numerator}/${metric.denominator}`);
  }
});

test('Knowledge lineage/diff 可反向进入版本、批次与评测事实', async ({ page }) => {
  await page.goto(baseUrl);
  await navigateTo(page, '知识');
  await expect(page.locator(`#knowledge-list [data-version-id="${firstVersionId}"]`)).toHaveCount(0);
  await page.locator(`#knowledge-list [data-version-id="${latestVersionId}"]`).click();
  await page.getByText('历史版本 · 1', { exact: true }).click();
  await page.getByRole('dialog').locator(`[data-version-id="${firstVersionId}"]`).click();
  let drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('heading', { name: '浏览器验收知识' })).toBeVisible();
  await expect(drawer.getByRole('button', { name: /查看修订版本/ })).toBeVisible();
  await drawer.getByRole('button', { name: /查看修订版本/ }).click();
  await expect(page.locator('#drawer-title')).toHaveText('浏览器验收知识（修订）');

  drawer = page.getByRole('dialog');
  const diffResponsePromise = page.waitForResponse((response) => (
    new URL(response.url()).pathname === `/api/v1/knowledge/${latestVersionId}/diff`
  ));
  await drawer.getByRole('button', { name: '比较版本' }).click();
  const diffResponse = await diffResponsePromise;
  assert.equal(diffResponse.status(), 200);
  const diff = await diffResponse.json();
  assert.equal(diff.target.versionId, latestVersionId);
  assert.equal(diff.against.versionId, firstVersionId);
  assert.equal(diff.rangeValidation.validated, true);
  assert.ok(diff.changedSections.length > 0);
  assert.ok(diff.hunks.some((hunk: { oldCount: number; newCount: number; lines: Array<{ text: string }> }) => (
    hunk.oldCount >= 0 && hunk.newCount >= 0 && hunk.lines.some((line) => line.text.includes('反向导航验收'))
  )));
  await expect(drawer.getByText('变更范围符合修订约束')).toBeVisible();

  const runButton = drawer.getByRole('button', { name: new RegExp(`查看批次 ${lineageRunId.slice(0, 8)}`) });
  await expect(runButton).toBeVisible();
  await runButton.click();
  await expect(page.getByRole('heading', { name: '飞轮批次', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'browser-contract', level: 2 })).toBeVisible();

  await navigateTo(page, '知识');
  await page.locator(`#knowledge-list [data-version-id="${latestVersionId}"]`).click();
  drawer = page.getByRole('dialog');
  const evaluationButton = drawer.getByRole('button', { name: new RegExp(`查看评测 ${lineageEvaluationId.slice(0, 8)}`) });
  await expect(evaluationButton).toBeVisible();
  await evaluationButton.click();
  await expect(page.locator('#drawer-title')).toContainText(`评测 ${lineageEvaluationId.slice(0, 8)}`);
  await expect(page.getByRole('heading', { name: '不可变报告' })).toBeVisible();
});

test('Evaluation Rule 将 scope 作为对象提交并生成新修订', async ({ page }) => {
  await page.goto(baseUrl);
  await enterGovernance(page);
  await navigateTo(page, '评测');
  const rule = page.locator('.rule-card').first();
  await expect(rule).toBeVisible();
  const initialRevision = Number(await rule.getAttribute('data-revision'));
  assert.ok(initialRevision >= 1);
  assert.deepEqual(JSON.parse(await rule.getByLabel('适用范围').inputValue()), { kind: 'GLOBAL' });
  await rule.getByLabel('适用范围').fill('{"kind":"GLOBAL"}');

  page.on('dialog', (dialog) => {
    if (dialog.type() === 'prompt') return dialog.accept('E2E 验证 scope 对象');
    return dialog.accept();
  });
  const patchPromise = page.waitForResponse((response) => (
    new URL(response.url()).pathname.startsWith('/api/v1/evaluation-rules/')
    && response.request().method() === 'PATCH'
  ));
  await rule.getByRole('button', { name: '保存新修订' }).click();
  const patchResponse = await patchPromise;
  assert.equal(patchResponse.status(), 200);
  const requestBody = patchResponse.request().postDataJSON();
  assert.deepEqual(requestBody.scope, { kind: 'GLOBAL' });
  assert.equal(typeof requestBody.scope, 'object');
  await expect(page.locator('#toast')).toHaveText('评测规则的新修订已保存。');
  await expect(page.locator('.rule-card').first()).toHaveAttribute('data-revision', String(initialRevision + 1));
});

test('Sources 显式 scan，真实 create/refresh/PATCH，scan 失败只形成 Partial', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto(baseUrl);
  await enterGovernance(page);
  await navigateTo(page, '来源');
  await expect(page.getByText('尚未执行扫描')).toBeVisible();
  expect(requests.some((url) => url.endsWith('/api/v1/sources/scan'))).toBe(false);

  const scanPromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/sources/scan');
  await page.getByRole('button', { name: '扫描候选' }).click();
  const scanResponse = await scanPromise;
  assert.equal(scanResponse.status(), 200);
  const scan = await scanResponse.json();
  assert.ok(scan.candidates.some((candidate: { path: string }) => candidate.path === SOURCE_LOCATOR));
  await expect(page.getByText(SOURCE_LOCATOR).first()).toBeVisible();

  const createForm = page.locator('#source-create-form');
  await createForm.getByLabel('来源类型').selectOption('FILE');
  await createForm.getByLabel('路径或地址').fill('outside-acquisition-root.md');
  await createForm.getByLabel('项目').fill('console-e2e');
  const deniedCreatePromise = page.waitForResponse((response) => (
    new URL(response.url()).pathname === '/api/v1/sources' && response.request().method() === 'POST'
  ));
  await createForm.getByRole('button', { name: '登记来源' }).click();
  const deniedCreate = await deniedCreatePromise;
  assert.equal(deniedCreate.status(), 403);
  assert.equal((await deniedCreate.json()).error.code, 'SOURCE_ACCESS_DENIED');
  await expect(page.locator('#toast')).toHaveText('来源不在允许的访问范围内。');
  await expect(page.getByText('来源已登记，固定修订由服务端记录。')).toHaveCount(0);

  await createForm.getByLabel('路径或地址').fill(SOURCE_LOCATOR);
  await createForm.getByLabel('显示名称').fill('控制台来源');
  const createPromise = page.waitForResponse((response) => (
    new URL(response.url()).pathname === '/api/v1/sources' && response.request().method() === 'POST'
  ));
  await createForm.getByRole('button', { name: '登记来源' }).click();
  const createResponse = await createPromise;
  assert.equal(createResponse.status(), 201);
  const created = await createResponse.json();
  const sourceId = created.source.sourceId;
  await expect(page.locator('#toast')).toHaveText('来源已登记，固定修订由服务端记录。');
  await expect(page.locator('.source-card').filter({ hasText: '控制台来源' })).toContainText('正常');

  writeFileSync(join(repositoryDir, SOURCE_LOCATOR), `${GOOD_BODY}\n\n来源内容已在 E2E 中发生漂移。\n`);
  const refreshPromise = page.waitForResponse((response) => (
    new URL(response.url()).pathname === `/api/v1/sources/${sourceId}/refresh`
  ));
  await page.locator(`[data-refresh-source="${sourceId}"]`).click();
  const refreshResponse = await refreshPromise;
  assert.equal(refreshResponse.status(), 202);
  await expect(page.locator('#toast')).toHaveText('来源刷新已完成并记录。');
  const staleCard = page.locator('.source-card').filter({ hasText: '控制台来源' });
  await expect(staleCard).toContainText('已过期');
  await expect(staleCard).toContainText('检测到漂移');

  await page.reload();
  await enterGovernance(page);
  const actionItems = await (await fetch(`${baseUrl}/api/v1/action-items`)).json();
  const sourceActionItem = actionItems.items.find((item: {
    type: string;
    subject?: { kind?: string; id?: string };
  }) => item.type === 'SOURCE_DRIFT' && item.subject?.kind === 'SOURCE' && item.subject.id === sourceId);
  assert.ok(sourceActionItem);
  const sourceActionLink = page.locator(`[data-action-source-id="${sourceId}"]`);
  const sourceAction = sourceActionLink.locator('..');
  await expect(sourceAction).toContainText('来源');
  await expect(sourceAction).toContainText('来源修订漂移');
  await expect(sourceActionLink).toBeVisible();
  const sourceDetailPromise = page.waitForResponse((response) => (
    new URL(response.url()).pathname === `/api/v1/sources/${sourceId}`
    && response.request().method() === 'GET'
  ));
  await sourceActionLink.click();
  assert.equal((await sourceDetailPromise).status(), 200);
  await expect(page.getByRole('heading', { name: '来源', level: 1 })).toBeVisible();
  const sourceDrawer = page.getByRole('dialog');
  await expect(sourceDrawer).toContainText(sourceId);
  await expect(sourceDrawer).toContainText('检测到漂移');
  await expect(sourceDrawer.getByLabel('确认修订')).not.toHaveValue('');
  await sourceDrawer.getByLabel('材料适用条件').fill('仅用于控制台示例来源');
  await sourceDrawer.getByRole('button', { name: '捕获材料快照' }).click();
  await expect(sourceDrawer.locator('[data-material-result]')).toContainText('确认修订');
  await sourceDrawer.getByLabel('显示名称').fill('控制台来源（已确认）');
  page.once('dialog', (dialog) => dialog.accept('确认来源新修订'));
  const updatePromise = page.waitForResponse((response) => (
    new URL(response.url()).pathname === `/api/v1/sources/${sourceId}`
    && response.request().method() === 'PATCH'
  ));
  await sourceDrawer.getByRole('button', { name: '保存新修订' }).click();
  const updateResponse = await updatePromise;
  assert.equal(updateResponse.status(), 200);
  await expect(page.locator('#toast')).toHaveText('来源配置的新修订已保存。');
  await expect(page.locator('.source-card').filter({ hasText: '控制台来源（已确认）' })).toContainText('正常');
  await page.locator(`[data-source-id="${sourceId}"]`).first().click();
  await sourceDrawer.getByLabel('材料适用条件').fill('仅用于控制台示例来源');
  await sourceDrawer.getByRole('button', { name: '捕获材料快照' }).click();
  await expect(sourceDrawer.locator('[data-material-result]')).toContainText('材料已捕获');
  await sourceDrawer.getByText('查看固定正文与标识', { exact: true }).click();
  await expect(sourceDrawer.locator('[data-material-result]')).toContainText('来源内容已在 E2E 中发生漂移');
  await page.screenshot({ path: test.info().outputPath('material-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(sourceDrawer.getByRole('button', { name: '捕获材料快照' })).toBeVisible();
  expect(await sourceDrawer.locator('[data-material-result]').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('material-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1363, height: 936 });
  await page.keyboard.press('Escape');


  await page.route('**/api/v1/sources/scan', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'SOURCE_SCAN_UNAVAILABLE', message: 'internal detail', requestId: 'e2e', retryable: true, details: {} } }),
  }));
  await page.getByRole('button', { name: /^(?:扫描候选|重新扫描)$/ }).click();
  await expect(page.getByText('来源候选扫描失败；已登记的来源事实仍可查看和管理。')).toBeVisible();
  await expect(page.locator('.source-card').getByText('控制台来源（已确认）', { exact: true })).toBeVisible();
  await expect(page.getByText('internal detail')).toHaveCount(0);
});

test('light and dark themes keep successful API states across all seven pages and drawers', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(baseUrl);
  const themeBackgrounds = new Map<'light' | 'dark', string>();
  const forbiddenDarkSurfaces = new Set([
    'rgb(16, 43, 37)', 'rgb(43, 37, 24)', 'rgb(36, 29, 52)',
    'rgb(46, 25, 32)', 'rgb(28, 34, 43)', 'rgb(16, 38, 51)',
    'rgb(36, 32, 54)', 'rgb(23, 48, 41)', 'rgb(8, 12, 17)',
  ]);
  const assertNoDarkSurfaces = async (pageName: string) => {
    const offenders = await page.locator('body *').evaluateAll((elements, forbidden) => elements
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 8 && rect.height > 8 && getComputedStyle(element).visibility !== 'hidden';
      })
      .map((element) => ({ element, background: getComputedStyle(element).backgroundColor }))
      .filter(({ background }) => forbidden.includes(background))
      .map(({ element, background }) => `${element.tagName}.${element.className}: ${background}`), [...forbiddenDarkSurfaces]);
    expect(offenders, `${pageName} contains dark-only surfaces in light theme`).toEqual([]);
  };

  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((nextTheme) => localStorage.setItem('wp-knowledge-theme', nextTheme), theme);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const background = await page.locator('body').evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(background).not.toBe('rgba(0, 0, 0, 0)');
    themeBackgrounds.set(theme, background);
    await expect(page.locator('#registry-label')).toHaveText('服务已连接');
    for (const label of ['操作中心', '飞轮批次', '知识', '工作流图', '评测', '来源', 'Agent 设置']) {
      if (label !== '操作中心') await page.getByRole('button', { name: new RegExp(`^${label}$`) }).click();
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('.error-state')).toHaveCount(0);
      await expect(page.locator('.partial-notice')).toHaveCount(0);
      if (theme === 'light') await assertNoDarkSurfaces(label);
    }
  }
  expect(themeBackgrounds.get('light')).not.toBe(themeBackgrounds.get('dark'));
  await page.evaluate(() => localStorage.setItem('wp-knowledge-theme', 'light'));
  await page.reload();
  await page.getByRole('button', { name: /^知识$/ }).click();
  await page.getByRole('combobox', { name: '知识状态' }).selectOption('');
  await page.getByRole('button', { name: /浏览器验收知识/ }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await assertNoDarkSurfaces('Knowledge drawer');
});

test('Action Center preserves readable hierarchy and factual progress at 1363 by 936', async ({ page }) => {
  await page.setViewportSize({ width: 1363, height: 936 });
  await page.addInitScript(() => localStorage.setItem('wp-knowledge-theme', 'light'));
  await page.goto(baseUrl);
  await expect(page.getByRole('heading', { name: '操作中心', level: 1 })).toBeVisible();
  await expect(page.getByText('知识健康度')).toBeVisible();
  await expect(page.getByText('最近动态')).toBeVisible();
  await expect(page.locator('.latest-result')).toContainText('已记录进度');
  await expect(page.locator('.latest-result strong')).not.toBeEmpty();
  await expect(page.locator('.current-run-card .run-state-line')).toHaveCount(0);


  const geometry = await page.evaluate(() => {
    const topbar = document.querySelector('.topbar')!.getBoundingClientRect();
    const title = document.querySelector('#page-title')!.getBoundingClientRect();
    const actions = document.querySelector('.topbar-actions')!.getBoundingClientRect();
    return {
      bodyFontSize: getComputedStyle(document.body).fontSize,
      bodyFontFamily: getComputedStyle(document.body).fontFamily,
      titleFontFamily: getComputedStyle(document.querySelector('#page-title')!).fontFamily,
      actionFontFamily: getComputedStyle(document.querySelector('.topbar-actions button')!).fontFamily,
      topbar: { top: topbar.top, height: topbar.height, center: topbar.top + topbar.height / 2 },
      title: { top: title.top, center: title.top + title.height / 2 },
      actions: { top: actions.top, center: actions.top + actions.height / 2 },
    };
  });
  expect(geometry.bodyFontSize).toBe('14px');
  for (const family of [geometry.bodyFontFamily, geometry.titleFontFamily, geometry.actionFontFamily]) {
    expect(family).toContain('Microsoft YaHei');
    expect(family).not.toMatch(/SimSun|宋体/);
  }
  expect(geometry.topbar.height).toBe(88);
  expect(Math.abs(geometry.actions.center - geometry.topbar.center)).toBeLessThan(2);
  expect(geometry.title.top).toBeGreaterThanOrEqual(32);
  expect(geometry.title.top).toBeLessThanOrEqual(34);
  expect(geometry.actions.top).toBeGreaterThan(20);

  await expect(page).toHaveScreenshot('ActionCenter1363x936LightLinux.png', {
    animations: 'disabled',
    caret: 'hide',
    mask: [page.locator('time'), page.locator('#runtime-footer')],
    maskColor: '#dfe3e5',
    maxDiffPixelRatio: 0.01,
  });
});

test('mobile navigation, theme persistence and 200 percent zoom preserve core paths', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl);
  const navToggle = page.getByRole('button', { name: '打开主导航' });
  await navToggle.click();
  await expect(page.getByRole('button', { name: /^飞轮批次$/ })).toBeVisible();
  await page.getByRole('button', { name: /^飞轮批次$/ }).click();
  await expect(page.getByRole('heading', { name: '飞轮批次', level: 1 })).toBeVisible();
  await expect(page.getByText('第 1 轮').first()).toBeVisible();

  const themeButton = page.locator('#theme-button');
  await themeButton.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => localStorage.getItem('wp-knowledge-theme'))).toBe('light');
  expect(await page.evaluate(() => [...Object.keys(localStorage)].some((key) => /token/i.test(key)))).toBe(false);

  await page.setViewportSize({ width: 640, height: 450 });
  const session = await context.newCDPSession(page);
  await session.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  await page.getByRole('button', { name: '打开主导航' }).click();
  await page.getByRole('button', { name: /^飞轮批次$/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '飞轮批次', level: 1 })).toBeVisible();
  await expect(page.getByText('browser-contract').first()).toBeVisible();
});


test('通用场景 API 保留路径校验；浏览器固定模块入口不要求场景 JSON', async ({ page }) => {
  const originalStart = instance.composition.apps.orchestrator.start;
  const starts: unknown[] = [];
  instance.composition.apps.orchestrator.start = async (scenario) => {
    starts.push(scenario);
    return { runId: lineageRunId, executionStatus: 'RUNNING' };
  };
  try {
    await page.goto(baseUrl);
    await enterGovernance(page);
    await navigateTo(page, '飞轮批次');
    await expect(page.getByLabel('项目场景 JSON')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '启动知识飞轮' })).toBeVisible();
    const scenario = { ...GENERIC_SCENARIO, moduleId: 'browser-module', repositoryRoot: repositoryDir };
    const headers = { authorization: 'Bearer ui-e2e-token', 'Idempotency-Key': 'legacy-invalid-scenario' };
    const denied = await page.request.post(`${baseUrl}/api/v1/runs`, {
      headers, data: { repositoryRoot: repositoryDir, scenario: { ...scenario, sourcePaths: ['../private'] } },
    });
    expect(denied.status()).toBe(422);
    expect(starts).toHaveLength(0);
    const accepted = await page.request.post(`${baseUrl}/api/v1/runs`, {
      headers: { ...headers, 'Idempotency-Key': 'legacy-valid-scenario' },
      data: { repositoryRoot: repositoryDir, scenario },
    });
    expect(accepted.status()).toBe(202);
    expect(starts).toEqual([scenario]);
  } finally { instance.composition.apps.orchestrator.start = originalStart; }
});


test('evaluation explains knowledge risk separately from code check failure', async ({ page }) => {
  await page.route(`**/api/v1/evaluations/${lineageEvaluationId}`, async route => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.decision = { ...(detail.decision ?? {}), outcome: 'STOPPED', reasonCodes: ['KNOWLEDGE_RISK_UNRESOLVED'] };
    await route.fulfill({ response, json: detail });
  });
  await page.goto(baseUrl);
  await navigateTo(page, '知识');
  await page.locator(`#knowledge-list [data-version-id="${latestVersionId}"]`).click();
  await page.getByRole('dialog').getByRole('button', { name: new RegExp(`查看评测 ${lineageEvaluationId.slice(0, 8)}`) }).click();
  await expect(page.getByRole('dialog').getByText('知识风险尚未解决', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog').getByText('代码检查存在阻塞', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('knowledge-risk.png'), fullPage: true });
});


test('知识阅读器提供正文目录、可展开证据和原文，窄屏不溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl);
  await page.getByRole('button', { name: '打开主导航' }).click();
  await page.getByRole('button', { name: '知识', exact: true }).click();
  const card = page.locator(`[data-version-id="${latestVersionId}"]`).first();
  await card.click();
  await expect(page.locator('.knowledge-body h3').filter({hasText:'修订说明'})).toBeVisible();
  await expect(page.locator('.reader-evidence')).not.toHaveAttribute('open', '');
  await page.locator('.reader-toc summary').click();
  await page.locator('.reader-toc a').filter({hasText:'修订说明'}).click();
  await expect(page.locator('.knowledge-body h3').filter({hasText:'修订说明'})).toBeFocused();
  await page.locator('.reader-source summary').click();
  await expect(page.locator('.reader-source pre')).toHaveText(REVISED_BODY);
  await page.locator('.reader-evidence summary').click();
  await expect(page.locator('.reader-evidence')).toContainText(HEALTH_SOURCE_LOCATOR);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(card).toBeFocused();
});

test('操作中心分类筛选真实事项并允许恢复全部', async ({ page }) => {
  await page.goto(baseUrl);
  const all = page.locator('[data-queue-filter=""]');
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  const count = await page.locator('.attention-row').count();
  const source = page.locator('[data-queue-filter="SOURCE"]');
  await source.click();
  await expect(source).toHaveAttribute('aria-pressed', 'true');
  const sourceCount = Number((await source.innerText()).match(/\d+$/)?.[0]);
  await expect(page.locator('.attention-row')).toHaveCount(sourceCount);
  await expect(page.locator('.attention-subject[data-action-source-id]')).toHaveCount(sourceCount);
  await page.locator('[data-queue-filter="LOW_CONFIDENCE"]').click();
  await expect(page.locator('.queue-partial-state')).toContainText('该分类暂无待处理事项');
  await all.click();
  await expect(page.locator('.attention-row')).toHaveCount(count);
  await expect(all).toBeFocused();
});

test('workflow uses executionStatus and reports missing execution facts as unknown', async ({ page }) => {
  await page.route('**/workflow-status', (route) => route.fulfill({ json: { executionStatus: 'COMPLETED' } }));
  await page.goto(baseUrl);
  await navigateTo(page, '工作流图');
  await expect(page.locator('.reference-node-detail')).toContainText('工作流 已完成');
  await page.route('**/workflow-status', (route) => route.fulfill({ status: 503, json: {} }));
  await page.reload();
  await navigateTo(page, '工作流图');
  await expect(page.locator('.reference-node-detail')).toContainText('工作流 未知');
});

test('anonymous direct editing can download evidence without a Bearer token', async ({ page }) => {
  await page.route('**/api/v1/system/capabilities', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({ json: { ...data, directEditing: true, authentication: 'none' } });
  });
  const path = `/api/v1/evaluations/${lineageEvaluationId}/artifacts/anonymous-evidence`;
  await page.route(`**/api/v1/evaluations/${lineageEvaluationId}/artifacts`, (route) => route.fulfill({
    json: { items: [{ relation: 'EVIDENCE', artifactId: 'anonymous-evidence', downloadUrl: path }] },
  }));
  let requested = false;
  await page.route(`**${path}`, (route) => {
    expect(route.request().headers().authorization).toBeUndefined();
    requested = true;
    return route.fulfill({ contentType: 'text/plain', body: 'verified download bytes' });
  });
  await page.goto(baseUrl);
  await navigateTo(page, '评测');
  await page.locator(`[data-evaluation-id="${lineageEvaluationId}"]`).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载', exact: true }).click();
  await downloaded;
  expect(requested).toBe(true);
});

test('知识索引可独立构建、试检索并预览 YAML，命中后才读取正文', async ({ page }) => {
  const bodies: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (/^\/api\/v1\/knowledge\/[^/]+$/.test(path) && !path.endsWith('/health')) bodies.push(path);
  });
  await page.goto(baseUrl);
  await enterGovernance(page);
  await navigateTo(page, '知识');
  await page.getByText('知识索引与试检索', { exact: true }).click();
  await page.getByRole('button', { name: '更新索引', exact: true }).click();
  await expect(page.locator('[data-index-task]')).toContainText('已完成');
  await expect(page.locator('[data-index-task]')).toContainText('失败 0');
  bodies.length = 0;
  await page.getByLabel('试检索', { exact: true }).fill('浏览器验收');
  await page.getByRole('button', { name: '检索索引', exact: true }).click();
  const hit = page.locator('.index-hits li').filter({ has: page.locator(`[data-version-id="${latestVersionId}"]`) });
  await expect(hit).toBeVisible();
  await expect(hit).toContainText('命中');
  await hit.getByRole('button', { name: '预览 YAML' }).click();
  await expect(page.locator('[data-index-preview] pre')).toContainText('cardId:');
  await expect(page.locator('[data-index-preview] pre')).toContainText(latestVersionId);
  expect(bodies).toHaveLength(0);
  await page.screenshot({ path: test.info().outputPath('index-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: '更新索引', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('index-mobile.png'), fullPage: true });
  await hit.locator(`[data-version-id="${latestVersionId}"]`).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(bodies).toEqual([`/api/v1/knowledge/${latestVersionId}`]);
});


test('操作中心从固定 Git 版本分析仓库，显示模块和环境且窄屏可操作', async ({ page }) => {
  const directory = mkdtempSync(join(tmpdir(), 'console-analysis-'));
  const originalModel = instance.composition.apps.workbenchGeneration.dependencies.model;
  const originalNative = instance.composition.apps.workbenchGeneration.dependencies.native;
  const reconstruction = instance.composition.apps.workbenchReconstruction.dependencies;
  const originalReconstruction = { model: reconstruction.roles.dependencies.model, snapshot: reconstruction.snapshot, native: reconstruction.native };
  const nativeEvaluation = instance.composition.apps.nativeEvaluation.dependencies;
  const originalEvaluation = { snapshot: nativeEvaluation.snapshot, runner: nativeEvaluation.runner, native: instance.composition.apps.workbenchEvaluation.dependencies.native };
  const git = (args: string[]) => execFileSync('git', ['-c', 'user.name=Browser Test', '-c', 'user.email=browser@example.test', ...args], {
    cwd: directory, encoding: 'utf8', env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
  }).trim();
  try {
    git(['init', '-q']); writeFileSync(join(directory, 'parser.c'), 'int parse(void) { return 1; }');
    writeFileSync(join(directory, 'compile_commands.json'), JSON.stringify([{ directory, file: 'parser.c', arguments: ['gcc', '-std=c99', '-DFEATURE=1', '-c', 'parser.c'] }, { directory, file: 'parser.c', arguments: ['gcc', '-pthread', '-c', 'parser.c'] }]));
    git(['add', '.']); git(['commit', '-qm', 'Fixed source']); const commit = git(['rev-parse', 'HEAD']);
    await page.goto(baseUrl); await enterGovernance(page);
    await page.getByLabel('服务器仓库目录', { exact: true }).fill(directory);
    await page.getByLabel('源码版本', { exact: true }).fill(commit);
    await page.getByRole('button', { name: '分析仓库', exact: true }).click();
    await expect(page.locator('[data-repository-result]')).toContainText(commit);
    await expect(page.locator('[data-repository-result]')).toContainText('parser');
    await expect(page.locator('[data-repository-result]')).toContainText('gcc');
    await expect(page.getByRole('heading', { name: '模块候选' })).toBeVisible();
    await page.locator('[data-build-candidates] > summary').click();
    await expect(page.locator('[data-build-candidates]')).toContainText('参数尚未支持：-pthread');
    await expect(page.locator('[data-build-candidate="1"]')).toBeDisabled();
    await page.locator('[data-build-candidate="0"]').click();
    await expect(page.getByRole('combobox', { name: 'C 标准', exact: true })).toHaveValue('c99');
    await expect(page.getByLabel('预处理定义（每行一个）', { exact: true })).toHaveValue('FEATURE=1');
    await page.getByRole('combobox', { name: 'C 标准', exact: true }).selectOption('c17');
    const savedResponse = page.waitForResponse((response) => response.url().endsWith('/api/v1/projects') && response.request().method() === 'POST');
    await page.getByRole('button', { name: '保存项目输入', exact: true }).click();
    await expect(page.locator('[data-project-summary]')).toContainText('已保存 1 个模块');
    const saved = await (await savedResponse).json();
    expect(saved.commit).toBe(commit); expect(saved.build.cStandard).toBe('c17'); expect(saved.build.definitions).toEqual(['FEATURE=1']);
    // UI测试固定接口投影；真实编译、资源预检查及角色恢复由integration串行覆盖。
    instance.composition.apps.workbenchGeneration.dependencies.native = { ...originalNative,
      compileAndRun: (...args) => originalNative.compileAndRun(...args), publicInterface: async () => ({
        schemaVersion: 'native-interface-v1', language: 'c', sourcePath: 'parser.c', astFilter: null,
        declarations: [{ kind: 'FunctionDecl', name: 'parse', type: 'int (void)', parameters: [] }],
      }),
    };
    instance.composition.apps.workbenchGeneration.dependencies.model = () => ({ assertOutput: assertModelOutput, execute: async (request) => {
      const title = 'Parser generated card'; const description = 'The fixed parser interface.';
      return request.stage?.startsWith('outline') ? { title, description, sections: [{ heading: 'Behavior', purpose: 'Interface and limits' }] }
        : { title, description, sections: [{ sectionId: 'section-1', body: 'The parse function takes no arguments and returns the integer one. Its public interface is int parse(void). The fixed source contains no external dependencies or mutable state. This card describes only the provided function and does not establish behavior for any other parser. Behavioral evaluation and publication approval remain pending.' }] };
    } });
    await page.getByRole('button', { name: '生成知识库', exact: true }).click();
    await expect(page.locator('[data-generation-task]')).toContainText('已生成 1 张');
    await expect(page.locator('[data-generation-task]')).toContainText('已完成');
    await expect(page.locator('[data-generation-task]').getByRole('button', { name: 'Parser generated card', exact: true })).toBeVisible();
    reconstruction.snapshot = async (language, build) => ({ schemaVersion: 'native-toolchain-v1', language, build, architecture: 'test', files: [], digest: 'a'.repeat(64) });
    reconstruction.native = instance.composition.apps.workbenchGeneration.dependencies.native;
    let docGenAttempts = 0, sourceCorrection = false;
    reconstruction.roles.dependencies.model = (command) => ({ assertOutput: assertModelOutput, execute: async (request) => {
      expect(request.readablePaths).toEqual([]);
      if (['code', 'test-gen'].includes(request.role)) expect(request.prompt).not.toContain('return 1;');
      else expect(request.prompt).toContain('return 1;');
      if (request.role === 'review') {
        const criteria = JSON.parse(Buffer.from(await instance.composition.artifacts.get(command.payload.criteriaRef as any)).toString('utf8'));
        if (criteria.phase === 'FINAL_SOURCE_REVIEW' && criteria.section !== 'Behavior') return { blocking: false, recommendation: 'PASS', correction: null, unresolvedRisks: [] };
        if (criteria.phase === 'FINAL_SOURCE_REVIEW') return sourceCorrection
          ? { blocking: true, recommendation: 'ITERATE', correction: { correctionId: 'COR-0001', knowledgePath: `knowledge/${criteria.binding.moduleId}.md#Behavior`, criterion: 'Clarify the pinned return value for this source review.', risk: 'Ambiguous boundary.' }, unresolvedRisks: [] }
          : { blocking: true, recommendation: 'ITERATE', correction: null, unresolvedRisks: ['Whole-card source evidence needs clarification.'] };
        if (criteria.phase === 'REVISION_SOURCE_REVIEW') { expect(request.prompt).toContain('exactly 1, not 0'); return { blocking: false, recommendation: 'PASS', correction: null, unresolvedRisks: [] }; }
        const card = instance.composition.repository.getKnowledgeVersion(criteria.candidate.versionId)!;
        return { blocking: true, recommendation: 'ITERATE', correction: { correctionId: 'COR-0001', knowledgePath: `knowledge/${card.moduleId}.md#Behavior`, criterion: 'Clarify the fixed integer return value.', risk: 'Unclear reconstruction guidance' }, unresolvedRisks: [] };
      }
      if (request.role === 'doc-gen' && ++docGenAttempts === 1) return { title: 'Parser generated card', description: 'The fixed parser interface.', sections: [{ sectionId: 'section-1', body: '## Invalid nested title' }] };
      if (request.role === 'doc-gen') return { title: 'Parser generated card', description: 'The fixed parser interface.', sections: [{ sectionId: 'section-1', body: 'The parse function takes no arguments and always returns the integer one. Its public interface is int parse(void). The return value is exactly 1, not 0. The fixed source has no external dependencies or mutable state. This describes only the provided function; unsupported inputs and unrelated parsers are outside the scope. Behavioral verification of reconstructed code is still required.\n\nThis boundary matters because a generated implementation may compile with the correct signature while returning a different value. Callers should compare the returned integer with one; the presence of a callable function alone is insufficient. No allocation, callback, error code, or global configuration is part of this interface. These statements apply to the pinned source version and do not describe a general JSON parser.' + (sourceCorrection ? '\n\nThe pinned return value remains one for every invocation of this exact no-argument function.' : '') }] };
      if (request.role === 'test-gen') {
        const ref = command.payload.testPolicyRef as Parameters<typeof instance.composition.artifacts.get>[0];
        const policy = JSON.parse(Buffer.from(await instance.composition.artifacts.get(ref)).toString('utf8'));
        return { oracleRequired: true, nativeSuite: { schemaVersion: 'native-cases-v1', cases: [{ caseId: 'parseResult', description: '固定解析结果',
          sections: [policy.knowledge[0].sections[0]], variables: [], calls: [{ function: 'parse', arguments: [], result: 'result' }],
          observations: [{ name: 'result', kind: 'integer', read: { variable: 'result' } }], expected: { result: '1' } }] } };
      }
      return { files: [{ path: 'parser.c', content: '/* generated marker */ int parse(void) { return 1; }' }] };
    } });
    nativeEvaluation.snapshot = reconstruction.snapshot;
    const commandReport = { exitCode: 0, timedOut: false, outputLimitExceeded: false, durationMs: 1, stdout: '', stderr: '' };
    instance.composition.apps.workbenchEvaluation.dependencies.native = { ...reconstruction.native,
      compileAndRun: async () => ({ build: commandReport, execution: commandReport }) };
    nativeEvaluation.runner = { execute: async (input, _contract, sample) => {
      const generated = input.files.some((file) => file.content.includes('generated marker'));
      return { caseId: sample.caseId, status: generated ? 'FAILED' : 'PASSED', reasonCode: generated ? 'NATIVE_BEHAVIOR_MISMATCH' : null,
        actual: { result: generated ? '0' : '1' }, mismatches: generated ? ['result'] : [], report: { build: commandReport, execution: { ...commandReport, stderr: generated ? '<script>diagnosticText()</script>' : '' } } };
    } };
    await page.getByRole('button', { name: '执行代码重建', exact: true }).click();
    await expect(page.locator('[data-reconstruction-panel]')).toContainText('重建及接口检查完成');
    await expect(page.locator('[data-reconstruction-panel]')).toContainText('公开接口匹配');
    const comparison = page.locator('[data-reconstruction-panel] .source-comparison');
    await expect(comparison).toContainText('定位 1/1 个公开函数');
    await comparison.locator(':scope > summary').click();
    await expect(comparison).toContainText('规范化代码一致');
    await expect(comparison).toContainText('代码差异不等于知识错误');
    await comparison.locator(':scope > summary').click();
    await expect(page.locator('[data-reconstruction-panel]')).toContainText('重建结果不代表行为验证或发布');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '下载生成代码', exact: true }).click();
    expect((await download).suggestedFilename()).toBe('stage-evidence.json');
    const fixedPanel = page.locator('[data-fixed-evaluation-panel]');
    await fixedPanel.locator(':scope > details > summary').click();
    await fixedPanel.locator('input[type=file]').setInputFiles({ name: 'FixedCases.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ schemaVersion: 'native-cases-v1', cases: [{
      caseId: 'fixedParse', description: '固定解析结果', sections: ['fixed-interface#parse'], variables: [], calls: [{ function: 'parse', arguments: [], result: 'result' }],
      observations: [{ name: 'result', kind: 'integer', read: { variable: 'result' } }], expected: { result: '1' },
    }] })) });
    await fixedPanel.getByRole('button', { name: '执行固定评测', exact: true }).click();
    await expect(fixedPanel).toContainText('生成代码存在固定用例失败');
    await fixedPanel.getByText('fixedParse · 生成失败', { exact: true }).click();
    await expect(fixedPanel.locator('table tbody')).toContainText('result110');
    await expect(fixedPanel.locator('script')).toHaveCount(0);
    const fixedDownload = page.waitForEvent('download');
    await fixedPanel.getByRole('button', { name: '下载固定评测报告', exact: true }).click();
    expect((await fixedDownload).suggestedFilename()).toBe('stage-evidence.json');
    const fixedViewport = page.viewportSize()!;
    await page.screenshot({ path: test.info().outputPath('fixed-evaluation-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await fixedPanel.getByRole('button', { name: '下载固定评测报告', exact: true }).scrollIntoViewIfNeeded();
    await expect(fixedPanel.getByRole('button', { name: '下载固定评测报告', exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('fixed-evaluation-mobile.png'), fullPage: true });
    await page.setViewportSize(fixedViewport);
    await fixedPanel.locator(':scope > details > summary').click();
    await page.getByRole('button', { name: '执行评测', exact: true }).click();
    await expect(page.locator('[data-native-evaluation-panel]')).toContainText('可信用例存在失败');
    await expect(page.locator('[data-native-evaluation-panel]')).toContainText('通过 0/1');
    await page.getByText('parseResult · 固定解析结果', { exact: false }).click();
    await expect(page.locator('[data-native-evaluation-panel] table')).toContainText('预期');
    await expect(page.locator('[data-native-evaluation-panel] table')).toContainText('实际');
    await expect(page.locator('[data-native-evaluation-panel] table tbody')).toContainText('result10');
    await page.getByText('编译或运行诊断（完整内容见下载报告）', { exact: true }).click();
    await expect(page.locator('[data-native-evaluation-panel] pre').filter({ hasText: '<script>diagnosticText()</script>' })).toBeVisible();
    await expect(page.locator('[data-native-evaluation-panel] script')).toHaveCount(0);
    await expect(page.locator('[data-native-evaluation-panel] [data-version-id]')).toBeVisible();
    await page.getByRole('button', { name: '查看修订依据', exact: true }).click();
    await expect(page.locator('.revision-evidence')).toContainText('失败本身不能证明知识错误');
    await expect(page.locator('.revision-evidence')).toContainText('parseResult');

    await page.getByRole('button', { name: '复核全部卡片来源', exact: true }).click();
    await expect(page.locator('[data-source-verification-panel]')).toContainText('仍有未解决问题');
    await expect(page.locator('[data-source-verification-panel]')).toContainText('单次来源复核上限 600 秒');
    await expect(page.locator('[data-source-verification-panel]')).toContainText('Whole-card source evidence needs clarification.');
    const sourceDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: '下载来源意见', exact: true }).click();
    expect((await sourceDownload).suggestedFilename()).toBe('stage-evidence.json');
    await page.screenshot({ path: test.info().outputPath('repository-analysis-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: '分析仓库', exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('repository-analysis-mobile.png'), fullPage: true });
    await page.locator('[data-workbench-pipeline-panel]').getByText('一键流程的固定用例', { exact: true }).click();
    await page.locator('[data-pipeline-fixed="parser"]').setInputFiles({ name: 'PipelineFixed.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ schemaVersion: 'native-cases-v1', cases: [{
      caseId: 'fixedParse', description: '固定解析结果', sections: ['fixed-interface#parse'], variables: [], calls: [{ function: 'parse', arguments: [], result: 'result' }],
      observations: [{ name: 'result', kind: 'integer', read: { variable: 'result' } }], expected: { result: '1' },
    }] })) });
    await expect(page.locator('[data-workbench-pipeline-panel]')).toContainText('PipelineFixed.json');
    await page.getByRole('button', { name: '一键执行全部', exact: true }).click();
    await expect(page.locator('[data-workbench-pipeline-panel]')).toContainText('可信行为测试未通过');
    await expect(page.locator('[data-workbench-pipeline-panel]')).toContainText('知识关联 · 尚未启动');
    await expect(page.getByRole('button', { name: '恢复全部', exact: true })).toBeVisible();
    const pipelineRecords = instance.composition.apps.workbenchPipelines.dependencies.store.list();
    expect(pipelineRecords).toHaveLength(1);
    expect(pipelineRecords[0]?.fixedSuites?.map(item => item.moduleId)).toEqual(['parser']);
    await expect(page.locator('[data-workbench-pipeline-panel]').getByRole('button', { name: 'Parser generated card', exact: true })).toBeVisible();
    expect(pipelineRecords[0]?.completed).toEqual(['GENERATE', 'INDEX', 'FLYWHEEL']);
    expect(instance.composition.apps.workbenchPipelines.detail(pipelineRecords[0]!.pipelineId).publicationVerified).toBe(false);
    await page.screenshot({ path: test.info().outputPath('pipeline-mobile.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.reload(); await enterGovernance(page);
    await expect(page.locator('[data-generation-task]')).toContainText('已生成 1 张');
    await expect(page.locator('[data-generation-task]').getByRole('button', { name: 'Parser generated card', exact: true })).toBeVisible();
    await expect(page.locator('[data-reconstruction-panel]')).toContainText('重建及接口检查完成');
    await expect(page.locator('[data-native-evaluation-panel]')).toContainText('可信用例存在失败');
    await expect(page.locator('[data-workbench-pipeline-panel]')).toContainText('可信行为测试未通过');
    await page.getByLabel('服务器仓库目录', { exact: true }).fill(directory);
    await page.getByLabel('源码版本', { exact: true }).fill('missing-commit-for-analysis');
    await page.getByRole('button', { name: '分析仓库', exact: true }).click();
    await expect(page.locator('[data-repository-notice]')).toContainText('无法读取这个源码版本');
    await expect(page.locator('[data-repository-result]')).not.toContainText(commit);
    await page.locator('[data-workbench-pipeline-panel] details').filter({ has: page.locator('[data-pipeline-round="1"]') }).locator('summary').click();
    await page.getByRole('button', { name: '查看第 1 轮评测', exact: true }).click();
    await page.getByRole('button', { name: '查看修订依据', exact: true }).click();
    await page.getByRole('button', { name: '执行知识修订', exact: true }).click();
    await expect(page.locator('[data-knowledge-revision-panel]')).toContainText('受影响索引已刷新');
    await expect(page.locator('[data-knowledge-revision-panel]')).toContainText('章节标题由系统生成');
    const auditDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: '下载失败尝试及校验反馈', exact: true }).click();
    const auditFile = await (await auditDownload).path(); expect(auditFile).not.toBeNull();
    const auditRecord = JSON.parse(readFileSync(auditFile!, 'utf8'));
    expect(auditRecord.issue.code).toBe('DOC_GEN_SECTION_HEADING_INVALID');
    expect(auditRecord.output.sections[0].body).toBe('## Invalid nested title');
    await page.getByRole('button', { name: '查看修订前后正文', exact: true }).click();
    await expect(page.locator('[data-knowledge-revision-panel]')).toContainText('exactly 1, not 0');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('knowledge-revision-mobile.png'), fullPage: true });
    await page.locator('[data-knowledge-revision-panel]').screenshot({ path: test.info().outputPath('knowledge-revision-mobile-detail.png') });
    await page.setViewportSize({ width: 1363, height: 936 });
    await page.screenshot({ path: test.info().outputPath('knowledge-revision-desktop.png'), fullPage: true });
    await page.locator('[data-knowledge-revision-panel]').screenshot({ path: test.info().outputPath('knowledge-revision-desktop-detail.png') });
    const revisedTask = instance.composition.apps.workbenchStages.store.list().find(item => item.input.parameters.operation === 'KNOWLEDGE_REVISION' && item.input.parameters.evaluationTaskId === pipelineRecords[0]!.iterations![0]!.evaluation!.taskId)!;
    expect(revisedTask.result!.summary.outcome).toBe('REVISED_INDEXED');
    const updatedCard = instance.composition.repository.getKnowledgeVersion(String((revisedTask.result!.summary.updatedVersionIds as string[])[0]))!;
    expect(Buffer.from(await instance.composition.artifacts.get(updatedCard.bodyRef)).toString('utf8')).toContain(`来源提交：\`${commit}\``);
    await page.getByRole('button', { name: '重建修订版本', exact: true }).click();
    await expect.poll(() => instance.composition.apps.workbenchStages.store.list().find(item => item.input.stage === 'FLYWHEEL' && !item.input.parameters.operation)?.input.cardVersionIds).toEqual(revisedTask.result!.summary.versionIds);
    await expect(page.locator('[data-reconstruction-panel]')).toContainText('重建及接口检查完成');
    const rebuiltTask = instance.composition.apps.workbenchStages.store.list().find(item => item.input.stage === 'FLYWHEEL' && !item.input.parameters.operation)!;
    expect(rebuiltTask.input.cardVersionIds).toEqual(revisedTask.result!.summary.versionIds);
    sourceCorrection = true;
    await page.getByRole('button', { name: '执行评测', exact: true }).click();
    await expect(page.locator('[data-native-evaluation-panel]')).toContainText('评测执行完成');
    await page.getByRole('button', { name: '复核全部卡片来源', exact: true }).click();
    await expect(page.locator('[data-source-verification-panel]')).toContainText('正文与源码存在矛盾');
    await page.getByRole('button', { name: '按来源意见修订', exact: true }).click();
    await expect(page.locator('[data-source-revision-panel]')).toContainText('受影响索引已刷新');
    await expect(page.locator('[data-source-revision-panel]')).toContainText('Clarify the pinned return value');
    const sourceRepair = instance.composition.apps.workbenchStages.store.list().find(item => item.input.parameters.operation === 'KNOWLEDGE_SOURCE_REVISION')!;
    expect(sourceRepair.status).toBe('SUCCEEDED');
    await page.screenshot({ path: test.info().outputPath('source-revision-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('source-revision-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1363, height: 936 });
    await page.locator('[data-source-revision-panel]').getByRole('button', { name: '重建修订版本', exact: true }).click();
    await expect.poll(() => instance.composition.apps.workbenchStages.store.list().find(item => item.input.stage === 'FLYWHEEL' && !item.input.parameters.operation)?.input.cardVersionIds).toEqual(sourceRepair.result!.summary.versionIds);
    await expect(page.locator('[data-reconstruction-panel]')).toContainText('重建及接口检查完成');


  } finally { nativeEvaluation.snapshot = originalEvaluation.snapshot; nativeEvaluation.runner = originalEvaluation.runner; instance.composition.apps.workbenchEvaluation.dependencies.native = originalEvaluation.native; reconstruction.roles.dependencies.model = originalReconstruction.model; reconstruction.snapshot = originalReconstruction.snapshot; reconstruction.native = originalReconstruction.native; instance.composition.apps.workbenchGeneration.dependencies.model = originalModel; instance.composition.apps.workbenchGeneration.dependencies.native = originalNative; rmSync(directory, { recursive: true, force: true }); }
});

test('关联阶段可独立执行并在卡片详情查看真实引用候选', async ({ page }) => {
  const add = (symbol: string, body: string) => instance.composition.apps.flywheel.ingestCandidate({ moduleId: `association-${symbol.toLowerCase()}`,
    title: `Association ${symbol}`, description: 'Association browser acceptance', body, tags: ['c'],
    provenance: [{ path: 'api.h', commit: 'association-commit', pinned: true }],
    metadata: { cardId: `card-association-${symbol}`, repositoryId: 'association-repo', symbol, sourceModule: 'api', language: 'c' } });
  const source = await add('Parse', '# Parse\n## Behavior\nUse Result for output.');
  await add('Result', '# Result\n## Layout\nContains an integer value.');
  const locator = 'knowledge/inbox/association-guide.md';
  writeFileSync(join(repositoryDir, locator), '# External guide\nParse returns Result.');
  const registered = await instance.composition.apps.contentGovernance.createSource({ kind: 'FILE', locator, displayName: 'External parser guide' }, { idempotencyKey: 'external-guide', fingerprint: 'external-guide', actor: 'test' });
  const material = await instance.composition.apps.workbenchMaterials.capture(String(registered.resourceId), '仅适用于示例解析接口');

  await page.goto(baseUrl); await enterGovernance(page); await navigateTo(page, '知识');
  await page.getByText('知识索引与试检索', { exact: true }).click();
  await page.getByRole('button', { name: '更新索引', exact: true }).click();
  await expect(page.locator('[data-index-task]')).toContainText('已完成');
  await page.getByText('选择外部材料快照', { exact: true }).click();
  await page.locator(`[data-association-material="${material.materialId}"]`).check();
  await page.getByRole('button', { name: '建立关联', exact: true }).click();
  await expect(page.locator('[data-association-panel]')).toContainText('关联完成');
  await expect(page.getByRole('button', { name: '下载关系索引' })).toBeVisible();
  await page.locator(`[data-version-id="${source.version.versionId}"]`).first().click();
  await page.getByRole('button', { name: '当前卡片不适用' }).click();
  await expect(page.locator('[data-card-relations]')).toContainText('正文第 3 行引用 Result');
  await expect(page.locator('[data-card-relations]')).toContainText('候选未验证可替代性');
  await expect(page.locator('[data-card-relations]')).toContainText('指定材料正文第 2 行提及 Parse');
  await expect(page.locator('[data-card-relations]')).toContainText('仅适用于示例解析接口');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载材料原文', exact: true }).click();
  expect((await download).suggestedFilename()).toBeTruthy();

  await page.screenshot({ path: test.info().outputPath('associations-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: '查看关联卡片' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('associations-mobile.png'), fullPage: true });
});

test('已完成的一键流程重载展示评测和关联数量', async ({ page }) => {
  const pipeline = { pipelineId: 'pipeline-browser-summary', status: 'SUCCEEDED', currentStage: 'ASSOCIATE', contractVersion: 'knowledge-pipeline-v1', children: {} };
  await page.route('**/api/v1/workbench-pipelines', (route) => route.fulfill({ json: { items: [pipeline] } }));
  await page.route('**/api/v1/workbench-pipelines/pipeline-browser-summary', (route) => route.fulfill({ json: {
    pipeline, checkpoints: {}, usage: { modelCalls: 15, tokens: 218936 }, tasks: [
      { taskId: 'evaluation-summary', input: { stage: 'EVALUATE', sourceRevision: 'fixed' }, status: 'SUCCEEDED', result: { summary: { modules: [{ moduleId: 'parser', passed: 31, total: 31 }] }, artifactRefs: [] } },
      { taskId: 'association-summary', input: { stage: 'ASSOCIATE', sourceRevision: 'fixed' }, status: 'SUCCEEDED', result: { summary: { cards: 7, relations: 40, scope: 'INTERNAL_ONLY' }, artifactRefs: [] } },
    ],
  } }));
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(baseUrl);
  const panel = page.locator('[data-workbench-pipeline-panel]');
  await expect(panel).toContainText('通过 31/31');
  await expect(panel).toContainText('40 条关系');
  await expect(panel).toContainText('累计模型调用 15 次');
  await page.reload();
  await expect(panel).toContainText('40 条关系');
  expect(errors).toEqual([]);
});
