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
