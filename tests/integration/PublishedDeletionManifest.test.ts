/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证发布和索引删除清单来自真实输出，拒绝路径与收据错配。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, symlinkSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sha256 } from '../../src/domain/Domain.ts';
import { createPublication } from '../../src/domain/workbench/WorkbenchPublicationRecord.ts';
import type { CardIndexEntry, CardIndexHeader } from '../../src/domain/knowledge/KnowledgeIndex.ts';
import { LocalMarkdownPublisher } from '../../src/infrastructure/publication/LocalMarkdownPublisher.ts';
import { LocalWorkbenchPublicationFiles } from '../../src/infrastructure/publication/LocalWorkbenchPublicationFiles.ts';
import { LocalCasArtifactStore } from '../../src/infrastructure/sqlite/SqliteCas.ts';
import { SqliteWorkbenchPublications } from '../../src/infrastructure/sqlite/SqliteWorkbenchPublications.ts';
import { SqliteKnowledgeIndex } from '../../src/infrastructure/sqlite/SqliteKnowledgeIndex.ts';
import { sqliteDeletionInventory } from '../../src/infrastructure/sqlite/SqliteDeletionInventory.ts';
import { planBatchDeletion, type DeletionNode } from '../../src/domain/workbench/BatchDeletion.ts';
import { sqliteDeletionSnapshot } from '../../src/infrastructure/sqlite/SqliteDeletionSnapshot.ts';
import { CasDeletionReader } from '../../src/infrastructure/sqlite/CasDeletionReader.ts';
import { PublishedDeletionFiles } from '../../src/infrastructure/sqlite/PublishedDeletionFiles.ts';
import { publishedDeletionManifest } from '../../src/infrastructure/sqlite/PublishedDeletionManifest.ts';
async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'published-manifest-'));
  const roots = { legacy: join(root, 'knowledge'), index: join(root, 'index'), workbench: join(root, 'publications') };
  const legacy = new LocalMarkdownPublisher({ runtimeDir: root, defaultDirectory: roots.legacy, directoryRoots: [root] });
  const receipt = await legacy.publish({ publicationKey: 'old-key', gateDecisionId: 'gate', runId: 'run', versionId: 'version', moduleId: 'module',
    title: 'card', body: '# Private knowledge\n', sourceCommit: 'abc', sourceDigest: 'digest', evidenceRefs: ['evidence'] });
  const cas = new LocalCasArtifactStore(join(root, 'cas'));
  const workbenchFile = join(root, 'workbench.sqlite'), index = new SqliteKnowledgeIndex(workbenchFile, roots.index);
  const header: CardIndexHeader = { cardId: 'card/中文', versionId: 'version', name: 'card', purpose: 'test', applicability: '', language: 'c', module: 'm', keywords: [], sourceVersions: [], summary: 'summary' };
  const text = index.render(header, '# Private indexed body');
  const markdownRef = await cas.put(Buffer.from(text.markdown), 'text/markdown'), yamlRef = await cas.put(Buffer.from(text.yaml), 'text/yaml');
  const entry: CardIndexEntry = { schemaVersion: 'card-index-v1', cardId: header.cardId, versionId: header.versionId,
    sourceDigest: sha256('source'), bodyDigest: sha256('body'), header, yamlRef, markdownRef, updatedAt: new Date().toISOString() };
  index.save(entry); index.write(entry.cardId, text.markdown);
  const evidence = await cas.put(Buffer.from('{}'), 'application/json');
  const publication = createPublication({ projectId: 'project', versionIds: ['version'], preparationRef: evidence,
    files: [{ path: 'manifest.json', ref: evidence }, { path: 'cards/card.md', ref: markdownRef }] }, new Date().toISOString());
  const store = new SqliteWorkbenchPublications(workbenchFile); store.insert(publication);
  await new LocalWorkbenchPublicationFiles(roots.workbench, cas).publish(publication); store.commit(publication.publicationId);
  const databases = { workbench: new DatabaseSync(workbenchFile), legacy: new DatabaseSync(join(root, 'publications.sqlite')) };
  const input = () => ({ databases, inventory: sqliteDeletionInventory(databases), roots,
    indexRoot: 'index', workbenchRoot: 'workbench', legacyRoots: ['legacy'] });
  return { root, roots, receipt, databases, input, close: () => { Object.values(databases).forEach(db => db.close());
    index.close(); store.close(); legacy.close(); rmSync(root, { recursive: true, force: true }); } };
}
test('legacy publication, workbench export and index manifest match the bytes written by their real publishers', async () => {
  const f = await fixture();
  try {
    const files = publishedDeletionManifest(f.input());
    assert.equal(files.length, 5);
    for (const file of files) {
      const bytes = readFileSync(join(f.roots[file.root as keyof typeof f.roots], file.path));
      assert.equal(sha256(bytes), file.sha256); assert.equal(bytes.byteLength, file.size);
      assert.equal(file.ownedBy.length, 1);
      assert.ok(f.input().inventory.nodes.some(node => node.id === file.ownedBy[0]));
    }
    assert.doesNotMatch(JSON.stringify(files), /Private knowledge|Private indexed body/);
    assert.ok(files.some(file => file.root === 'index' && !file.path.includes('/')));
  } finally { f.close(); }
});
test('receipt path outside authorized roots and mismatched run identity cannot become deletion paths', async () => {
  const f = await fixture();
  try {
    f.databases.legacy.prepare('UPDATE local_publications_v1 SET receipt_json=?').run(JSON.stringify({ ...f.receipt, path: '/arbitrary/Knowledge.md' }));
    assert.throws(() => publishedDeletionManifest(f.input()), /DELETION_PUBLICATION_ROOT_UNAUTHORIZED/);
    f.databases.legacy.prepare('UPDATE local_publications_v1 SET receipt_json=?').run(JSON.stringify({ ...f.receipt, runId: 'other-run' }));
    assert.throws(() => publishedDeletionManifest(f.input()), /DELETION_PUBLICATION_RECORD_INVALID/);
  } finally { f.close(); }
});
test('modified database rows invalidate the inventory used to derive published files', async () => {
  const f = await fixture();
  try {
    const input = f.input();
    f.databases.legacy.exec("UPDATE local_publications_v1 SET fingerprint='changed'");
    assert.throws(() => publishedDeletionManifest(input), /DELETION_RECORD_CHANGED/);
    assert.throws(() => publishedDeletionManifest(f.input()), /DELETION_PUBLICATION_RECORD_INVALID/);
  } finally { f.close(); }
});

