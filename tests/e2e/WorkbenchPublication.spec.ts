/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：通过完整Console验证冻结项目选择、发布门禁入口及桌面/窄屏下载。
 */
import { test, expect } from '@playwright/test';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createKnowledgeServer } from '../../src/interfaces/runner/Server.ts';
import { createStageTask } from '../../src/domain/services/workbench/StageTask.ts';
import { WorkbenchPublications } from '../../src/application/services/WorkbenchPublications.ts';
import { LocalWorkbenchPublicationFiles } from '../../src/infrastructure/publication/LocalWorkbenchPublicationFiles.ts';
import { createPublicationPreparationFixture } from '../helpers/PublicationPreparationFixture.ts';

test('saved project to verified publication remains usable without login on desktop and narrow screens', async ({ page }) => {
  const root = mkdtempSync(join(tmpdir(), 'workbench-publication-browser-'));
  const instance = createKnowledgeServer({ runtimeDir: root, anonymousAccess: true, writeToken: 'legacy-unused-token' });
  const fixture = await createPublicationPreparationFixture();
  const prior = instance.composition.apps.workbenchPublications;
  const publications = new WorkbenchPublications({ ...prior.dependencies, evidence: fixture.service,
    files: new LocalWorkbenchPublicationFiles(join(root, 'browser-publications'), fixture.service.dependencies.artifacts) });
  instance.composition.apps.workbenchPublications = publications;
  // Controlled gate evidence, copied unchanged; this is browser integration, not a real model run.
  for (const bytes of fixture.contents.values()) await instance.composition.artifacts.put(bytes, 'application/json');
  instance.composition.apps.workbenchProjects.store.save(fixture.project);
  for (const task of [fixture.input.reconstruction, fixture.input.evaluation, fixture.input.fixedEvaluation, fixture.input.sourceVerification]) instance.composition.apps.workbenchStages.store.insert(task);
  const generated = createStageTask({ projectId: fixture.project.projectId, sourceRevision: fixture.project.commit,
    sourceDigest: fixture.project.sourceDigest, configurationDigest: fixture.input.reconstruction.input.configurationDigest,
    stage: 'GENERATE', cardVersionIds: [], parameters: { snapshotId: fixture.project.snapshotId } }, {}, new Date().toISOString());
  instance.composition.apps.workbenchStages.store.insert({ ...generated, status: 'SUCCEEDED', result: { artifactRefs: [], summary: { cards: [{ cardId: 'card', versionId: 'version', title: 'Fixture card', quality: 'CANDIDATE' }] } } });
  instance.server.listen(0, '127.0.0.1'); await once(instance.server, 'listening');
  const address = instance.server.address(); if (!address || typeof address === 'string') throw new Error('TEST_SERVER_ADDRESS_INVALID');
  try {
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.locator('[data-project-history-select]').selectOption(fixture.project.snapshotId);
    await expect(page.locator('[data-project-history]')).toContainText('已载入冻结输入');
    const panel = page.locator('[data-workbench-publication-panel]');
    await panel.locator('[data-publication-select="evaluation"]').selectOption(fixture.ids.evaluation);
    await panel.locator('[data-publication-select="fixed"]').selectOption(fixture.ids.fixedEvaluation);
    await panel.locator('[data-publication-select="source"]').selectOption(fixture.ids.sourceVerification);
    await expect(panel.getByRole('button', { name: '验证并发布知识', exact: true })).toBeEnabled();
    await panel.getByRole('button', { name: '验证并发布知识', exact: true }).click();
    await expect(panel.getByRole('heading', { name: '已验证并发布', exact: true })).toBeVisible();
    expect(publications.list().length).toBe(1);
    const download = page.waitForEvent('download');
    await panel.getByRole('button', { name: '下载 cards/card.md', exact: true }).click();
    expect((await download).suggestedFilename()).toContain('card');
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath('publication-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    const button = panel.getByRole('button', { name: '下载 cards/card.md', exact: true });
    await button.scrollIntoViewIfNeeded(); await expect(button).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('publication-narrow.png'), fullPage: true });
    await page.reload();
    await page.locator('[data-project-history-select]').selectOption(fixture.project.snapshotId);
    await expect(page.locator('[data-workbench-publication-panel]')).toContainText('已验证并发布');
    expect(publications.list().length).toBe(1);
  } finally {
    await publications.shutdown(); instance.server.closeAllConnections();
    await new Promise<void>(resolve => instance.server.close(() => resolve())); rmSync(root, { recursive: true, force: true });
  }
});
