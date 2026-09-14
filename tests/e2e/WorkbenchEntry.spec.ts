/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证工作台初始任务入口、前置状态及桌面和窄屏布局。
 */
import { test, expect } from '@playwright/test';
import { once } from 'node:events';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createKnowledgeServer } from '../../src/interfaces/runner/Server.ts';

test('project selector owns repository inputs and overview retains historical health', async ({ page }) => {
  const root = mkdtempSync(join(tmpdir(), 'workbench-entry-browser-'));
  const instance = createKnowledgeServer({ runtimeDir: root, anonymousAccess: true });
  instance.server.listen(0, '127.0.0.1'); await once(instance.server, 'listening');
  const address = instance.server.address(); if (!address || typeof address === 'string') throw new Error('TEST_SERVER_ADDRESS_INVALID');
  try {
    await page.goto(`http://127.0.0.1:${address.port}`);
    await expect(page.getByRole('heading', { name: '历史运行与知识健康' })).toBeVisible();
    await expect(page.locator('[data-repository-form]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '一键执行全部', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '选择项目', exact: true }).click();
    const route = page.getByRole('list', { name: '知识任务的五个阶段' });
    await expect(route.locator('li strong')).toHaveText(['知识库生成', '知识索引', '知识飞轮', '知识评测', '知识关联']);
    await expect(page.getByRole('button', { name: '一键执行全部', exact: true })).toBeDisabled();
    await expect(page.locator('.pipeline-prerequisite')).toContainText('分析仓库并保存项目输入后即可启动');
    expect(instance.composition.apps.workbenchStages.store.list()).toHaveLength(0);
    const input = page.getByLabel('服务器仓库目录', { exact: true });
    await input.fill('/tmp/example-repository');
    await page.getByLabel('源码版本', { exact: true }).fill('HEAD');
    await expect(page.getByRole('button', { name: '分析仓库', exact: true })).toBeEnabled();
    await page.screenshot({ path: test.info().outputPath('workbench-entry-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    const analyze = page.getByRole('button', { name: '分析仓库', exact: true });
    await analyze.scrollIntoViewIfNeeded(); await expect(analyze).toBeInViewport();
    await input.focus(); await expect(input).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('workbench-entry-narrow.png'), fullPage: true });
  } finally {
    instance.server.closeAllConnections();
    await new Promise<void>(resolve => instance.server.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  }
});


test('project folder module saves through HTTP and restores selected project after reload', async ({ page }) => {
  const root = mkdtempSync(join(tmpdir(), 'project-module-browser-'));
  const repository = join(root, 'source'); mkdirSync(repository); mkdirSync(join(repository, 'core'));
  writeFileSync(join(repository, 'core', 'parse.c'), 'int parse(void) { return 1; }');
  const git = (args: string[]) => execFileSync('git', ['-c', 'user.name=Browser', '-c', 'user.email=browser@example.test', ...args], { cwd: repository });
  git(['init', '-q']); git(['add', '.']); git(['commit', '-qm', 'Fixed source']);
  const instance = createKnowledgeServer({ runtimeDir: join(root, 'runtime'), anonymousAccess: true });
  instance.server.listen(0, '127.0.0.1'); await once(instance.server, 'listening');
  const address = instance.server.address(); if (!address || typeof address === 'string') throw new Error('TEST_SERVER_ADDRESS_INVALID');
  try {
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.getByRole('button', { name: '选择项目', exact: true }).click();
    await page.getByLabel('服务器仓库目录', { exact: true }).fill(repository);
    await page.getByRole('button', { name: '分析仓库', exact: true }).click();
    await page.getByLabel('模块文件夹', { exact: true }).selectOption('core');
    await page.getByLabel('模块名称', { exact: true }).fill('parser-core');
    await page.getByRole('button', { name: '添加模块', exact: true }).click();
    await expect(page.locator('[data-project-module]')).toHaveCount(1);
    await expect(page.locator('[data-project-module]')).toHaveValue('parser-core');
    await page.getByRole('button', { name: '保存项目输入', exact: true }).click();
    await expect(page.locator('[data-project-summary]')).toContainText('已保存 1 个模块');
    const saved = instance.composition.apps.workbenchProjects.store.list()[0]!;
    expect(saved.moduleDefinitions).toEqual([{ moduleId: 'parser-core', directories: ['core'] }]);
    expect(saved.modules[0]!.sourcePaths).toEqual(['core/parse.c']);
    await expect(page.locator('#selected-project-name')).toHaveText('source');
    await page.reload();
    await expect(page.locator('#selected-project-name')).toHaveText('source');
    await expect(page.locator('[data-repository-form]')).toHaveCount(0);
    expect(instance.composition.apps.workbenchStages.store.list()).toHaveLength(0);
  } finally {
    instance.server.closeAllConnections();
    await new Promise<void>(resolve => instance.server.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  }
});
