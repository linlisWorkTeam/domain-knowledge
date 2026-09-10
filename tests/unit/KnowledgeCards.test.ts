/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证稳定卡片身份、旧版本保留及摘要读取边界。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createArtifactRef, type KnowledgeVersion } from '../../src/domain/Domain.ts';
import { groupKnowledgeCards } from '../../src/domain/services/knowledge/KnowledgeCards.ts';
import { KnowledgeQueryService } from '../../src/application/services/QueryService.ts';
import type { ArtifactStore, FlywheelRepository } from '../../src/application/ports/ApplicationPorts.ts';

function version(id: string, extra: Partial<KnowledgeVersion> = {}): KnowledgeVersion {
  return { versionId: id, moduleId: 'parser', parentVersionId: null,
    bodyRef: createArtifactRef(Buffer.from(id), 'text/markdown'), provenance: [],
    status: 'CANDIDATE', qualityOutcome: 'ACCEPTED', qualityScore: 80, gateDecisionId: null,
    title: 'Parser', description: 'JSON token parser', category: 'test', tags: ['json'],
    metadata: {}, createdAt: '2026-09-10T00:00:00Z', ...extra };
}

test('same-millisecond child is current; legacy bodies and gates remain unchanged', () => {
  const parent = version('z');
  const child = version('a', { parentVersionId: 'z', title: 'Renamed' });
  const before = JSON.stringify([parent, child]);
  const cards = groupKnowledgeCards([parent, child]);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].current.versionId, 'a');
  assert.equal(cards[0].versions.length, 2);
  assert.equal(cards[0].cardId, groupKnowledgeCards([parent])[0].cardId);
  assert.equal(JSON.stringify([parent, child]), before);
});

test('repository identity separates same-named modules and survives title and revision changes', () => {
  const a = version('a', { metadata: { repositoryId: 'repo-a' } });
  const b = version('b', { metadata: { repositoryId: 'repo-b' } });
  assert.equal(groupKnowledgeCards([a, b]).length, 2);
  assert.equal(groupKnowledgeCards([a])[0].cardId,
    groupKnowledgeCards([{ ...a, title: 'New title', provenance: [{ path: 'a.c', commit: 'new' }] }])[0].cardId);
  assert.equal(groupKnowledgeCards([version('a'), version('b')]).length, 2);
});

test('explicit identity keeps independently generated versions together', () => {
  const cards = groupKnowledgeCards([version('a', { metadata: { cardId: 'stable' } }),
    version('b', { metadata: { cardId: 'stable' }, createdAt: '2026-09-11T00:00:00Z' })]);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].cardId, 'stable');
  assert.equal(cards[0].current.versionId, 'b');
});

test('corrupt cyclic lineage fails explicitly', () => {
  assert.throws(() => groupKnowledgeCards([version('a', { parentVersionId: 'b' }),
    version('b', { parentVersionId: 'a' })]), /KNOWLEDGE_LINEAGE_CYCLE/);
});

test('card directory filters current versions and never loads any body', () => {
  const rows = [version('a', { status: 'VERIFIED' }),
    version('b', { parentVersionId: 'a', title: 'Latest', status: 'CANDIDATE' })];
  const artifacts = { get() { throw new Error('BODY_MUST_NOT_LOAD'); } } as unknown as ArtifactStore;
  const repository = { listKnowledgeVersions() { return rows; } } as unknown as FlywheelRepository;
  const service = new KnowledgeQueryService(artifacts, repository);
  assert.equal(service.cards({ query: 'JSON' }).length, 1);
  assert.equal(service.cards({ statuses: ['VERIFIED'] }).length, 0);
  assert.equal(service.cards()[0].versionCount, 2);
  assert.equal(service.cards({ versionId: 'a' })[0].versionId, 'b');
  assert.deepEqual(service.cards({ versionId: 'missing' }), []);
  assert.deepEqual(service.cards({ query: 'absent' }), []);
});
