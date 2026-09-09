/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：使用受控数据验证 MVP 的目录、固定入口、取消、发布阅读及视觉状态。
 */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { WorkflowExecutionView } from '../../src/application/ports/ApplicationPorts.ts';
import { createKnowledgeServer } from '../../src/interfaces/runner/Server.ts';

let instance: ReturnType<typeof createKnowledgeServer>;
let runtimeDir = '';
let baseUrl = '';
let unexpectedProductCalls: string[] = [];
const controlledExecutions = new Map<string, WorkflowExecutionView>();
const token = 'controlled-product-ui-token';
const gitToken = 'fixture-only-git-token-never-render';
const projectDirectory = '/srv/projects/ohMyWorkPanel';
const knowledgeDirectory = '/srv/knowledge';
const publicationKey = 'publication-controlled-001';
const published = {
  schemaVersion: '1.0', publicationKey, versionId: 'knowledge-markdown-lite-v1', runId: 'run-controlled-001',
  moduleId: 'markdown-lite', bodySha256: 'b'.repeat(64), path: '/srv/knowledge/publication-001/Knowledge.md',
  status: 'PUBLISHED', createdAt: '2026-09-09T00:00:00.000Z',
};
const markdown = '# Markdown Lite 接口与行为\n\n## 公开接口\n\n将支持的 Markdown 子集转换为安全的 HTML。\n\n## 边界行为\n\n原始 HTML 需要转义；代码块保留换行。\n\n---\n\n来源提交：0123456789abcdef\n\n运行：run-controlled-001 · 门禁：gate-controlled-001\n';

async function enterGovernance(page: Page) {
  await page.getByRole('button', { name: '＋ 新建批次' }).click();
  await page.getByLabel('治理令牌').fill(token);
  await page.getByRole('button', { name: '确认' }).click();
  await expect(page.locator('#mode-pill')).toHaveText('治理模式');
}
async function openSettings(page: Page) {
  await page.goto(baseUrl);
  await enterGovernance(page);
  await page.getByRole('button', { name: /^Agent 设置$/ }).click();
  await page.getByRole('button', { name: '读取发布设置' }).click();
  await expect(page.locator('#publication-settings-form')).toBeVisible();
  await expect(page.getByLabel('服务器知识目录')).toHaveValue(knowledgeDirectory);
}

/** 只替换新增产品 API 的响应；服务自身、批次状态和详情继续使用真实 HTTP。 */
async function controlledProductApi(page: Page) {
  let settings = { directory: knowledgeDirectory, git: { enabled: false, remote: '', branch: 'main', tokenConfigured: false } };
  const starts: unknown[] = [];
  const saved: unknown[] = [];
  let runId = '';
  let syncFailure: 'GIT_AUTHENTICATION_FAILED' | 'GIT_CONFLICT' | 'GIT_REMOTE_CONTENT_DENIED' | null = null;
  let directoryFailure = false;
  await page.route((url) => url.pathname === '/api/v1/server-directories', async (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
    if (directoryFailure) {
      await route.fulfill({ status: 422, json: { error: { code: 'DIRECTORY_DENIED', message: 'outside allowed roots' } } }); return;
    }
    const path = new URL(route.request().url()).searchParams.get('path') || '/srv';
    const children: Record<string, string[]> = { '/srv': ['/srv/knowledge', '/srv/projects'], '/srv/projects': [projectDirectory], [projectDirectory]: [], [knowledgeDirectory]: [] };
    await route.fulfill({ json: { path, parent: path === '/srv' ? null : '/srv', directories: children[path] || [] } });
  });
  // 使用路径边界匹配子资源；尾部 ** glob 不跨 /，会漏掉 settings、sync 与正文请求。
  await page.route((url) => url.pathname === '/api/v1/publications' || url.pathname.startsWith('/api/v1/publications/'), async (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/settings')) {
      if (route.request().method() === 'PUT') {
        const input = route.request().postDataJSON(); saved.push(input);
        settings = { directory: input.directory, git: { enabled: input.git.enabled, remote: input.git.remote, branch: input.git.branch, tokenConfigured: input.git.clearToken ? false : Boolean(input.git.token) || settings.git.tokenConfigured } };
      }
      await route.fulfill({ json: settings }); return;
    }
    if (path.endsWith('/sync')) {
      if (syncFailure) await route.fulfill({ status: 409, json: { error: { code: syncFailure, message: 'controlled synchronization failure' } } });
      else await route.fulfill({ json: { status: 'SYNCED', commit: 'd'.repeat(40), publishedCount: 1 } });
      return;
    }
    if (path.endsWith('/recover')) { await route.fulfill({ json: { items: [] } }); return; }
    if (path.endsWith(`/${publicationKey}`)) {
      await route.fulfill({ json: { receipt: published, markdown, metadata: {
        publicationKey, title: 'Markdown Lite 接口与行为', sourceCommit: '0123456789abcdef', sourceDigest: 'a'.repeat(64),
        gateDecisionId: 'gate-controlled-001', evidenceRefs: [{ sha256: 'c'.repeat(64) }],
      } } }); return;
    }
    await route.fulfill({ json: { items: [published] } });
  });
  await page.route('**/api/v1/runs/markdown-lite', async (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
    const input = route.request().postDataJSON(); starts.push(input);
    let run = instance.composition.apps.flywheel.createRun('markdown-lite-controlled', 'local-v1');
    for (const state of ['PLANNED', 'GENERATING'] as const) run = instance.composition.apps.flywheel.transition(run.runId, state);
    runId = run.runId;
    controlledExecutions.set(runId, { runId, executionStatus: 'RUNNING', currentNode: 'doc_worker', iteration: 0, maxIterations: 3, route: null, error: null });
    await route.fulfill({ status: 202, json: { runId, executionStatus: 'RUNNING' } });
  });
  await page.route('**/api/v1/runs/*/cancel', async (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
    expect(new URL(route.request().url()).pathname).toBe(`/api/v1/runs/${runId}/cancel`);
    controlledExecutions.set(runId, { ...controlledExecutions.get(runId)!, executionStatus: 'CANCELLED' });
    instance.composition.apps.flywheel.transition(runId, 'CANCELLED');
    await route.fulfill({ json: { runId, executionStatus: 'CANCELLED' } });
  });
  return { starts, saved, setSyncFailure(value: typeof syncFailure) { syncFailure = value; }, setDirectoryFailure(value: boolean) { directoryFailure = value; } };
}

