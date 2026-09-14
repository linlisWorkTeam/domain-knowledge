/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证删除引用图的递归共享保护、完整性失败与实体引用保留。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createArtifactRef } from '../../src/domain/Domain.ts';
import { planBatchDeletion, type DeletionNode } from '../../src/domain/workbench/BatchDeletion.ts';
import { deletionArtifactSeed, expandDeletionArtifacts } from '../../src/application/services/DeletionArtifacts.ts';

function fixture() {
  const bytes = new Map<string, Uint8Array>(), reads = new Map<string, number>();
  const put = (value: unknown, type = 'application/json') => {
    const content = Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));
    const ref = createArtifactRef(content, type); bytes.set(ref.artifactId, content); return ref;
  };
  const artifacts = { get: async (ref: { artifactId: string }) => {
    reads.set(ref.artifactId, (reads.get(ref.artifactId) ?? 0) + 1);
    const content = bytes.get(ref.artifactId); if (!content) throw new Error('missing test artifact'); return content;
  } };
  const nodes: DeletionNode[] = ['a', 'b'].map(id => ({ id, kind: 'batch', revision: '1', ownedBy: [], references: [] }));
  return { bytes, reads, put, artifacts, nodes };
}
test('nested shared artifacts and JSON entity references remain protected', async () => {
  const f = fixture(), shared = f.put('shared text', 'text/plain'), privateFile = f.put('private text', 'text/plain');
  const first = f.put({ files: [shared, privateFile] }), second = f.put({ shared });
  const nodes = await expandDeletionArtifacts({ nodes: f.nodes, identities: [], artifacts: f.artifacts,
    seeds: [deletionArtifactSeed('a', first), deletionArtifactSeed('b', second)] });
  const plan = planBatchDeletion('a', nodes);
  assert.ok(plan.deleteIds.includes(`cas/${first.artifactId}`));
  assert.ok(plan.deleteIds.includes(`cas/${privateFile.artifactId}`));
  assert.ok(plan.preservedIds.includes(`cas/${shared.artifactId}`));
  assert.equal(plan.reclaimableBytes, first.size + privateFile.size);
  assert.ok([...f.reads.values()].every(reads => reads === 1));

  const referencing = f.put({ linkedVersion: 'external-identity' });
  const protectedNodes = await expandDeletionArtifacts({ nodes: f.nodes, identities: [{ value: 'external-identity', nodeId: 'a' }], artifacts: f.artifacts,
    seeds: [deletionArtifactSeed('b', referencing)] });
  assert.throws(() => planBatchDeletion('a', protectedNodes), /DELETION_TARGET_REFERENCED/);
});
test('source-owned artifacts remain even when a batch also uses them', async () => {
  const f = fixture(), ref = f.put('source', 'text/plain');
  const nodes = await expandDeletionArtifacts({ nodes: [...f.nodes, { id: 'source', kind: 'source', revision: '1', ownedBy: [], references: [] }],
    artifacts: f.artifacts, identities: [], seeds: [deletionArtifactSeed('a', ref), deletionArtifactSeed('source', ref)] });
  assert.ok(planBatchDeletion('a', nodes).preservedIds.includes(`cas/${ref.artifactId}`));
});
test('corrupt, unresolved and conflicting artifact references stop deletion planning', async () => {
  const f = fixture(), ref = f.put('original', 'text/plain');
  const input = { nodes: f.nodes, identities: [], artifacts: f.artifacts, seeds: [deletionArtifactSeed('a', ref)] };
  f.bytes.set(ref.artifactId, Buffer.from('tampered'));
  await assert.rejects(expandDeletionArtifacts(input), /DELETION_ARTIFACT_CORRUPT/);
  await assert.rejects(expandDeletionArtifacts({ ...input, seeds: [deletionArtifactSeed('a', { id: ref.artifactId })] }), /DELETION_ARTIFACT_REFERENCE_UNRESOLVED/);
  await assert.rejects(expandDeletionArtifacts({ ...input, seeds: [deletionArtifactSeed('a', [ref, { ...ref, size: ref.size + 1 }])] }), /DELETION_ARTIFACT_REFERENCE_CONFLICT/);
  const malformed = f.put('{invalid', 'application/json');
  await assert.rejects(expandDeletionArtifacts({ ...input, seeds: [deletionArtifactSeed('a', malformed)] }), /DELETION_ARTIFACT_JSON_INVALID/);
});
