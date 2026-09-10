/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证真实卡片关系证据、任务复用和版本失效，不调用模型。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createComposition } from '../../src/interfaces/runner/Composition.ts';
import { associateCards, type AssociationCard } from '../../src/domain/services/association/CardAssociations.ts';

test('symbol relations require exact same-revision evidence and never claim replacement', () => {
  const card: AssociationCard = { cardId: 'a', versionId: 'va', bodyDigest: 'da', body: '## Calls\nUse parse with Result.',
    symbol: 'parse', repositoryId: 'repo', sourceRevision: 'commit', applicability: 'Only complete buffers' };
  const target = { ...card, cardId: 'b', versionId: 'vb', bodyDigest: 'db', body: '## Result\nFields.', symbol: '@type:Result' };
  const links = associateCards([card, target]);
  assert.equal(links.length, 1); assert.equal(links[0]?.evidence.line, 2); assert.equal(links[0]?.evidence.symbol, 'Result');
  assert.equal(links[0]?.replacementVerified, false);
  assert.equal(associateCards([{ ...card, body: 'ResultExtra namespace::Result' }, target]).length, 0);
  assert.equal(associateCards([card, { ...target, sourceRevision: 'other' }]).length, 0);
  assert.equal(associateCards([card, { ...target, repositoryId: 'other' }]).length, 0);
});

test('association stage retains JSON evidence across restart and invalidates old version recommendations', async () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), 'association-runtime-')); let composition = createComposition({ runtimeDir });
  try {
    const ingest = (symbol: string, body: string) => composition.apps.flywheel.ingestCandidate({ moduleId: `unit-${symbol.toLowerCase()}`, title: symbol,
      description: 'Public API', body, tags: ['c'], provenance: [{ path: 'api.h', commit: 'commit', pinned: true }],
      metadata: { cardId: `card-${symbol}`, repositoryId: 'repo', sourceModule: 'api', language: 'c', symbol } });
    const first = await ingest('parse', '# Parse\n## Calls\nUse Result for output.');
    const second = await ingest('Result', '# Result\n## Fields\nAn integer value.');
    const third = await ingest('encode', '# Encode\n## Calls\nUse Buffer for output.');
    const fourth = await ingest('Buffer', '# Buffer\n## Fields\nA byte array.');
    const ids = [first.version.versionId, second.version.versionId, third.version.versionId, fourth.version.versionId];
    const index = composition.apps.workbenchStages.start(composition.apps.knowledgeIndex.prepare(ids));
    assert.equal((await composition.apps.workbenchStages.wait(index.taskId)).status, 'SUCCEEDED');
    const task = composition.apps.workbenchStages.start(composition.apps.workbenchAssociations.prepare(ids));
    const done = await composition.apps.workbenchStages.wait(task.taskId);
    assert.equal(done.status, 'SUCCEEDED', done.reasonCode ?? ''); assert.equal(done.result?.summary.relations, 2);
    assert.equal(done.result?.summary.externalMaterials, 0);
    assert.equal(composition.apps.workbenchStages.start(composition.apps.workbenchAssociations.prepare(ids)).taskId, task.taskId);
    await composition.close(); composition = createComposition({ runtimeDir });
    const candidates = await composition.apps.workbenchAssociations.candidates('card-parse');
    assert.equal(candidates.relations.length, 1); assert.equal(candidates.relations[0]?.toVersionId, second.version.versionId);
    await ingest('Result', '# Result\n## Fields\nA revised integer value.');
    const stale = await composition.apps.workbenchAssociations.candidates('card-parse');
    assert.equal(stale.relations.length, 0); assert.equal(stale.staleTasks, 1);
    assert.equal((await composition.apps.workbenchAssociations.candidates('card-encode')).relations.length, 1, 'unaffected pair remains readable');
  } finally { await composition.close(); rmSync(runtimeDir, { recursive: true, force: true }); }
});

test('explicit material selection binds frozen evidence, survives source deletion and invalidates revised card references', async () => {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const root = mkdtempSync(join(tmpdir(), 'external-relations-'));
  mkdirSync(join(root, 'knowledge/inbox'), { recursive: true });
  const path = join(root, 'knowledge/inbox/guide.md');
  writeFileSync(path, '# Guide\nparse accepts tokens.\nparseExtra is different.');
  const runtimeDir = join(root, 'runtime'); let composition = createComposition({ runtimeDir, repositoryRoot: root });
  try {
    const created = await composition.apps.contentGovernance.createSource({ kind: 'FILE', locator: 'knowledge/inbox/guide.md', displayName: 'Parser guide' }, { idempotencyKey: 'source', fingerprint: 'source', actor: 'test' });
    const material = await composition.apps.workbenchMaterials.capture(String(created.resourceId), 'Only JSON token parsing');
    const ingest = (body: string) => composition.apps.flywheel.ingestCandidate({ moduleId: 'parser', title: 'parse', description: 'API', body, tags: ['c'], provenance: [{ path: 'api.h', commit: 'commit', pinned: true }], metadata: { cardId: 'card-parser', repositoryId: 'repo', sourceModule: 'api', language: 'c', symbol: 'parse' } });
    const card = await ingest('# Parse\nParse complete token buffers.');
    const ids = [card.version.versionId]; const stages = composition.apps.workbenchStages;
    await stages.wait(stages.start(composition.apps.knowledgeIndex.prepare(ids)).taskId);
    const input = composition.apps.workbenchAssociations.prepare(ids, [material.materialId]);
    assert.equal(input.parameters.associationContract, 'card-associations-v2');
    assert.throws(() => composition.apps.workbenchAssociations.prepare(ids, ['missing']), /MATERIAL_NOT_FOUND/);
    assert.throws(() => composition.apps.workbenchAssociations.prepare(ids, [material.materialId, material.materialId]), /SELECTION_INVALID/);
    rmSync(path);
    const done = await stages.wait(stages.start(input).taskId);
    assert.equal(done.status, 'SUCCEEDED', done.reasonCode ?? '');
    assert.equal(done.result?.summary.externalRelations, 1); assert.equal(done.result?.summary.internalRelations, 0);
    assert.equal(done.result?.artifactRefs.length, 3, 'index, original and converted evidence are downloadable');
    const candidates = await composition.apps.workbenchAssociations.candidates('card-parser');
    assert.equal(candidates.relations.length, 0); assert.equal(candidates.externalRelations.length, 1);
    const relation = candidates.externalRelations[0]!;
    assert.equal(relation.evidence.line, 2); assert.equal(relation.sourceRevision, material.sourceRevision);
    assert.equal(relation.materialApplicability, material.applicability); assert.equal(relation.replacementVerified, false);
    assert.equal(Buffer.from((await composition.apps.workbenchMaterials.artifact(material.materialId, material.rawRef.sha256)).bytes).toString(), '# Guide\nparse accepts tokens.\nparseExtra is different.');
    assert.equal(stages.start(composition.apps.workbenchAssociations.prepare(ids, [material.materialId])).taskId, done.taskId);
    await composition.shutdown(); composition = createComposition({ runtimeDir, repositoryRoot: root });
    assert.equal((await composition.apps.workbenchAssociations.candidates('card-parser')).externalRelations.length, 1);
    await ingest('# Parse\nChanged behavior.');
    assert.equal((await composition.apps.workbenchAssociations.candidates('card-parser')).externalRelations.length, 0);
  } finally { await composition.shutdown(); rmSync(root, { recursive: true, force: true }); }
});
