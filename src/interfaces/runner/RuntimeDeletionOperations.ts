/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：在公共维护会话内打开删除存储并执行预览、确认和持久恢复。
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BatchDeletions } from '../../application/services/BatchDeletions.ts';
import type { RuntimeMaintenance } from '../../application/services/RuntimeMaintenance.ts';
import type { BatchDeletionReceipt } from '../../application/ports/BatchDeletionPorts.ts';
import { sqliteRuntimeDeletions } from '../../infrastructure/sqlite/SqliteRuntimeDeletions.ts';
import { sqliteDeletionRecordId } from '../../infrastructure/sqlite/SqliteDeletionInventory.ts';
import { initializeDeletionRecoveryJournal } from '../../infrastructure/sqlite/SqliteDeletionRecovery.ts';
import type { SqliteDeletionRunStates } from '../../infrastructure/sqlite/SqliteDeletionRunStates.ts';
import { readWorkspaceAudits } from '../../infrastructure/sqlite/WorkspaceDeletionManifest.ts';
import { assertDeletionDirectoryScope } from '../../infrastructure/sqlite/DeletionDirectoryScope.ts';
type Kind = 'runs' | 'batches';
interface Options {
  runtimeDir: string; allowedRoots: string[]; maintenance: RuntimeMaintenance;
  sourceRoots: () => Promise<string[]>; publicationDirectory: () => string;
  runStates: (database: DatabaseSync) => Promise<SqliteDeletionRunStates>;
  evaluationArtifactsDirectory?: string;
}
export class RuntimeDeletionOperations {
  private readonly options: Options;
  constructor(options: Options) { this.options = options; }
  private target(kind: Kind, id: string): string {
    if (!['runs', 'batches'].includes(kind) || typeof id !== 'string' || !id || id.length > 512) throw new Error('DELETION_TARGET_NOT_FOUND');
    return kind === 'runs' ? sqliteDeletionRecordId('registry', 'runs', { run_id: id }) : sqliteDeletionRecordId('workbench', 'wb_batches', { batch_id: id });
  }
  private async session<T>(work: (app: BatchDeletions, pending: () => BatchDeletionReceipt[]) => Promise<T>, recovery = false): Promise<T> {
    const options = this.options;
    const execute = async () => {
      const sourceRoots = await options.sourceRoots(), root = options.runtimeDir;
      if (options.evaluationArtifactsDirectory && existsSync(options.evaluationArtifactsDirectory) && readdirSync(options.evaluationArtifactsDirectory).length) throw new Error('DELETION_RETAINED_EVALUATION_UNSUPPORTED');
      const dshRoots = { 'dsh-homes': join(root, 'dsh'), 'dsh-homes-configured': join(root, 'dsh-configured') };
      const roots = { legacy: options.publicationDirectory(), index: join(root, 'card-index'), workbench: join(root, 'publications'),
        workspaces: join(root, 'agent-workspaces'), sessions: join(root, 'codeagent', 'sessions') };
      const casRoot = join(root, 'cas');
      assertDeletionDirectoryScope({ roots: [casRoot, ...Object.values(roots), ...Object.values(dshRoots)], allowedRoots: options.allowedRoots, sourceRoots });
      for (const directory of [...Object.values(roots), ...Object.values(dshRoots), join(root, 'workflow')]) mkdirSync(directory, { recursive: true, mode: 0o700 });
      const opened: DatabaseSync[] = [];
      const open = (path: string) => { const database = new DatabaseSync(path); opened.push(database); database.exec('PRAGMA busy_timeout=3000'); return database; };
      try {
        const databases = { registry: open(join(root, 'registry.sqlite')), workbench: open(join(root, 'workbench.sqlite')), legacy: open(join(root, 'publications.sqlite')) };
        const graph = open(join(root, 'workflow', 'checkpoints.sqlite'));
        const journal = open(join(root, 'deletion-recovery.sqlite')); initializeDeletionRecoveryJournal(journal);
        const audits = () => readWorkspaceAudits(root);
        const store = sqliteRuntimeDeletions({ databases, graph: { name: 'graph', database: graph }, journal, casRoot,
          publicationRoots: roots, indexRoot: 'index', workbenchRoot: 'workbench', legacyRoots: ['legacy'],
          allowedRoots: options.allowedRoots, sourceRoots: () => sourceRoots,
          workspaces: { rootNames: ['workspaces'], audits }, sessions: { rootName: 'sessions', audits }, dshHomes: { roots: dshRoots, audits },
          runStates: async () => ({ registry: await options.runStates(databases.registry) }),
          exclusive: async action => action() }); // 外层已经持有完整维护排他，不能再次获取。
        return await work(new BatchDeletions(store), () => store.pending());
      } finally { for (const database of opened.reverse()) database.close(); }
    };
    if (recovery) return options.maintenance.recover(execute);
    const operation = options.maintenance.enter();
    try { return await operation.exclusive(execute); } finally { operation.release(); }
  }
  preview(kind: Kind, id: string) { const target = this.target(kind, id); return this.session(app => app.preview(target)); }
  confirm(kind: Kind, id: string, confirmation: unknown) {
    const target = this.target(kind, id);
    return this.session(app => app.confirm(target, confirmation), this.options.maintenance.status === 'RECOVERY_REQUIRED');
  }
  recover(kind: Kind, id: string, planId: string) {
    const target = this.target(kind, id); return this.session(app => app.recover(target, planId), true);
  }
  recoverPending(planId: string) {
    return this.session((app, pending) => {
      const receipt = pending().find(item => item.plan.planId === planId);
      if (!receipt) throw new Error('DELETION_RECEIPT_NOT_FOUND');
      return app.recover(receipt.plan.targetId, planId);
    }, true);
  }
  pending() { return this.session(async (_app, pending) => pending(), true); }
}