test.beforeAll(async () => {
  runtimeDir = mkdtempSync(join(tmpdir(), 'knowledge-product-ui-'));
  instance = createKnowledgeServer({ runtimeDir, writeToken: token, clock: () => '2026-09-09T00:00:00.000Z' });
  // 控制数据未拦截时立即失败，避免浏览器 fixture 意外调用真实 Git 或启动模型。
  const unexpected = (operation: string): never => {
    unexpectedProductCalls.push(operation);
    throw new Error(`E2E_PRODUCT_ROUTE_NOT_INTERCEPTED: ${operation}`);
  };
  for (const operation of ['getSettings', 'putSettings', 'list', 'get', 'sync', 'recover', 'listDirectories']) {
    Object.defineProperty(instance.composition.apps.publicationOperations, operation, { value: () => unexpected(operation) });
  }
  instance.composition.apps.markdownLite.start = async () => unexpected('markdownLite.start');
  instance.composition.apps.orchestrator.status = async (runId) => {
    const view = controlledExecutions.get(runId);
    if (!view) throw new Error(`WORKFLOW_NOT_FOUND: ${runId}`);
    return structuredClone(view);
  };
  instance.server.listen(0, '127.0.0.1');
  await once(instance.server, 'listening');
  const address = instance.server.address();
  assert.ok(address && typeof address === 'object');
  baseUrl = `http://127.0.0.1:${address.port}`;
});
test.beforeEach(() => { unexpectedProductCalls = []; });
test.afterEach(() => { expect(unexpectedProductCalls, 'Product API fixtures must never fall through to real filesystem, Git or models').toEqual([]); });
test.afterAll(async () => {
  instance.server.closeAllConnections();
  await new Promise<void>((resolveClose) => instance.server.close(() => resolveClose()));
  rmSync(runtimeDir, { recursive: true, force: true });
});

test('固定模块入口浏览服务器目录、展示进度并取消运行', async ({ page }) => {
  const control = await controlledProductApi(page);
  await page.goto(baseUrl);
  await page.getByRole('button', { name: /^飞轮批次$/ }).click();
  await expect(page.getByRole('button', { name: '启动知识飞轮' })).toBeDisabled();
  await enterGovernance(page);
  await page.getByRole('button', { name: /^飞轮批次$/ }).click();
  await expect(page.getByLabel('项目场景 JSON')).toHaveCount(0);
  await page.getByRole('button', { name: '浏览目录', exact: true }).click();
  await page.getByRole('button', { name: 'projects/', exact: true }).click();
  await page.getByRole('button', { name: 'ohMyWorkPanel/', exact: true }).click();
  await page.getByRole('button', { name: '选择当前目录' }).click();
  await expect(page.getByLabel('服务器项目目录')).toHaveValue(projectDirectory);
  await expect(page.locator('#workflow-start-form')).toContainText('最多 3 轮 / 30 分钟');
  await page.getByRole('button', { name: '启动知识飞轮' }).click();
  await expect(page.getByRole('heading', { name: 'markdown-lite-controlled', exact: true })).toBeVisible();
  expect(control.starts).toEqual([{ repositoryRoot: projectDirectory }]);
  await expect(page.getByRole('heading', { name: '自动化节点' })).toBeVisible();
  await expect(page.getByText('进度暂不可确定', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '取消批次', exact: true }).click();
  await expect(page.getByText('当前状态：已取消', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '取消批次', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '审计时间线' })).toBeVisible();
});

