/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证真实CodeAgent会话存储的删除归属、共享保护和文件变化拒绝。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256 } from '../../src/domain/Domain.ts';
import { FileCodeAgentSessionStore } from '../../src/infrastructure/agentAdapters/companyCodeAgent/CompanyCodeAgentCliAdapter.ts';
import { sessionDeletionManifest } from '../../src/infrastructure/sqlite/SessionDeletionManifest.ts';
import { PublishedDeletionFiles } from '../../src/infrastructure/sqlite/PublishedDeletionFiles.ts';
import type { DeletionRecordInventory } from '../../src/infrastructure/sqlite/SqliteDeletionInventory.ts';
import { planBatchDeletion } from '../../src/domain/workbench/BatchDeletion.ts';
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'session-deletion-')), directory = join(root, 'sessions');
  const store = new FileCodeAgentSessionStore(directory), key = 'run:code:1'; store.save(key, 'private-session-1');
  const audit = { schemaVersion: '1.0', provider: 'company-codeagent-cli', runId: 'run', idempotencyKey: key, sessionId: 'private-session-1' };
  const inventory: DeletionRecordInventory = { nodes: [{ id: 'registry/run', kind: 'run', revision: 'r', ownedBy: [], references: [] }],
    records: [{ id: 'registry/run', database: 'registry', table: 'runs', key: { run_id: 'run' } }], unclassifiedTables: [], artifactSeeds: [] };
  return { root, directory, store, key, audit, inventory, path: join(directory, `${sha256(key)}.json`),
    read: (audits: unknown[] = [audit]) => sessionDeletionManifest({ root: directory, rootName: 'sessions', audits, inventory }),
    close: () => rmSync(root, { recursive: true, force: true }) };
}
test('confirmed session cleanup is repeatable and preserves unrelated session files without exposing IDs', () => {
  const f = fixture();
  try {
    f.store.save('other-key', 'other-session'); writeFileSync(join(f.directory, 'notes.txt'), 'keep');
    const manifest = f.read(), cleaner = new PublishedDeletionFiles({ sessions: f.directory });
    const nodes = [...f.inventory.nodes, ...cleaner.observe(manifest.files), ...manifest.protectedNodes];
    const plan = planBatchDeletion('registry/run', nodes), witness = cleaner.capture(plan, manifest.files, nodes);
    assert.equal(plan.counts.artifact, 1);
    assert.doesNotMatch(JSON.stringify({ manifest, plan, witness }), /private-session-1|run:code:1/);
    cleaner.clean(plan, witness); new PublishedDeletionFiles({ sessions: f.directory }).clean(plan, witness);
    assert.equal(f.store.load(f.key), null); assert.equal(f.store.load('other-key'), 'other-session');
    assert.equal(readFileSync(join(f.directory, 'notes.txt'), 'utf8'), 'keep');
  } finally { f.close(); }
});
test('unknown or active external co-owners retain shared sessions; missing historical files do not trigger reads', () => {
  const f = fixture();
  try {
    const unknown = { ...f.audit, runId: 'unknown' }, manifest = f.read([f.audit, unknown]);
    const cleaner = new PublishedDeletionFiles({ sessions: f.directory });
    let plan = planBatchDeletion('registry/run', [...f.inventory.nodes, ...cleaner.observe(manifest.files), ...manifest.protectedNodes]);
    assert.equal(plan.counts.artifact ?? 0, 0);
    f.inventory.nodes.push({ id: 'registry/second', kind: 'run', revision: 's', ownedBy: [], references: [], active: true });
    f.inventory.records.push({ id: 'registry/second', database: 'registry', table: 'runs', key: { run_id: 'second' } });
    const shared = f.read([f.audit, { ...f.audit, runId: 'second' }]);
    plan = planBatchDeletion('registry/run', [...f.inventory.nodes, ...cleaner.observe(shared.files)]);
    assert.equal(plan.counts.artifact ?? 0, 0);
    rmSync(f.directory, { recursive: true });
    assert.deepEqual(f.read([unknown]), { files: [], protectedNodes: [] });
  } finally { f.close(); }
});
test('changed session identity or bytes, malformed records and symbolic links reject cleanup', () => {
  const f = fixture();
  try {
    const manifest = f.read(), cleaner = new PublishedDeletionFiles({ sessions: f.directory });
    const nodes = [...f.inventory.nodes, ...cleaner.observe(manifest.files)];
    const plan = planBatchDeletion('registry/run', nodes), witness = cleaner.capture(plan, manifest.files, nodes);
    f.store.save(f.key, 'private-session-2');
    assert.throws(() => f.read(), /SESSION_IDENTITY_CHANGED/);
    assert.throws(() => cleaner.clean(plan, witness), /ARTIFACT_CORRUPT/);
    assert.equal(f.store.load(f.key), 'private-session-2');
    assert.equal(f.read([f.audit, { ...f.audit, sessionId: 'private-session-2' }]).files.length, 1);
    assert.throws(() => f.read([{ ...f.audit, idempotencyKey: null }]), /AUDIT_INVALID/);
    writeFileSync(f.path, '{'); assert.throws(() => f.read(), /FILE_INVALID/);
    rmSync(f.path); mkdirSync(join(f.root, 'source')); writeFileSync(join(f.root, 'source', 'secret.json'), '{}');
    symlinkSync(join(f.root, 'source', 'secret.json'), f.path); assert.throws(() => f.read(), /ACCESS_FAILED/);
  } finally { f.close(); }
});
