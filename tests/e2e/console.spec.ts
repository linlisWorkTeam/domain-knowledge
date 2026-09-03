import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createKnowledgeServer } from '../../src/interfaces/runner/server.ts';
import { GOOD_BODY } from '../helpers/fixture.ts';

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
          ? { status: 'VERIFIED' as const, reasonCode: 'READY', model: model ?? 'pi-e2e-model' }
          : { status: 'FAILED' as const, reasonCode: 'PROVIDER_AUTH_INVALID', model };
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
  await expect(page.getByText(/只读 · 实时事件；断线后每 10 秒轮询/)).toBeVisible();
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
  await search.fill('浏览器验收');
  await expect(page.getByRole('button', { name: /浏览器验收知识/ }).first()).toBeVisible();

  const card = page.getByRole('button', { name: /浏览器验收知识/ }).first();
  const openedVersionId = await card.getAttribute('data-version-id');
  assert.ok(openedVersionId);
  await card.focus();
  await card.press('Enter');
  const drawer = page.getByRole('dialog', { name: '浏览器验收知识' });
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
  await expect(page.getByRole('heading', { name: 'Agent 可以调整表达，不能改变职责' })).toBeVisible();
  await expect(page.locator('.settings-list')).toContainText('本地验收模拟器');

  const form = page.locator('#provider-settings-form');
  await form.getByLabel('API 地址').fill('https://denied.example.test/v1');
  await form.getByLabel('API Key', { exact: true }).fill(PROVIDER_SECRET);
  await form.getByLabel('模型').fill('pi-e2e-model');
  page.once('dialog', (dialog) => dialog.accept());
  const rejectedSavePromise = page.waitForResponse((response) => (
    new URL(response.url()).pathname === '/api/v1/provider-settings'
    && response.request().method() === 'PUT'
  ));
  await form.getByRole('button', { name: '保存待验证配置' }).click();
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
  await form.getByRole('button', { name: '保存待验证配置' }).click();
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
  await expect(page.getByText('连接验证成功，新批次将默认使用 Pi Agent。')).toHaveCount(0);
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
  await expect(page.locator('#toast')).toHaveText('连接验证成功，新批次将默认使用 Pi Agent。');
  await expect(page.locator('.settings-list')).toContainText('Pi Agent');
  await expect(page.locator('.reference-metrics').getByText('已作为新批次默认方式')).toBeVisible();

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
  await expect(governance.locator('.compact-metrics > div').filter({ hasText: '三轮内收敛率' })).toContainText('75%');
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
  await page.locator(`#knowledge-list [data-version-id="${firstVersionId}"]`).click();
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

  await page.route('**/api/v1/sources/scan', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'SOURCE_SCAN_UNAVAILABLE', message: 'internal detail', requestId: 'e2e', retryable: true, details: {} } }),
  }));
  await page.getByRole('button', { name: /^(?:扫描候选|重新扫描)$/ }).click();
  await expect(page.getByText('来源候选扫描失败；已登记的来源事实仍可查看和管理。')).toBeVisible();
  await expect(page.getByText('控制台来源（已确认）')).toBeVisible();
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

test('Action Center preserves the reference header baseline and information structure at 1363 by 936', async ({ page }) => {
  await page.setViewportSize({ width: 1363, height: 936 });
  await page.addInitScript(() => localStorage.setItem('wp-knowledge-theme', 'light'));
  await page.goto(baseUrl);
  await expect(page.getByRole('heading', { name: '操作中心', level: 1 })).toBeVisible();
  await expect(page.getByText('知识健康度')).toBeVisible();
  await expect(page.getByText('最近动态')).toBeVisible();
  for (const [index, stage] of ['发现', '生成', '评测', '演进'].entries()) {
    await expect(page.locator('.flywheel-stages > li > span').nth(index)).toContainText(stage);
  }

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
  expect(geometry.topbar.height).toBe(103);
  expect(Math.abs(geometry.actions.center - geometry.topbar.center)).toBeLessThan(2);
  expect(geometry.title.top).toBeGreaterThanOrEqual(39.5);
  expect(geometry.title.top).toBeLessThanOrEqual(45);
  expect(geometry.actions.top).toBeGreaterThan(20);

  await expect(page).toHaveScreenshot('action-center-1363x936-light.png', {
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
