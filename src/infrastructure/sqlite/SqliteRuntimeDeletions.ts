/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：组装真实业务库、工作流图、CAS与发布文件的统一删除端口。
 */
import type { DatabaseSync } from 'node:sqlite';
import type { BatchDeletionStore } from '../../application/ports/BatchDeletionPorts.ts';
import { SqliteBatchDeletions } from './SqliteBatchDeletions.ts';
import { DshHomeDeletionFiles } from './DshHomeDeletionFiles.ts';
import { SqliteDeletionRecovery, type DeletionFileParticipant } from './SqliteDeletionRecovery.ts';
import { SqliteDeletionRows } from './SqliteDeletionRows.ts';
import { SqliteGraphDeletion } from './SqliteGraphDeletion.ts';
import { sqliteDeletionSnapshot } from './SqliteDeletionSnapshot.ts';
import type { SqliteDeletionRunStates } from './SqliteDeletionRunStates.ts';
import { CasDeletionFiles } from './CasDeletionFiles.ts';
import { PublishedDeletionFiles } from './PublishedDeletionFiles.ts';
import { publishedDeletionManifest } from './PublishedDeletionManifest.ts';
import { sessionDeletionManifest } from './SessionDeletionManifest.ts';
import { workspaceDeletionManifest } from './WorkspaceDeletionManifest.ts';
import { assertDeletionDirectoryScope } from './DeletionDirectoryScope.ts';

/** 调用者先获得完整维护排他，再创建本会话；数据库句柄由调用者关闭。 */
export function sqliteRuntimeDeletions(input: {
  databases: Record<string, DatabaseSync>; graph: { name: string; database: DatabaseSync }; journal: DatabaseSync;
  casRoot: string; publicationRoots: Record<string, string>; indexRoot: string; workbenchRoot: string; legacyRoots: string[];
  allowedRoots: string[]; sourceRoots: () => string[];
  workspaces?: { rootNames: string[]; audits: () => unknown[] };
  sessions?: { rootName: string; audits: () => unknown[] };
  dshHomes?: { roots: Record<string, string>; audits: () => unknown[] };
  runStates: () => Promise<Record<string, SqliteDeletionRunStates>>;
  exclusive: BatchDeletionStore['exclusive'];
}): SqliteBatchDeletions {
  input = { ...input, databases: { ...input.databases }, graph: { ...input.graph },
    publicationRoots: { ...input.publicationRoots },
    dshHomes: input.dshHomes ? { ...input.dshHomes, roots: { ...input.dshHomes.roots } } : undefined, allowedRoots: [...input.allowedRoots], legacyRoots: [...input.legacyRoots] };
  const assertScope = () => assertDeletionDirectoryScope({ roots: [input.casRoot, ...Object.values(input.publicationRoots), ...Object.values(input.dshHomes?.roots ?? {})],
    allowedRoots: input.allowedRoots, sourceRoots: input.sourceRoots() });
  assertScope();
  const workspaceRoots = Object.fromEntries((input.workspaces?.rootNames ?? []).map(name => {
    if (!input.publicationRoots[name]) throw new Error('DELETION_WORKSPACE_ROOT_UNAUTHORIZED');
    return [name, input.publicationRoots[name]!];
  }));
  if (input.sessions && !input.publicationRoots[input.sessions.rootName]) throw new Error('DELETION_SESSION_ROOT_UNAUTHORIZED');
  const cas = new CasDeletionFiles(input.casRoot), files = new PublishedDeletionFiles(input.publicationRoots);
  const dsh = Object.entries(input.dshHomes?.roots ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([name, root]) => ({
    files: new DshHomeDeletionFiles(root, name), homes: [] as ReturnType<DshHomeDeletionFiles['observe']>['homes'],
  }));
  const dshParticipants: DeletionFileParticipant[] = dsh.map(item => ({ name: item.files.name, contract: item.files.contract, scope: item.files.scope,
    capture: plan => { assertScope(); current(); return item.files.capture(plan, item.homes); },
    clean: (plan, witness) => { assertScope(); item.files.clean(plan, witness); } }));
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
      clean: (plan, witness) => { assertScope(); files.clean(plan, witness); } }, ...dshParticipants]);
  return new SqliteBatchDeletions({ recovery, exclusive: input.exclusive, inventory: async () => {
    assertScope(); snapshot = null; states = await input.runStates();
    snapshot = await sqliteDeletionSnapshot({ databases: input.databases, graph, runStates: states, reader: cas,
      published: { files, additional: inventory => {
        const workspace = input.workspaces ? workspaceDeletionManifest({ roots: workspaceRoots, inventory, audits: input.workspaces.audits() }) : { files: [], protectedNodes: [] };
        const session = input.sessions ? sessionDeletionManifest({ rootName: input.sessions.rootName,
          root: input.publicationRoots[input.sessions.rootName]!, inventory, audits: input.sessions.audits() }) : { files: [], protectedNodes: [] };
        const audit = input.dshHomes?.audits() ?? [];
        const dshInventories = dsh.map(item => { const observed = item.files.observe(audit, inventory); item.homes = observed.homes; return observed; });
        let entries = 0, bytes = 0;
        for (const observed of dshInventories) for (const home of observed.homes) for (const entry of home.entries) { entries++; bytes += entry.size; }
        if (entries > 100000 || bytes > 128 * 1024 * 1024) throw new Error('DELETION_INVENTORY_TOO_LARGE');
        const dshNodes = dshInventories.flatMap(observed => observed.nodes);
        return { files: [...workspace.files, ...session.files], nodes: [...workspace.protectedNodes, ...session.protectedNodes, ...dshNodes] };
      }, manifest: inventory => publishedDeletionManifest({ databases: input.databases, inventory,
        roots: input.publicationRoots, indexRoot: input.indexRoot, workbenchRoot: input.workbenchRoot, legacyRoots: input.legacyRoots }) } });
    assertScope(); return snapshot.nodes;
  } });
}