function deletion(f: Awaited<ReturnType<typeof fixture>>) {
  const input = f.input(), manifest = publishedDeletionManifest(input), files = new PublishedDeletionFiles(f.roots);
  const kinds = new Map(input.inventory.records.map(record => [record.id, record.table]));
  const nodes: DeletionNode[] = [{ id: 'batch', kind: 'batch', revision: '1', ownedBy: [], references: [] },
    { id: 'source', kind: 'source', revision: '1', ownedBy: [], references: [] },
    ...input.inventory.nodes.map(node => ['local_publications_v1', 'wb_publications'].includes(kinds.get(node.id) ?? '')
      ? { ...node, ownedBy: ['batch'] } : kinds.get(node.id) === 'wb_card_index' ? { ...node, ownedBy: ['source'] } : node), ...files.observe(manifest)];
  const plan = planBatchDeletion('batch', nodes);
  return { manifest, files, nodes, plan, witness: files.capture(plan, manifest, nodes) };
}
test('published cleanup preserves unrelated index and unknown directory members, and resumes after reopening', async () => {
  const f = await fixture();
  try {
    const d = deletion(f), note = join(f.roots.legacy, sha256('old-key'), 'MyNotes.txt');
    writeFileSync(note, 'user notes');
    assert.equal(d.witness.files.length, 4);
    d.files.clean(d.plan, d.witness);
    for (const file of d.witness.files) assert.equal(existsSync(join(f.roots[file.root as keyof typeof f.roots], file.path)), false);
    const index = d.manifest.find(file => file.root === 'index')!;
    assert.equal(existsSync(join(f.roots.index, index.path)), true);
    assert.equal(readFileSync(note, 'utf8'), 'user notes');
    assert.equal(existsSync(join(f.roots.legacy, '.knowledge-publications')), true);
    new PublishedDeletionFiles(f.roots).clean(d.plan, JSON.parse(JSON.stringify(d.witness)));
  } finally { f.close(); }
});
test('published cleanup rejects a symlink replacement without touching external content', async () => {
  const f = await fixture();
  try {
    const d = deletion(f), file = d.witness.files[0]!, path = join(f.roots[file.root as keyof typeof f.roots], file.path);
    const bytes = readFileSync(path), external = join(f.root, 'external-evidence'); writeFileSync(external, bytes);
    unlinkSync(path); symlinkSync(external, path);
    assert.throws(() => d.files.clean(d.plan, d.witness), /DELETION_ARTIFACT_ACCESS_FAILED/);
    assert.deepEqual(readFileSync(external), bytes);
    for (const other of d.witness.files.slice(1)) assert.equal(existsSync(join(f.roots[other.root as keyof typeof f.roots], other.path)), true);
  } finally { f.close(); }
});
test('publication observation rejects traversal even when an attacker recomputes the file identity', async () => {
  const f = await fixture();
  try {
    const manifest = publishedDeletionManifest(f.input()), original = manifest[0]!, path = '../external';
    const changed = { ...original, path, id: `published-files/${sha256(JSON.stringify([original.root, path]))}` };
    assert.throws(() => new PublishedDeletionFiles(f.roots).observe([changed]), /DELETION_FILE_PATH_INVALID/);
  } finally { f.close(); }
});

test('combined deletion snapshot includes observed exports and detects changes during CAS reads', async () => {
  const f = await fixture();
  try {
    const files = new PublishedDeletionFiles(f.roots), reader = new CasDeletionReader(join(f.root, 'cas'));
    await assert.rejects(sqliteDeletionSnapshot({ databases: f.databases, reader }), /DELETION_PUBLICATION_SCOPE_REQUIRED/);
    const published = { files, manifest: (inventory: ReturnType<typeof sqliteDeletionInventory>) => publishedDeletionManifest({ ...f.input(), inventory }) };
    const snapshot = await sqliteDeletionSnapshot({ databases: f.databases, reader, published });
    assert.equal(snapshot.publishedManifest.length, 5);
    assert.equal(snapshot.nodes.filter(node => node.id.startsWith('published-files/')).length, 5);
    const file = snapshot.publishedManifest[0]!, path = join(f.roots[file.root as keyof typeof f.roots], file.path);
    await assert.rejects(sqliteDeletionSnapshot({ databases: f.databases, published, reader: {
      read: async (id, limit) => { writeFileSync(path, 'changed during scan'); return reader.read(id, limit); },
    } }), /DELETION_ARTIFACT_CORRUPT/);
  } finally { f.close(); }
});
