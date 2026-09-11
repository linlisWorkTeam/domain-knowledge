/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：用真实SQLite和文件导出验证发布提交、恢复及幂等。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parse } from 'yaml';
import { createPublicationPreparationFixture } from '../helpers/PublicationPreparationFixture.ts';
import { WorkbenchPublications } from '../../src/application/services/WorkbenchPublications.ts';
import { SqliteWorkbenchPublications } from '../../src/infrastructure/sqlite/SqliteWorkbenchPublications.ts';
import { SqliteKnowledgeIndex } from '../../src/infrastructure/sqlite/SqliteKnowledgeIndex.ts';
import { LocalWorkbenchPublicationFiles } from '../../src/infrastructure/publication/LocalWorkbenchPublicationFiles.ts';
function eventCount(path: string) { const db = new DatabaseSync(path); try { return Number(db.prepare('SELECT COUNT(*) AS n FROM wb_publication_events').get()!.n); } finally { db.close(); } }
test('publication commits real YAML/Markdown once and preserves immutable card content', async () => {
  const root = mkdtempSync(join(tmpdir(), 'publication-transaction-')); const f = await createPublicationPreparationFixture();
  const database = join(root, 'workbench.sqlite'); const store = new SqliteWorkbenchPublications(database);
  const render = new SqliteKnowledgeIndex(database, join(root, 'index'));
  const files = new LocalWorkbenchPublicationFiles(join(root, 'published'), f.service.dependencies.artifacts);
  const app = new WorkbenchPublications({ evidence: f.service, store, files, render });
  try {
    const record = await app.publish(f.ids, f.input.fixedSuites);
    assert.equal(record.status, 'COMMITTED'); assert.equal(await files.verify(record), true);
    const markdown = readFileSync(join(root, 'published', record.publicationId, 'cards/card.md'), 'utf8');
    assert.equal(parse(markdown.split('---')[1]!).cardId, 'card'); assert.match(markdown, /## Value\nbody/);
    assert.deepEqual(await app.publish(f.ids, f.input.fixedSuites), record);
    assert.equal(store.list().length, 1); assert.equal(eventCount(database), 2);
    const cardPath = join(root, 'published', record.publicationId, 'cards/card.md');
    rmSync(cardPath); symlinkSync(join(root, 'unrelated'), cardPath);
    assert.equal(await files.verify(record), false);
    await assert.rejects(app.resume(record.publicationId), /PUBLICATION_DIRECTORY_CONFLICT/);
  } finally { render.close(); store.close(); rmSync(root, { recursive: true, force: true }); }
});
test('interruption after directory export resumes from SQLite without rewriting files or duplicating commit', async () => {
  const root = mkdtempSync(join(tmpdir(), 'publication-recovery-')); const f = await createPublicationPreparationFixture();
  const database = join(root, 'workbench.sqlite'); let store = new SqliteWorkbenchPublications(database);
  const render = new SqliteKnowledgeIndex(database, join(root, 'index'));
  const files = new LocalWorkbenchPublicationFiles(join(root, 'published'), f.service.dependencies.artifacts);
  const interrupted = new WorkbenchPublications({ evidence: f.service, store, render, files: { verify: record => files.verify(record), publish: async record => { await files.publish(record); throw new Error('SIMULATED_PROCESS_EXIT'); } } });
  try {
    await assert.rejects(interrupted.publish(f.ids, f.input.fixedSuites), /SIMULATED_PROCESS_EXIT/);
    const record = store.list()[0]!; assert.equal(record.status, 'PREPARED'); assert.equal(record.lastError, 'SIMULATED_PROCESS_EXIT');
    const path = join(root, 'published', record.publicationId, 'manifest.json'); const modified = statSync(path).mtimeMs;
    store.close(); store = new SqliteWorkbenchPublications(database);
    const restored = new WorkbenchPublications({ evidence: f.service, store, render, files });
    const committed = await restored.resume(record.publicationId); assert.equal(committed.status, 'COMMITTED'); assert.equal(committed.lastError, null);
    assert.equal(statSync(path).mtimeMs, modified); assert.deepEqual(await restored.resume(record.publicationId), committed);
    assert.equal(eventCount(database), 3);
  } finally { render.close(); store.close(); rmSync(root, { recursive: true, force: true }); }
});