test('发布设置默认关闭 Git，选择知识目录并脱敏保存令牌', async ({ page }) => {
  const control = await controlledProductApi(page);
  await openSettings(page);
  const form = page.locator('#publication-settings-form');
  await expect(form.getByLabel('服务器知识目录')).toHaveValue(knowledgeDirectory);
  await expect(form.getByLabel('启用手动 Git 同步')).not.toBeChecked();
  await expect(page.getByRole('button', { name: '立即同步 Git' })).toBeDisabled();
  await form.getByRole('button', { name: '浏览服务器目录' }).click();
  await expect(page.locator('#directory-browser')).toContainText(knowledgeDirectory);
  await page.getByRole('button', { name: '选择当前目录' }).click();
  await expect(form.getByLabel('服务器知识目录')).toHaveValue(knowledgeDirectory);
  await form.getByLabel('启用手动 Git 同步').check();
  await form.getByLabel('目标仓库').fill('https://git.example.test/team/knowledge.git');
  await form.getByLabel('HTTPS 访问令牌').fill(gitToken);
  await form.getByRole('button', { name: '保存发布设置' }).click();
  await expect(page.locator('#toast')).toHaveText('发布设置已保存。');
  await expect(page.getByLabel('HTTPS 访问令牌')).toHaveValue('');
  await expect(page.getByLabel('HTTPS 访问令牌')).toHaveAttribute('placeholder', '已配置；留空保留');
  await expect(page.getByRole('button', { name: '立即同步 Git' })).toBeEnabled();
  expect(control.saved).toHaveLength(1);
  expect(await page.locator('body').textContent()).not.toContain(gitToken);
  expect(await page.evaluate(() => [...Object.values(localStorage), ...Object.values(sessionStorage)])).not.toContain(gitToken);
  await page.getByRole('button', { name: '立即同步 Git' }).click();
  await expect(page.locator('#toast')).toHaveText('已同步 1 个本地发布。');
});

test('目录拒绝与 Git 认证、冲突失败保留本地知识和重试入口', async ({ page }) => {
  const control = await controlledProductApi(page);
  await openSettings(page);
  control.setDirectoryFailure(true);
  await page.getByRole('button', { name: '浏览服务器目录' }).click();
  await expect(page.locator('#toast')).toContainText('不在授权范围');
  await page.getByLabel('启用手动 Git 同步').check();
  await page.getByLabel('目标仓库').fill('https://git.example.test/team/knowledge.git');
  await page.getByRole('button', { name: '保存发布设置' }).click();
  await expect(page.locator('#toast')).toHaveText('发布设置已保存。');
  control.setSyncFailure('GIT_AUTHENTICATION_FAILED');
  await page.getByRole('button', { name: '立即同步 Git' }).click();
  await expect(page.locator('#toast')).toContainText('Git 认证失败');
  await expect(page.getByRole('button', { name: '立即同步 Git' })).toBeEnabled();
  control.setSyncFailure('GIT_CONFLICT');
  await page.getByRole('button', { name: '立即同步 Git' }).click();
  await expect(page.locator('#toast')).toContainText('本地发布仍然保留');
  control.setSyncFailure('GIT_REMOTE_CONTENT_DENIED');
  await page.getByRole('button', { name: '立即同步 Git' }).click();
  await expect(page.locator('#toast')).toContainText('本地知识保持原样');
  await expect(page.locator('.publication-list')).toContainText('已发布');
  await page.locator(`[data-publication-key="${publicationKey}"]`).click();
  await expect(page.locator('.publication-markdown')).toContainText('原始 HTML 需要转义');
  await page.getByText('来源与门禁证据', { exact: true }).click();
  await expect(page.locator('#publication-settings .json-view')).toContainText('gate-controlled-001');
});

test('新增发布设置视觉基线保持可读且没有水平溢出', async ({ page }, testInfo) => {
  await controlledProductApi(page);
  await page.setViewportSize({ width: 1363, height: 936 });
  await page.addInitScript(() => localStorage.setItem('wp-knowledge-theme', 'light'));
  await openSettings(page);
  const panel = page.locator('.publication-panel');
  await panel.scrollIntoViewIfNeeded();
  await expect(page.locator('#toast')).toBeHidden();
  await expect(panel).toHaveScreenshot('PublicationSettings1363LightLinux.png', { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.01 });
  await testInfo.attach('publication-settings', { body: await panel.screenshot(), contentType: 'image/png' });
  await page.setViewportSize({ width: 640, height: 900 });
  expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test('新增发布知识阅读视觉基线展示来源与确定性门禁', async ({ page }, testInfo) => {
  await controlledProductApi(page);
  await page.setViewportSize({ width: 1363, height: 936 });
  await page.addInitScript(() => localStorage.setItem('wp-knowledge-theme', 'light'));
  await openSettings(page);
  await page.locator(`[data-publication-key="${publicationKey}"]`).click();
  await expect(page.locator('.publication-markdown')).toHaveText(markdown);
  const panel = page.locator('.publication-panel');
  await panel.scrollIntoViewIfNeeded();
  await expect(page.locator('#toast')).toBeHidden();
  await expect(panel).toHaveScreenshot('PublishedKnowledge1363LightLinux.png', { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.01 });
  await testInfo.attach('published-knowledge', { body: await panel.screenshot(), contentType: 'image/png' });
});
