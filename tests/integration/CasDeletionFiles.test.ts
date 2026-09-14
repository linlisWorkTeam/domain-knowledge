/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证CAS物理清理限定确认清单，保留共享文件并拒绝损坏和链接。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LocalCasArtifactStore } from '../../src/infrastructure/sqlite/SqliteCas.ts';
import { CasDeletionFiles } from '../../src/infrastructure/sqlite/CasDeletionFiles.ts';
import { planBatchDeletion, type DeletionNode } from '../../src/domain/workbench/BatchDeletion.ts';

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'cas-cleanup-')), store = new LocalCasArtifactStore(root);
  const refs = await Promise.all(['first result', 'second result', 'shared source'].map(text => store.put(Buffer.from(text), 'text/plain')));
  const paths = new Map(refs.map(ref => [`cas/${ref.artifactId}`, join(root, 'sha256', ref.sha256.slice(0, 2), ref.sha256)]));
  const nodes: DeletionNode[] = [{ id: 'run', kind: 'run', revision: '1', ownedBy: [], references: [] },
    { id: 'source', kind: 'source', revision: '1', ownedBy: [], references: [] },
    ...refs.map((ref, index) => ({ id: `cas/${ref.artifactId}`, kind: 'artifact' as const, revision: ref.sha256,
      ownedBy: index === 2 ? ['run', 'source'] : ['run'], references: [], bytes: ref.size }))];
  const plan = planBatchDeletion('run', nodes), files = new CasDeletionFiles(root);
  return { root, refs, paths, nodes, plan, files, close: () => rmSync(root, { recursive: true, force: true }) };
}
test('cleanup removes only confirmed private CAS files and can repeat after reopening', async () => {
  const f = await fixture();
  try {
    const witness = f.files.capture(f.plan, f.nodes);
    f.files.clean(f.plan, witness);
    for (const id of f.plan.deleteIds.filter(id => id.startsWith('cas/'))) assert.equal(existsSync(f.paths.get(id)!), false);
    assert.equal(readFileSync(f.paths.get(`cas/${f.refs[2]!.artifactId}`)!, 'utf8'), 'shared source');
    new CasDeletionFiles(f.root).clean(f.plan, JSON.parse(JSON.stringify(witness)));
  } finally { f.close(); }
});
test('corrupt remaining files stop preflight before any other file is removed', async () => {
  const f = await fixture();
  try {
    const witness = f.files.capture(f.plan, f.nodes), [first, second] = witness.files;
    writeFileSync(f.paths.get(second!.id)!, 'corrupt');
    assert.throws(() => f.files.clean(f.plan, witness), /DELETION_ARTIFACT_CORRUPT/);
    assert.equal(existsSync(f.paths.get(first!.id)!), true);
  } finally { f.close(); }
});
test('a persisted file witness resumes when an earlier file is already absent', async () => {
  const f = await fixture();
  try {
    const witness = f.files.capture(f.plan, f.nodes);
    unlinkSync(f.paths.get(witness.files[0]!.id)!);
    new CasDeletionFiles(f.root).clean(f.plan, JSON.parse(JSON.stringify(witness)));
    assert.equal(existsSync(f.paths.get(witness.files[1]!.id)!), false);
  } finally { f.close(); }
});
test('a file missing at preview cannot be removed if it reappears after confirmation', async () => {
  const f = await fixture();
  try {
    const id = `cas/${f.refs[0]!.artifactId}`, path = f.paths.get(id)!, bytes = readFileSync(path);
    unlinkSync(path);
    const nodes = f.nodes.map(node => node.id === id ? { ...node, revision: `missing:${f.refs[0]!.sha256}`, bytes: 0 } : node);
    const plan = planBatchDeletion('run', nodes), witness = f.files.capture(plan, nodes);
    writeFileSync(path, bytes);
    assert.throws(() => f.files.clean(plan, witness), /DELETION_ARTIFACT_CHANGED/);
    assert.deepEqual(readFileSync(path), bytes);
  } finally { f.close(); }
});
test('symlink substitution and witnesses outside the plan cannot delete external or shared content', async () => {
  const f = await fixture();
  try {
    const witness = f.files.capture(f.plan, f.nodes), path = f.paths.get(witness.files[0]!.id)!;
    const external = join(f.root, 'external-evidence'), bytes = readFileSync(path); writeFileSync(external, bytes);
    unlinkSync(path); symlinkSync(external, path);
    assert.throws(() => f.files.clean(f.plan, witness), /DELETION_ARTIFACT_ACCESS_FAILED/);
    assert.deepEqual(readFileSync(external), bytes);
    assert.throws(() => f.files.clean(f.plan, { ...witness, files: [...witness.files,
      { id: `cas/${f.refs[2]!.artifactId}`, present: true, size: f.refs[2]!.size }] }), /DELETION_FILE_WITNESS_INVALID/);
    assert.throws(() => f.files.clean(f.plan, { ...witness, files: [{ id: 'cas/../../external-evidence', present: true, size: 1 }] }), /DELETION_FILE_WITNESS_INVALID/);
  } finally { f.close(); }
});
