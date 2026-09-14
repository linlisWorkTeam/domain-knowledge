/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证工作台初始任务入口、前置状态及桌面和窄屏布局。
 */
import { test, expect } from '@playwright/test';
import { once } from 'node:events';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStageTask, type StageInput } from '../../src/domain/workbench/StageTask.ts';
import { createPipeline } from '../../src/domain/workbench/WorkbenchPipeline.ts';
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
    await expect(page.getByRole('heading', { name: '项目设置', exact: true })).toBeVisible();
    await expect(page.getByRole('list', { name: '知识任务的五个阶段' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '一键执行全部', exact: true })).toHaveCount(0);
    await expect(page.locator('[data-generation-panel]')).toHaveCount(0);
    await expect(page.getByText('分析结果', { exact: true })).toHaveCount(0);
    await expect(page.locator('[name=repositoryRevision]')).toHaveCount(0);
    expect(instance.composition.apps.workbenchStages.store.list()).toHaveLength(0);
    const input = page.getByLabel('本地代码目录', { exact: true });
    await input.fill('/tmp/example-repository');
    await expect(page.getByRole('button', { name: '读取目录', exact: true })).toBeEnabled();
    await page.screenshot({ path: test.info().outputPath('workbench-entry-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    const analyze = page.getByRole('button', { name: '读取目录', exact: true });
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
  writeFileSync(join(repository, 'README.md'), 'Local project without Git.');
  const instance = createKnowledgeServer({ runtimeDir: join(root, 'runtime'), anonymousAccess: true });
  instance.server.listen(0, '127.0.0.1'); await once(instance.server, 'listening');
  const address = instance.server.address(); if (!address || typeof address === 'string') throw new Error('TEST_SERVER_ADDRESS_INVALID');
  try {
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.getByRole('button', { name: '选择项目', exact: true }).click();
    await page.getByLabel('本地代码目录', { exact: true }).fill(repository);
    await page.getByRole('button', { name: '读取目录', exact: true }).click();
    await page.getByLabel('模块文件夹', { exact: true }).selectOption('core');
    await page.getByLabel('模块名称', { exact: true }).fill('parser-core');
    await page.getByRole('button', { name: '添加模块', exact: true }).click();
    await expect(page.locator('[data-project-module]')).toHaveCount(1);
    await expect(page.locator('[data-project-module]')).toHaveValue('parser-core');
    await page.getByRole('button', { name: '保存项目输入', exact: true }).click();
    await expect(page.locator('[data-project-summary]')).toContainText('已保存 1 个模块');
    const saved = instance.composition.apps.workbenchProjects.store.list()[0]!;
    expect(saved.commit).toMatch(/^directory:[a-f0-9]{64}$/);
    expect(saved.moduleDefinitions).toEqual([{ moduleId: 'parser-core', directories: ['core'] }]);
    expect(saved.modules[0]!.sourcePaths).toEqual(['core/parse.c']);
    await expect(page.locator('#selected-project-name')).toHaveText('source');
    await page.reload();
    await expect(page.locator('#selected-project-name')).toHaveText('source');
    await expect(page.locator('[data-repository-form]')).toHaveCount(0);
    await page.getByRole('button', { name: '＋ 新建批次', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '新建模块批次' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('批次所属模块', { exact: true })).toHaveValue('parser-core');
    await expect(dialog.locator('[data-frequency]')).toBeHidden();
    await dialog.locator('summary', { hasText: '固定测试' }).click();
    await dialog.locator('[name=fixedSuite]').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
    await expect(dialog.getByRole('button', { name: '创建批次', exact: true })).toBeDisabled();
    await expect(dialog.locator('[data-fixed-suite-status]')).toContainText('文件无效');
    await dialog.locator('[name=fixedSuite]').setInputFiles({ name: 'fixed.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ schemaVersion: 'native-cases-v1', cases: [{ caseId: 'fixed', description: 'fixed parse', sections: ['接口'], variables: [{ name: 'result', type: 'int' }], calls: [{ function: 'parse', arguments: [], result: 'result' }], observations: [{ name: 'result', kind: 'integer', read: { variable: 'result' } }], expected: { result: '1' } }] })) });
    await expect(dialog.locator('[data-fixed-suite-status]')).toContainText('1 条固定用例');
    await dialog.locator('summary', { hasText: '接口范围' }).click();
    await dialog.getByLabel('接口入口路径', { exact: true }).fill('core/parse.c');
    await dialog.locator('summary', { hasText: '外部材料' }).click();
    await dialog.getByRole('button', { name: '刷新材料', exact: true }).click();
    await expect(dialog.locator('[data-batch-material-options]')).toContainText('暂无材料快照');
    await dialog.getByRole('button', { name: '创建批次', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.batch-detail h2')).toHaveText(/^parser-core-\d{8}-1$/);
    await expect(page.locator('[name=repositoryRoot]')).toHaveCount(0);
    const batch = instance.composition.apps.workbenchBatches.store.list()[0]!;
    expect(batch.status).toBe('READY'); expect(batch.moduleId).toBe('parser-core');
    expect(batch.execution?.scope.entryPath).toBe('core/parse.c');
    expect(batch.execution?.fixedSuite?.cases[0]?.expected).toEqual({ result: '1' });
    await expect(page.locator('.batch-detail')).toContainText('固定测试 1 条 · 外部材料 0 份');
    await page.locator('.batch-detail summary', { hasText: '冻结输入' }).click();
    await expect(page.locator('.batch-detail')).toContainText('core/parse.c');
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: '下载固定测试', exact: true }).click();
    expect((await downloaded).suggestedFilename()).toBe(`${batch.batchId}.fixed.json`);

    await page.getByRole('button', { name: '新建批次', exact: true }).click();
    await dialog.getByLabel('是否自动运行', { exact: true }).selectOption('yes');
    await expect(dialog.locator('[data-frequency]')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(dialog.getByRole('button', { name: '创建批次', exact: true })).toBeInViewport();
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    expect(instance.composition.apps.workbenchBatches.store.list()).toHaveLength(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(instance.composition.apps.workbenchStages.store.list()).toHaveLength(0);
    const pipelines = instance.composition.apps.workbenchPipelines, stages = instance.composition.apps.workbenchStages.store;
    const originalStart = pipelines.start;
    let taskLease: ReturnType<typeof stages.claim>, pipelineLease: ReturnType<typeof pipelines.dependencies.store.claim> | undefined;
    pipelines.start = async (snapshotId, _scopes, _materials, _fixed, executionKey) => {
      const input: StageInput = { projectId: saved.projectId, stage: 'GENERATE', sourceRevision: saved.commit, sourceDigest: saved.sourceDigest,
        configurationDigest: 'browser-controlled', cardVersionIds: [], parameters: { snapshotId, executionKey: executionKey! } };
      const task = stages.insert(createStageTask(input, {}, new Date().toISOString())); taskLease = stages.claim(task.taskId);
      stages.event(task.taskId, taskLease!.leaseId, 'SOURCE_ANALYZED', { message: '已读取固定模块范围' });
      const pipeline = pipelines.dependencies.store.insert(createPipeline(input, new Date().toISOString(), 'browser-controlled'));
      pipelineLease = pipelines.dependencies.store.claim(pipeline.pipelineId); return pipelineLease!.value;
    };
    try {
      await page.getByRole('button', { name: '新增轮次', exact: true }).click();
      await expect(page.getByRole('button', { name: '第 1 轮', exact: true })).toBeVisible();
      await expect(page.locator('.batch-mini-graph')).not.toHaveAttribute('open', '');
      await page.locator('.batch-mini-graph > summary').click();
      await expect(page.locator('.batch-mini-graph .node-running')).toHaveCount(1);
      await page.locator('[data-batch-node]').first().click();
      await expect(page.locator('[data-batch-log]')).toHaveAttribute('open', '');
      await expect(page.locator('[data-batch-log]')).toContainText('开始执行');
      await expect(page.locator('[data-batch-log] .node-execution-log')).toContainText('过程说明');
      await expect(page.locator('[data-batch-log]')).toContainText('已读取固定模块范围');
      stages.finish(taskLease!.task.taskId, taskLease!.leaseId, 'SUCCEEDED', { artifactRefs: [], summary: { cards: [] } }, null);
      pipelineLease!.value.status = 'PAUSED'; pipelineLease!.value.reasonCode = 'PIPELINE_SOURCE_UNRESOLVED';
      pipelines.dependencies.store.save(pipelineLease!.value, pipelineLease!.leaseId, true);
      await expect(page.locator('.batch-detail')).toContainText('来源证据仍有未解决项', { timeout: 12_000 });
      await expect(page.locator('.batch-detail').getByText('PIPELINE_SOURCE_UNRESOLVED', { exact: true })).not.toBeVisible();
      await page.locator('.batch-detail').getByText('原始原因代码', { exact: true }).click();
      await expect(page.locator('.batch-detail').getByText('PIPELINE_SOURCE_UNRESOLVED', { exact: true })).toBeVisible();
      await expect(page.locator('.batch-mini-graph .node-running')).toHaveCount(0);
      await expect(page.locator('[data-batch-log]')).toHaveAttribute('open', '');
      await expect(page.locator('[data-batch-log] > summary')).toContainText('结束时间');
      await page.locator('[data-batch-filter=attention]').click();
      await expect(page.locator('[data-module-batch-id]')).toHaveCount(1);
      await page.locator('[data-batch-filter=verified]').click();
      await expect(page.locator('[data-module-batch-id]')).toHaveCount(0);
      expect(stages.get(taskLease!.task.taskId)!.usage.modelCalls).toBe(0);
    } finally {
      pipelines.start = originalStart;
      if (pipelineLease && ['PENDING', 'RUNNING'].includes(pipelines.get(pipelineLease.value.pipelineId).status)) {
        pipelineLease.value.status = 'PAUSED'; pipelines.dependencies.store.save(pipelineLease.value, pipelineLease.leaseId, true);
      }
    }

  } finally {
    instance.server.closeAllConnections();
    await new Promise<void>(resolve => instance.server.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  }
});
