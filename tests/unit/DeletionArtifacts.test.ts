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
  const reader = { read: async (artifactId: string) => {
    reads.set(artifactId, (reads.get(artifactId) ?? 0) + 1);
    return bytes.get(artifactId) ?? null;
  } };
  const nodes: DeletionNode[] = ['a', 'b'].map(id => ({ id, kind: 'batch', revision: '1', ownedBy: [], references: [] }));
  return { bytes, reads, put, reader, nodes };
}
test('nested shared artifacts and JSON entity references remain protected', async () => {
  const f = fixture(), shared = f.put('shared text', 'text/plain'), privateFile = f.put('private text', 'text/plain');
  const first = f.put({ files: [shared, privateFile] }), second = f.put({ shared });
  const { nodes } = await expandDeletionArtifacts({ nodes: f.nodes, identities: [], reader: f.reader,
    seeds: [deletionArtifactSeed('a', first), deletionArtifactSeed('b', second)] });
  const plan = planBatchDeletion('a', nodes);
  assert.ok(plan.deleteIds.includes(`cas/${first.artifactId}`));
  assert.ok(plan.deleteIds.includes(`cas/${privateFile.artifactId}`));
  assert.ok(plan.preservedIds.includes(`cas/${shared.artifactId}`));
  assert.equal(plan.reclaimableBytes, first.size + privateFile.size);
  assert.ok([...f.reads.values()].every(reads => reads === 1));

  const referencing = f.put({ linkedVersion: 'external-identity' });
  const { nodes: protectedNodes } = await expandDeletionArtifacts({ nodes: f.nodes, identities: [{ value: 'external-identity', nodeId: 'a' }], reader: f.reader,
    seeds: [deletionArtifactSeed('b', referencing)] });
  assert.throws(() => planBatchDeletion('a', protectedNodes), /DELETION_TARGET_REFERENCED/);
});
test('source-owned artifacts remain even when a batch also uses them', async () => {
  const f = fixture(), ref = f.put('source', 'text/plain');
  const { nodes } = await expandDeletionArtifacts({ nodes: [...f.nodes, { id: 'source', kind: 'source', revision: '1', ownedBy: [], references: [] }],
    reader: f.reader, identities: [], seeds: [deletionArtifactSeed('a', ref), deletionArtifactSeed('source', ref)] });
  assert.ok(planBatchDeletion('a', nodes).preservedIds.includes(`cas/${ref.artifactId}`));
});
test('corrupt and conflicting artifact references stop deletion planning', async () => {
  const f = fixture(), ref = f.put('original', 'text/plain');
  const input = { nodes: f.nodes, identities: [], reader: f.reader, seeds: [deletionArtifactSeed('a', ref)] };
  f.bytes.set(ref.artifactId, Buffer.from('tampered'));
  await assert.rejects(expandDeletionArtifacts(input), /DELETION_ARTIFACT_CORRUPT/);
  await assert.rejects(expandDeletionArtifacts({ ...input, seeds: [deletionArtifactSeed('a', [ref, { ...ref, size: ref.size + 1 }])] }), /DELETION_ARTIFACT_REFERENCE_CONFLICT/);
  const malformed = f.put('{invalid', 'application/json');
  await assert.rejects(expandDeletionArtifacts({ ...input, seeds: [deletionArtifactSeed('a', malformed)] }), /DELETION_ARTIFACT_JSON_INVALID/);
});

test('missing artifacts are explicit and restoring a file invalidates the confirmed plan', async () => {
  const f = fixture(), ref = f.put('restore me', 'text/plain');
  f.bytes.delete(ref.artifactId);
  const input = { nodes: f.nodes, identities: [], reader: f.reader, seeds: [deletionArtifactSeed('a', { artifactId: ref.artifactId })] };
  const missing = await expandDeletionArtifacts(input), first = planBatchDeletion('a', missing.nodes);
  assert.deepEqual(missing.missingArtifacts, [{ artifactId: ref.artifactId, ownerIds: ['a'] }]);
  assert.equal(first.reclaimableBytes, 0);
  f.put('restore me', 'text/plain');
  const restored = await expandDeletionArtifacts(input), next = planBatchDeletion('a', restored.nodes);
  assert.deepEqual(restored.missingArtifacts, []);
  assert.notEqual(first.planId, next.planId); assert.equal(next.reclaimableBytes, ref.size);
  await assert.rejects(expandDeletionArtifacts({ ...input, reader: { read: async () => { throw new Error('permission denied'); } } }), /permission denied/);
});

test('fingerprints are not file references even when they use the artifact hash prefix', async () => {
  const f = fixture(), ref = f.put('existing file', 'text/plain');
  const digest = `sha256:${'a'.repeat(64)}`;
  const seed = deletionArtifactSeed('a', { artifactIds: [ref.artifactId], fingerprint: digest, toolchainFingerprint: digest,
    sourceRevision: digest, subject_kind: 'RUN', subject_id: digest });
  const graph = await expandDeletionArtifacts({ nodes: f.nodes, identities: [], reader: f.reader, seeds: [seed] });
  assert.deepEqual(seed.artifactIds, [ref.artifactId]);
  assert.deepEqual(graph.missingArtifacts, []); assert.equal(f.reads.has(digest), false);
  assert.deepEqual(deletionArtifactSeed('a', { subject_kind: 'ARTIFACT', subject_id: digest }).artifactIds, [digest]);
});
