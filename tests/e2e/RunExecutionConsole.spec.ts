/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证可恢复执行失败的计数、详情、筛选和操作；不启动模型。
 */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test, expect } from '@playwright/test';
import { createRunExecutionFixture } from '../helpers/RunExecutionFixture.ts';

let fixture: Awaited<ReturnType<typeof createRunExecutionFixture>>;
let baseUrl = '';
test.beforeEach(async () => {
  fixture = await createRunExecutionFixture();
  fixture.instance.server.listen(0, '127.0.0.1'); await once(fixture.instance.server, 'listening');
  const address = fixture.instance.server.address(); assert.ok(address && typeof address === 'object');
  baseUrl = `http://127.0.0.1:${address.port}`;
});
test.afterEach(async () => { await fixture.dispose(); });

test('可恢复失败不会计入运行中，业务阶段、失败节点和预算限制分别可见', async ({ page }) => {
  await page.goto(baseUrl);
  await expect(page.locator('.current-run-card')).toContainText('执行失败');
  await page.getByRole('button', { name: /^飞轮批次$/ }).click();
  await expect(page.locator('.reference-metrics article').first().locator('b')).toHaveText('1');
  await page.getByRole('button', { name: '执行失败', exact: true }).click();
  await expect(page.locator('#runs-list .reference-run-item')).toHaveCount(3);
  await page.getByRole('button', { name: '运行中', exact: true }).click();
  await expect(page.locator('#runs-list .reference-run-item')).toHaveCount(1);
  await expect(page.locator('#runs-list')).toContainText('execution-active');
  await page.getByRole('button', { name: '全部', exact: true }).click();
  await page.setViewportSize({ width: 640, height: 900 });
  await expect(page.locator(`.reference-run-item[data-run-id="${fixture.ids.failed}"] em`)).toBeVisible();
  await expect(page.locator(`.reference-run-item[data-run-id="${fixture.ids.failed}"] em`)).toHaveText('执行失败');
  await expect(page.locator(`.reference-run-item[data-run-id="${fixture.ids.cancelled}"] em`)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.locator(`.reference-run-item[data-run-id="${fixture.ids.failed}"]`).click();
  await expect(page.locator('.run-title-actions .badge')).toHaveText('执行失败');
  await expect(page.locator('[data-execution-state]')).toContainText('业务阶段保留：生成中');
  await expect(page.locator('[data-execution-state]')).toContainText('DOC_WORKER_SOURCE_EVIDENCE_INVALID');
  await expect(page.locator('[data-execution-state]')).toContainText('可恢复；仍使用原有预算');
  await expect(page.getByRole('button', { name: '取消批次', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '恢复批次', exact: true })).toBeDisabled();
  expect(await page.locator('body').textContent()).not.toContain('private-upstream-response');
  await page.screenshot({ path: test.info().outputPath('ExecutionFailureDesktop.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 640, height: 900 });
  await expect.poll(() => page.locator('#sidebar').evaluate((element) => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator('[data-execution-state]')).toContainText('可恢复；仍使用原有预算');
  await page.screenshot({ path: test.info().outputPath('ExecutionFailureNarrow.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 1280, height: 720 });
  for (const [runId, label] of [[fixture.ids.expired, '预算已耗尽，不能恢复'], [fixture.ids.incompatible, '执行版本或配置已变更，不能恢复']]) {
    await page.getByRole('button', { name: '← 返回批次列表' }).click();
    await page.locator(`.reference-run-item[data-run-id="${runId}"]`).click();
    await expect(page.locator('[data-execution-state]')).toContainText(label);
    await expect(page.getByRole('button', { name: '恢复批次', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '取消批次', exact: true })).toHaveCount(0);
  }
  await page.getByRole('button', { name: '← 返回批次列表' }).click();
  await page.locator(`.reference-run-item[data-run-id="${fixture.ids.cancelled}"]`).click();
  await expect(page.locator('.run-title-actions .badge')).toHaveText('已取消');
  await expect(page.locator('.node-list')).toContainText('历史节点状态：运行中');
  await expect(page.getByRole('button', { name: '取消批次', exact: true })).toHaveCount(0);
});

test('恢复和取消更新执行计数，保留原始预算与历史证据', async ({ page }) => {
  await page.goto(baseUrl);
  await page.getByRole('button', { name: '＋ 新建批次' }).click();
  await page.getByLabel('治理令牌').fill('run-view-token');
  await page.getByRole('button', { name: '确认', exact: true }).click();
  await page.getByRole('button', { name: /^飞轮批次$/ }).click();
  await page.locator(`.reference-run-item[data-run-id="${fixture.ids.failed}"]`).click();
  const originalBudget = structuredClone(fixture.views.get(fixture.ids.failed)!.budget);
  await page.getByRole('button', { name: '恢复批次', exact: true }).click();
  await expect(page.getByRole('button', { name: '取消批次', exact: true })).toBeEnabled();
  await expect(page.locator('.run-title-actions .badge')).toHaveText('生成中');
  expect(fixture.views.get(fixture.ids.failed)!.budget).toEqual(originalBudget);
  await page.getByRole('button', { name: '← 返回批次列表' }).click();
  await expect(page.locator('.reference-metrics article').first().locator('b')).toHaveText('2');
  await page.locator(`.reference-run-item[data-run-id="${fixture.ids.failed}"]`).click();
  await page.getByRole('button', { name: '取消批次', exact: true }).click();
  await expect(page.locator('.run-title-actions .badge')).toHaveText('已取消');
  await expect(page.getByRole('button', { name: '恢复批次', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '审计时间线' })).toBeVisible();
  await page.getByRole('button', { name: '← 返回批次列表' }).click();
  await expect(page.locator('.reference-metrics article').first().locator('b')).toHaveText('1');
});
