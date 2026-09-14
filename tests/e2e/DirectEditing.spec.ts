/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证免登录部署直接配置、保存提示词及访问发布设置。
 */
import { test, expect } from '@playwright/test';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createKnowledgeServer } from '../../src/interfaces/runner/Server.ts';

test('免登录前台不要求治理令牌，代理访问可直接保存且跨站写入被拒绝', async ({ page }) => {
  const runtimeDir = mkdtempSync(join(tmpdir(), 'console-direct-'));
  const instance = createKnowledgeServer({ runtimeDir, anonymousAccess: true });
  instance.server.listen(0, '127.0.0.1');
  await once(instance.server, 'listening');
  const address = instance.server.address();
  if (!address || typeof address === 'string') throw new Error('Missing server address');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    await page.setExtraHTTPHeaders({ 'x-forwarded-for': '203.0.113.1' });
    await page.goto(base);
    await expect(page.locator('#mode-pill')).toHaveText('可编辑');
    await page.getByRole('button', { name: 'Agent 设置', exact: true }).click();
    await expect(page.getByText('服务端写入尚未启用。')).toHaveCount(0);
    await page.locator('.provider-card > summary').click();
    await page.locator('.agent-prompts > summary').click();
    await expect(page.locator('#provider-settings-form input[name="apiUrl"]')).toBeEnabled();
    const card = page.locator('.agent-card').filter({ has: page.getByRole('heading', { name: '文档生成 Agent', exact: true }) });
    await card.locator('textarea').fill('使用简洁中文，保留技术事实。');
    await card.getByRole('button', { name: '保存提示词' }).click();
    await expect(page.locator('#toast')).toContainText('已保存');
    await page.reload();
    await page.getByRole('button', { name: 'Agent 设置', exact: true }).click();
    await page.locator('.agent-prompts > summary').click();
    await expect(card.locator('textarea')).toHaveValue('使用简洁中文，保留技术事实。');
    await page.getByRole('button', { name: '查看发布设置' }).click();
    await expect(page.locator('#publication-settings-form')).toBeVisible();
    await page.getByRole('button', { name: '＋ 新建批次' }).click();
    await expect(page.locator('[data-module-batches]')).toContainText('左上角选择项目');
    await expect(page.locator('#workflow-start-form')).toHaveCount(0);
    await expect(page.locator('#operator-dialog')).not.toBeVisible();
    const rejected = await page.request.put(`${base}/api/v1/agents/doc-gen/prompt`, {
      headers: { origin: 'https://other.example' }, data: { promptAddon: '不得保存' },
    });
    expect(rejected.status()).toBe(401);
  } finally {
    await page.close();
    instance.server.closeAllConnections();
    instance.server.close();
    await once(instance.server, 'close');
    rmSync(runtimeDir, { recursive: true, force: true });
  }
});
