/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证真实Console删除二次确认、窄屏操作和重载后的持久恢复入口。
 */
import { test, expect } from '@playwright/test';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createKnowledgeServer } from '../../src/interfaces/runner/Server.ts';
let instance: ReturnType<typeof createKnowledgeServer>, root: string, base: string, runId: string;
test.beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'deletion-browser-'));
  instance = createKnowledgeServer({ runtimeDir: root, anonymousAccess: true });
  const run = instance.composition.apps.flywheel.createRun('browser-delete', 'v1'); runId = run.runId;
  for (const state of ['PLANNED', 'GENERATING', 'EVALUATING', 'FAILED'] as const) instance.composition.apps.flywheel.transition(runId, state);
  instance.server.listen(0, '127.0.0.1'); await once(instance.server, 'listening');
  const address = instance.server.address(); if (!address || typeof address === 'string') throw new Error('missing address'); base = `http://127.0.0.1:${address.port}`;
});
test.afterEach(async () => {
  await instance.composition.shutdown(); instance.server.closeAllConnections(); instance.server.close(); await once(instance.server, 'close');
  rmSync(root, { recursive: true, force: true });
});
test('cancel preserves a batch; second confirmation deletes it on a narrow screen', async ({ page }) => {
  await page.goto(base); await page.getByRole('button', { name: '知识飞轮管理', exact: true }).click();
  await page.locator(`[data-run-id="${runId}"]`).first().click();
  await page.getByRole('button', { name: '删除批次', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '确认删除批次' });
  await expect(dialog.getByRole('button', { name: '确认删除', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  expect((await page.request.get(`${base}/api/v1/runs/${runId}`)).status()).toBe(200);
  await page.getByRole('button', { name: '删除批次', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '确认删除', exact: true })).toBeEnabled();
  await page.screenshot({ path: test.info().outputPath('deletion-confirm-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog.getByRole('button', { name: '确认删除', exact: true })).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath('deletion-confirm-mobile.png'), fullPage: true });
  await dialog.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(`[data-run-id="${runId}"]`)).toHaveCount(0);
});
test('reload exposes recovery for an already confirmed partial deletion', async ({ page }) => {
  await page.goto(base); await page.getByRole('button', { name: '知识飞轮管理', exact: true }).click();
  await page.locator(`[data-run-id="${runId}"]`).first().click();
  await page.getByRole('button', { name: '删除批次', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '确认删除批次' });
  await expect(dialog.getByRole('button', { name: '确认删除', exact: true })).toBeEnabled();
  instance.composition.repository.database.exec("CREATE TRIGGER controlled_delete_failure BEFORE INSERT ON deletion_participant_receipts BEGIN SELECT RAISE(ABORT,'controlled'); END");
  await dialog.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '继续完成删除', exact: true })).toBeEnabled();
  await page.reload(); await expect(page.getByRole('heading', { name: '历史删除尚未完成' })).toBeVisible();
  instance.composition.repository.database.exec('DROP TRIGGER controlled_delete_failure');
  await page.getByRole('button', { name: '恢复未完成删除', exact: true }).click();
  await dialog.getByRole('button', { name: '继续完成删除', exact: true }).click();
  await expect(dialog).toHaveCount(0); await expect(page.getByRole('heading', { name: '历史删除尚未完成' })).toHaveCount(0);
  expect((await (await page.request.get(`${base}/api/v1/maintenance`)).json()).status).toBe('AVAILABLE');
});


test('selected project module batch uses the same confirmation flow and preserves project files', async ({ page }) => {
  const source = mkdtempSync(join(tmpdir(), 'delete-module-source-'));
  try {
    writeFileSync(join(source, 'Parser.c'), 'int parse(void) { return 1; }\n');
    const project = await instance.composition.apps.workbenchProjects.create({ directory: source, revision: 'WORKTREE' });
    const store = instance.composition.apps.workbenchBatches.store;
    const batch = store.create({ projectId: project.projectId, snapshotId: project.snapshotId, moduleId: project.modules[0]!.moduleId,
      schedule: { enabled: false, intervalMinutes: null } }, 'module-delete', '2026-09-14T00:00:00Z');
    store.cancel(batch.batchId, '2026-09-14T00:01:00Z');
    await page.addInitScript(snapshotId => localStorage.setItem('workbench-project-input', snapshotId), project.snapshotId);
    await page.goto(base);
    await expect(page.locator('#selected-project-name')).not.toHaveText('选择代码目录');
    await page.getByRole('button', { name: '知识飞轮管理', exact: true }).click();
    await page.locator(`[data-module-batch-id="${batch.batchId}"]`).click();
    await page.getByRole('button', { name: '删除所选批次', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '确认删除批次' });
    await expect(dialog.getByRole('button', { name: '确认删除', exact: true })).toBeEnabled();
    await dialog.getByRole('button', { name: '确认删除', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(`[data-module-batch-id="${batch.batchId}"]`)).toHaveCount(0);
    expect(store.get(batch.batchId)).toBeNull();
    expect(readFileSync(join(source, 'Parser.c'), 'utf8')).toBe('int parse(void) { return 1; }\n');
  } finally { rmSync(source, { recursive: true, force: true }); }
});
