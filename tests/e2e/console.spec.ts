import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { createKnowledgeServer } from '../../src/interfaces/runner/server.ts';
import { GOOD_BODY } from '../helpers/fixture.ts';

let instance: ReturnType<typeof createKnowledgeServer>;
let runtimeDir = '';
let baseUrl = '';

test.beforeAll(async () => {
  runtimeDir = mkdtempSync(join(tmpdir(), 'domain-knowledge-ui-e2e-'));
  instance = createKnowledgeServer({ runtimeDir, writeToken: 'ui-e2e-token' });
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
      provenance: [{ path: 'tests/e2e/console.spec.ts', commit: 'ui-e2e', pinned: true }],
    }),
  });
  assert.equal(candidate.status, 201);
  const { runId } = instance.composition.apps.flywheel.createRun('browser-contract', 'local-v1');
  for (const nextState of ['PLANNED', 'GENERATING', 'EVALUATING', 'FAILED'] as const) {
    instance.composition.apps.flywheel.transition(runId, nextState);
  }
});

test('Graph is a read-only Run Agent workflow backed by canonical node APIs', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));
  await page.goto(baseUrl);
  await page.getByRole('button', { name: /^Graph$/ }).click();
  await expect(page.getByRole('heading', { name: 'Graph', level: 1 })).toBeVisible();
  await expect(page.getByLabel('只读 Agent 工作流图')).toBeVisible();
  await expect(page.getByText('只读拓扑')).toBeVisible();
  await expect(page.getByText(/B2 event-stream/)).toBeVisible();
  expect(requests.some((path) => /\/api\/v1\/runs\/[^/]+\/workflow-nodes$/.test(path))).toBe(true);
  expect(requests.some((path) => /\/api\/v1\/runs\/[^/]+\/workflow-status$/.test(path))).toBe(true);
  expect(requests.some((path) => /\/api\/v1\/runs\/[^/]+\/events$/.test(path))).toBe(true);
  await page.locator('[data-graph-agent]').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '关闭详情' }).click();
  await expect(page.locator('[data-graph-agent]').first()).toBeFocused();
});

test.afterAll(async () => {
  instance.server.close();
  await once(instance.server, 'close');
  rmSync(runtimeDir, { recursive: true, force: true });
});

test('seven-page Console uses server facts and canonical Sources API', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto(baseUrl);

  await expect(page.getByRole('heading', { name: 'Action Center', level: 1 })).toBeVisible();
  await expect(page.getByText('browser-contract').first()).toBeVisible();
  await expect(page.getByText('需要人工查看')).toBeVisible();

  const labels = ['Action Center', 'Flywheel Runs', 'Knowledge', 'Graph', 'Evaluations', 'Sources', 'Agent Settings'];
  for (const label of labels) await expect(page.getByRole('button', { name: new RegExp(label) }).first()).toBeVisible();

  await page.getByRole('button', { name: /^Sources$/ }).click();
  await expect(page.getByRole('heading', { name: '当前来源候选' })).toBeVisible();
  expect(requests.some((url) => url.endsWith('/api/v1/sources/scan'))).toBe(true);
  expect(requests.every((url) => url.startsWith(baseUrl))).toBe(true);
  await expect(page.getByText(/Knowledge Health|Action Item|预计完成|ETA|Workspace owner/)).toHaveCount(0);
});

test('knowledge search and detail drawer are keyboard operable and restore focus', async ({ page }) => {
  await page.goto(baseUrl);
  await page.getByRole('button', { name: '搜索知识' }).click();
  const search = page.getByRole('searchbox');
  await expect(search).toBeFocused();
  await page.getByRole('combobox', { name: '知识状态' }).selectOption('');
  await search.fill('浏览器验收');
  await expect(page.getByRole('button', { name: /浏览器验收知识/ })).toBeVisible();

  const card = page.getByRole('button', { name: /浏览器验收知识/ });
  await card.focus();
  await card.press('Enter');
  const drawer = page.getByRole('dialog', { name: '浏览器验收知识' });
  await expect(drawer).toBeVisible();
  await expect(page.getByRole('button', { name: '关闭详情' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(card).toBeFocused();
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

test('mobile navigation, theme persistence and 200 percent zoom preserve core paths', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl);
  const navToggle = page.getByRole('button', { name: '打开主导航' });
  await navToggle.click();
  await expect(page.getByRole('button', { name: /^Flywheel Runs$/ })).toBeVisible();
  await page.getByRole('button', { name: /^Flywheel Runs$/ }).click();
  await expect(page.getByRole('heading', { name: 'Flywheel Runs', level: 1 })).toBeVisible();
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
  await page.getByRole('button', { name: /^Flywheel Runs$/ }).click();
  await expect(page.getByRole('heading', { name: 'Flywheel Runs', level: 1 })).toBeVisible();
  await expect(page.getByText('browser-contract').first()).toBeVisible();
});
