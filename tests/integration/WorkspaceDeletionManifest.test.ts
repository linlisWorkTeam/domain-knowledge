/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证角色工作区清理、共享归属保护及不跟随链接的清单读取。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalAgentWorkspace } from '../../src/domain/workspace/LocalAgentWorkspace.ts';
import { workspaceDeletionManifest, readWorkspaceAudits } from '../../src/infrastructure/sqlite/WorkspaceDeletionManifest.ts';
import { PublishedDeletionFiles } from '../../src/infrastructure/sqlite/PublishedDeletionFiles.ts';
import { planBatchDeletion } from '../../src/domain/workbench/BatchDeletion.ts';
import type { DeletionRecordInventory } from '../../src/infrastructure/sqlite/SqliteDeletionInventory.ts';
async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'workspace-deletion-')), source = join(root, 'source'), output = join(root, 'workspaces');
  mkdirSync(source); writeFileSync(join(source, 'parser.c'), 'int parse(void) { return 1; }');
  const producer = new LocalAgentWorkspace({ workspaceRoot: output, allowedSourceRoots: [source] });
  const workspace = await producer.materialize({ isolationKey: 'run:docgen:1:main:execute', role: 'doc-gen', sourceRoot: source, readablePaths: ['parser.c'] });
  const inventory: DeletionRecordInventory = { nodes: [{ id: 'registry/run', kind: 'run', revision: 'r', ownedBy: [], references: [] }],
    records: [{ id: 'registry/run', database: 'registry', table: 'runs', key: { run_id: 'run' } }], artifactSeeds: [], unclassifiedTables: [] };
  const audit = { schemaVersion: '1.0', provider: 'deepseek-harness-sdk', workspaceRoot: workspace.workspaceRoot, metadata: { runId: 'run' } };
  return { root, source, output, workspace: workspace.workspaceRoot, inventory, audit,
    read: (audits: unknown[] = [audit]) => workspaceDeletionManifest({ roots: { workspaces: output }, audits, inventory }),
    close: () => rmSync(root, { recursive: true, force: true }) };
}
test('actual role workspace files are deleted by frozen witness while source and extra files survive', async () => {
  const f = await fixture();
  try {
    writeFileSync(join(f.workspace, 'personal-note.txt'), 'keep');
    const manifest = f.read(), cleaner = new PublishedDeletionFiles({ workspaces: f.output });
    assert.equal(manifest.files.length, 2);
    const nodes = [...f.inventory.nodes, ...cleaner.observe(manifest.files), ...manifest.protectedNodes];
    const plan = planBatchDeletion('registry/run', nodes), witness = cleaner.capture(plan, manifest.files, nodes);
    assert.equal(plan.counts.artifact, 2);
    cleaner.clean(plan, witness);
    assert.equal(existsSync(join(f.workspace, 'parser.c')), false);
    assert.equal(existsSync(join(f.workspace, '.flywheel-workspace.json')), false);
    assert.equal(readFileSync(join(f.workspace, 'personal-note.txt'), 'utf8'), 'keep');
    assert.equal(readFileSync(join(f.source, 'parser.c'), 'utf8'), 'int parse(void) { return 1; }');
    new PublishedDeletionFiles({ workspaces: f.output }).clean(plan, witness);
  } finally { f.close(); }
});
test('unknown co-owner protects the workspace and fully historical audit does not read it', async () => {
  const f = await fixture();
  try {
    const unknown = { ...f.audit, metadata: { runId: 'absent' } };
    const manifest = f.read([f.audit, unknown]), cleaner = new PublishedDeletionFiles({ workspaces: f.output });
    const plan = planBatchDeletion('registry/run', [...f.inventory.nodes, ...cleaner.observe(manifest.files), ...manifest.protectedNodes]);
    assert.equal(plan.counts.artifact ?? 0, 0); assert.equal(manifest.protectedNodes.length, 1);
    rmSync(f.workspace, { recursive: true });
    assert.deepEqual(f.read([unknown]), { files: [], protectedNodes: [] });
  } finally { f.close(); }
});
test('manifest traversal, symlinks and unauthorized audit roots never become deletion files', async () => {
  const f = await fixture();
  try {
    assert.throws(() => f.read([{ ...f.audit, workspaceRoot: f.source }]), /ROOT_UNAUTHORIZED/);
    const path = join(f.workspace, '.flywheel-workspace.json'), original = readFileSync(path);
    const forged = JSON.parse(original.toString()); forged.files[0].path = '../parser.c'; forged.readablePaths[0] = '../parser.c';
    rmSync(path); writeFileSync(path, JSON.stringify(forged)); assert.throws(() => f.read(), /MANIFEST_INVALID/);
    rmSync(path); writeFileSync(join(f.source, 'manifest.json'), original); symlinkSync(join(f.source, 'manifest.json'), path);
    assert.throws(() => f.read(), /ACCESS_FAILED/);
  } finally { f.close(); }
});

test('stage workspace identity binds audit key and old headless audit still protects shared views', async () => {
  const { sha256 } = await import('../../src/domain/Domain.ts');
  const f = await fixture();
  try {
    const key = 'generation:execute', path = join(f.output, 'stage-materials', sha256(key));
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, '.flywheel-workspace.json'), JSON.stringify({ schemaVersion: '1.0', role: 'doc-gen', readablePaths: [], files: [] }));
    const stageAudit = { ...f.audit, workspaceRoot: path, idempotencyKey: key };
    assert.equal(f.read([stageAudit]).files.length, 1);
    assert.throws(() => f.read([{ ...stageAudit, idempotencyKey: 'changed' }]), /IDENTITY_INVALID/);
    f.inventory.nodes.push({ id: 'registry/second', kind: 'run', revision: 'r2', ownedBy: [], references: [] });
    f.inventory.records.push({ id: 'registry/second', database: 'registry', table: 'runs', key: { run_id: 'second' } });
    const shared = f.read([f.audit, { ...f.audit, provider: 'deepseek-harness-headless', metadata: { runId: 'second' } }]);
    const cleaner = new PublishedDeletionFiles({ workspaces: f.output });
    const plan = planBatchDeletion('registry/run', [...f.inventory.nodes, ...cleaner.observe(shared.files)]);
    assert.equal(plan.counts.artifact ?? 0, 0);
  } finally { f.close(); }
});


test('runtime audit reader accepts missing logs but rejects corrupt records and links', async () => {
  const f = await fixture();
  try {
    assert.deepEqual(readWorkspaceAudits(f.root), []);
    mkdirSync(join(f.root, 'demo'));
    const log = join(f.root, 'demo', 'agent-runs.jsonl');
    writeFileSync(log, JSON.stringify(f.audit) + '\n');
    assert.deepEqual(readWorkspaceAudits(f.root), [f.audit]);
    writeFileSync(log, JSON.stringify(f.audit) + '\n{');
    assert.throws(() => readWorkspaceAudits(f.root), /AUDIT_INVALID/);
    rmSync(log); symlinkSync(join(f.source, 'parser.c'), log);
    assert.throws(() => readWorkspaceAudits(f.root), /ACCESS_FAILED/);
  } finally { f.close(); }
});
