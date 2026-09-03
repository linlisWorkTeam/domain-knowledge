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

test('工作流图由标准节点 API 支撑并保持只读', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));
  await page.goto(baseUrl);
  await page.getByRole('button', { name: /^工作流图$/ }).click();
  await expect(page.getByRole('heading', { name: '工作流图', level: 1 })).toBeVisible();
  await expect(page.getByLabel('只读 Agent 工作流图')).toBeVisible();
  await expect(page.getByText(/只读 · 实时事件；断线后每 10 秒轮询/)).toBeVisible();
  await expect(page.locator('.graph-node')).toHaveCount(7);
  await expect(page.locator('.graph-edge')).toHaveCount(7);
  await expect(page.locator('.graph-status-legend')).toContainText('运行中');
  await expect(page.locator('.graph-status-legend')).toContainText('已完成');
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

  await expect(page.getByRole('heading', { name: '操作中心', level: 1 })).toBeVisible();
  await expect(page.getByText('browser-contract').first()).toBeVisible();
  await expect(page.getByText(/项需要确认/)).toBeVisible();

  const labels = ['操作中心', '飞轮批次', '知识', '工作流图', '评测', '来源', 'Agent 设置'];
  for (const label of labels) {
    await expect(page.getByRole('button', { name: new RegExp(label) }).first()).toBeVisible();
    if (label !== '操作中心') await page.getByRole('button', { name: new RegExp(`^${label}$`) }).click();
    await expect(page.getByRole('heading', { name: label, exact: true })).toHaveCount(1);
    await expect(page.getByText(/Action Center|Flywheel Runs|Knowledge Health|Recent Pulse|New run|Run history|PARTIAL|DISABLED/)).toHaveCount(0);
  }

  await page.getByRole('button', { name: /^来源$/ }).click();
  await expect(page.getByRole('heading', { name: '当前来源候选' })).toBeVisible();
  expect(requests.some((url) => url.endsWith('/api/v1/sources/scan'))).toBe(true);
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

test('light theme applies semantic surfaces across all seven pages and drawers', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('wp-knowledge-theme', 'light'));
  await page.goto(baseUrl);
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

  for (const label of ['操作中心', '飞轮批次', '知识', '工作流图', '评测', '来源', 'Agent 设置']) {
    if (label !== '操作中心') await page.getByRole('button', { name: new RegExp(`^${label}$`) }).click();
    await assertNoDarkSurfaces(label);
  }
  await page.getByRole('button', { name: /^知识$/ }).click();
  await page.getByRole('combobox', { name: '知识状态' }).selectOption('');
  await page.getByRole('button', { name: /浏览器验收知识/ }).click();
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
  expect(geometry.title.top).toBeGreaterThanOrEqual(40);
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
