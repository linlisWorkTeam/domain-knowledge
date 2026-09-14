/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：组装真实业务库、工作流图、CAS与发布文件的统一删除端口。
 */
import type { DatabaseSync } from 'node:sqlite';
import type { BatchDeletionStore } from '../../application/ports/BatchDeletionPorts.ts';
import { SqliteBatchDeletions } from './SqliteBatchDeletions.ts';
import { SqliteDeletionRecovery } from './SqliteDeletionRecovery.ts';
import { SqliteDeletionRows } from './SqliteDeletionRows.ts';
import { SqliteGraphDeletion } from './SqliteGraphDeletion.ts';
import { sqliteDeletionSnapshot } from './SqliteDeletionSnapshot.ts';
import type { SqliteDeletionRunStates } from './SqliteDeletionRunStates.ts';
import { CasDeletionFiles } from './CasDeletionFiles.ts';
import { PublishedDeletionFiles } from './PublishedDeletionFiles.ts';
import { publishedDeletionManifest } from './PublishedDeletionManifest.ts';
import { workspaceDeletionManifest } from './WorkspaceDeletionManifest.ts';
import { assertDeletionDirectoryScope } from './DeletionDirectoryScope.ts';

/** 调用者先获得完整维护排他，再创建本会话；数据库句柄由调用者关闭。 */
export function sqliteRuntimeDeletions(input: {
  databases: Record<string, DatabaseSync>; graph: { name: string; database: DatabaseSync }; journal: DatabaseSync;
  casRoot: string; publicationRoots: Record<string, string>; indexRoot: string; workbenchRoot: string; legacyRoots: string[];
  allowedRoots: string[]; sourceRoots: () => string[];
  workspaces?: { rootNames: string[]; audits: () => unknown[] };
  runStates: () => Promise<Record<string, SqliteDeletionRunStates>>;
  exclusive: BatchDeletionStore['exclusive'];
}): SqliteBatchDeletions {
  input = { ...input, databases: { ...input.databases }, graph: { ...input.graph },
    publicationRoots: { ...input.publicationRoots }, allowedRoots: [...input.allowedRoots], legacyRoots: [...input.legacyRoots] };
  const assertScope = () => assertDeletionDirectoryScope({ roots: [input.casRoot, ...Object.values(input.publicationRoots)],
    allowedRoots: input.allowedRoots, sourceRoots: input.sourceRoots() });
  assertScope();
  const workspaceRoots = Object.fromEntries((input.workspaces?.rootNames ?? []).map(name => {
    if (!input.publicationRoots[name]) throw new Error('DELETION_WORKSPACE_ROOT_UNAUTHORIZED');
    return [name, input.publicationRoots[name]!];
  }));
  const cas = new CasDeletionFiles(input.casRoot), files = new PublishedDeletionFiles(input.publicationRoots);
  const graph = new SqliteGraphDeletion(input.graph.name, input.graph.database);
  let snapshot: Awaited<ReturnType<typeof sqliteDeletionSnapshot>> | null = null;
  let states: Record<string, SqliteDeletionRunStates> = {};
  const current = () => { if (!snapshot) throw new Error('DELETION_INVENTORY_REQUIRED'); return snapshot; };
  const rows = Object.entries(input.databases).map(([name, database]) => {
    const adapter = new SqliteDeletionRows(name, database);
    return { name, database, contract: adapter.contract,
      capture: (plan: Parameters<typeof adapter.capture>[0]) => { assertScope(); current(); return adapter.capture(plan, states[name]); },
      remove: (plan: Parameters<typeof adapter.remove>[0], witness: unknown) => { assertScope(); adapter.remove(plan, witness); } };
  });
  const recovery = new SqliteDeletionRecovery(input.journal, [...rows,
    { name: input.graph.name, database: input.graph.database, contract: graph.contract,
      capture: plan => { assertScope(); current(); return graph.capture(plan); },
      remove: (plan, witness) => { assertScope(); graph.remove(plan, witness); } }],
    [{ name: 'cas', contract: cas.contract, scope: cas.scope,
      capture: plan => { assertScope(); return cas.capture(plan, current().nodes); },
      clean: (plan, witness) => { assertScope(); cas.clean(plan, witness); } },
    { name: 'published-files', contract: files.contract, scope: files.scope,
      capture: plan => { assertScope(); const record = current(); return files.capture(plan, record.publishedManifest, record.nodes); },
      clean: (plan, witness) => { assertScope(); files.clean(plan, witness); } }]);
  return new SqliteBatchDeletions({ recovery, exclusive: input.exclusive, inventory: async () => {
    assertScope(); snapshot = null; states = await input.runStates();
    snapshot = await sqliteDeletionSnapshot({ databases: input.databases, graph, runStates: states, reader: cas,
      published: { files, additional: input.workspaces ? inventory => workspaceDeletionManifest({ roots: workspaceRoots,
        inventory, audits: input.workspaces!.audits() }) : undefined, manifest: inventory => publishedDeletionManifest({ databases: input.databases, inventory,
        roots: input.publicationRoots, indexRoot: input.indexRoot, workbenchRoot: input.workbenchRoot, legacyRoots: input.legacyRoots }) } });
    assertScope(); return snapshot.nodes;
  } });
}
