/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：冻结实际删除行，复核摘要并保留工作台执行墓碑、用量及批次编号。
 */
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { sha256 } from '../../domain/Domain.ts';
import type { BatchDeletionPlan } from '../../domain/workbench/BatchDeletion.ts';
import { sqliteDeletionInventory } from './SqliteDeletionInventory.ts';
import type { SqliteDeletionRunStates } from './SqliteDeletionRunStates.ts';

interface FrozenRow { id: string; table: string; key: Record<string, string | number>; revision: string; usage: unknown }
interface RowWitness { contract: 'deletion-rows-v2'; database: string; rows: FrozenRow[] }
const executionKeys: Record<string, string> = { runs: 'run_id', wb_batches: 'batch_id', wb_pipelines: 'id', wb_stage_tasks: 'task_id' };
const removable = new Set([
  ...Object.keys(executionKeys), 'wb_stage_events', 'wb_stage_checkpoints', 'wb_pipeline_events', 'wb_card_index',
  'wb_publications', 'wb_publication_events', 'wb_native_test_sets', 'evaluations', 'gate_decisions', 'events',
  'checkpoints', 'checkpoint_owners', 'workflow_node_projections', 'action_items', 'action_item_sources',
  'action_item_history', 'feedback', 'knowledge_versions', 'publications', 'local_publications_v1',
]);
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;

/** 仅在维护屏障与本库写事务内执行 remove；不自行提交，不接收客户端SQL或路径。 */
export class SqliteDeletionRows {
  readonly contract = 'deletion-rows-v2';
  private readonly name: string;
  private readonly db: DatabaseSync;
  constructor(name: string, database: DatabaseSync) {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(name)) throw new Error('DELETION_DATABASE_INVALID');
    this.name = name; this.db = database;
    database.exec('PRAGMA foreign_keys=ON');
    if (database.prepare('PRAGMA foreign_keys').get()!.foreign_keys !== 1) throw new Error('DELETION_FOREIGN_KEYS_REQUIRED');
    database.exec(`CREATE TABLE IF NOT EXISTS deletion_execution_tombstones(
      table_name TEXT NOT NULL,execution_id TEXT NOT NULL,plan_id TEXT NOT NULL,revision TEXT NOT NULL,usage_json TEXT NOT NULL,
      PRIMARY KEY(table_name,execution_id))`);
    // 同一冻结输入不能在删除后重建成零预算的新任务；编号与命令表不删除。
    for (const [table, key] of Object.entries(executionKeys)) if (this.exists(table)) {
      for (const action of ['INSERT', 'UPDATE']) database.exec(`CREATE TRIGGER IF NOT EXISTS ${quote(`deleted_${table}_${action.toLowerCase()}`)}
        BEFORE ${action} ON ${quote(table)} WHEN EXISTS(SELECT 1 FROM deletion_execution_tombstones WHERE table_name='${table}' AND execution_id=NEW.${quote(key)})
        BEGIN SELECT RAISE(ABORT,'EXECUTION_DELETED'); END`);
    }
    // 旧运行保留最小父行以维护配置外键，但不能再向它提交新结果或重新领取检查点。
    for (const table of ['events', 'evaluations', 'gate_decisions', 'checkpoints', 'workflow_node_projections', 'run_configuration_snapshots']) if (this.exists(table)) {
      for (const action of ['INSERT', 'UPDATE']) database.exec(`CREATE TRIGGER IF NOT EXISTS ${quote(`deleted_run_${table}_${action.toLowerCase()}`)}
        BEFORE ${action} ON ${quote(table)} WHEN EXISTS(SELECT 1 FROM deletion_execution_tombstones WHERE table_name='runs' AND execution_id=NEW.run_id)
        BEGIN SELECT RAISE(ABORT,'EXECUTION_DELETED'); END`);
    }
  }
  private exists(table: string) { return !!this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table); }
  private primary(table: string): string[] {
    return this.db.prepare(`PRAGMA table_info(${quote(table)})`).all().filter(column => Number(column.pk) > 0)
      .sort((a, b) => Number(a.pk) - Number(b.pk)).map(column => String(column.name));
  }
  private read(table: string, key: FrozenRow['key']) {
    const primary = this.primary(table);
    if (!primary.length || JSON.stringify([...primary].sort()) !== JSON.stringify(Object.keys(key).sort())
      || Object.values(key).some(value => typeof value !== 'string' && (typeof value !== 'number' || !Number.isSafeInteger(value)))) throw new Error('DELETION_RECORD_KEY_INVALID');
    return this.db.prepare(`SELECT * FROM ${quote(table)} WHERE ${primary.map(column => `${quote(column)}=?`).join(' AND ')}`)
      .get(...primary.map(column => key[column] as SQLInputValue));
  }
  capture(plan: BatchDeletionPlan, runStates?: SqliteDeletionRunStates): RowWitness {
    const inventory = sqliteDeletionInventory({ [this.name]: this.db }, runStates ? { [this.name]: runStates } : {});
    if (inventory.unclassifiedTables.length) throw new Error('DELETION_UNCLASSIFIED_TABLES');
    const records = new Map(inventory.records.map(record => [record.id, record]));
    const nodes = new Map(inventory.nodes.map(node => [node.id, node]));
    const rows: FrozenRow[] = [];
    for (const id of plan.deleteIds.filter(id => id.startsWith(`${this.name}/`))) {
      const locator = records.get(id), node = nodes.get(id);
      if (!locator || !node) throw new Error('DELETION_RECORD_CHANGED');
      if (!removable.has(locator.table) || node.kind === 'configuration' || node.kind === 'source') throw new Error('DELETION_TABLE_PROTECTED');
      if (node.active) throw new Error('DELETION_EXECUTION_ACTIVE');
      const key = locator.key as FrozenRow['key'], row = this.read(locator.table, key);
      if (!row || sha256(JSON.stringify(row)) !== node.revision) throw new Error('DELETION_RECORD_CHANGED');
      let usage: unknown = null;
      if (locator.table === 'wb_stage_tasks') {
        usage = (JSON.parse(String(row.snapshot)) as { usage?: unknown }).usage;
        if (!usage || typeof usage !== 'object' || Array.isArray(usage)
          || Object.keys(usage).sort().join(',') !== 'elapsedMs,modelCalls,reservedTokens,tokens'
          || Object.values(usage).some(value => !Number.isSafeInteger(value) || Number(value) < 0)) throw new Error('DELETION_USAGE_INVALID');
      }
      if (locator.table === 'runs') usage = { iteration: row.iteration };
      rows.push({ id, table: locator.table, key, revision: node.revision, usage });
    }
    return { contract: this.contract, database: this.name, rows };
  }
  remove(plan: BatchDeletionPlan, witness: unknown): void {
    if (!this.db.isTransaction) throw new Error('DELETION_TRANSACTION_REQUIRED');
    if (this.db.prepare('PRAGMA foreign_keys').get()!.foreign_keys !== 1) throw new Error('DELETION_FOREIGN_KEYS_REQUIRED');
    const frozen = witness as RowWitness;
    if (!frozen || frozen.contract !== this.contract || frozen.database !== this.name || !Array.isArray(frozen.rows)) throw new Error('DELETION_WITNESS_INVALID');
    const expected = plan.deleteIds.filter(id => id.startsWith(`${this.name}/`)).sort();
    if (JSON.stringify(frozen.rows.map(row => row.id).sort()) !== JSON.stringify(expected)) throw new Error('DELETION_WITNESS_INVALID');
    // 先校验全部行，再修改任何一行；同库变化由调用者事务整体回滚。
    for (const row of frozen.rows) {
      if (!removable.has(row.table) || row.id !== `${this.name}/${row.table}/${sha256(JSON.stringify(row.key))}`) throw new Error('DELETION_WITNESS_INVALID');
      const current = this.read(row.table, row.key);
      if (!current || sha256(JSON.stringify(current)) !== row.revision) throw new Error('DELETION_RECORD_CHANGED');
    }
    const tables = new Set(frozen.rows.map(row => row.table)), ordered: string[] = [], visiting = new Set<string>(), visited = new Set<string>();
    const visit = (table: string) => {
      if (visited.has(table)) return;
      if (visiting.has(table)) throw new Error('DELETION_FOREIGN_KEY_CYCLE');
      visiting.add(table);
      // 子表先删除；保留行仍引用父行时让真实外键检查拒绝，不能关闭foreign_keys。
      for (const child of tables) if (this.db.prepare(`PRAGMA foreign_key_list(${quote(child)})`).all().some(edge => edge.table === table)) visit(child);
      visiting.delete(table); visited.add(table); ordered.push(table);
    };
    for (const table of [...tables].sort()) visit(table);
    for (const table of ordered) for (const row of frozen.rows.filter(row => row.table === table)) {
      const executionKey = executionKeys[table];
      if (table === 'runs') {
        const changed = this.db.prepare('UPDATE runs SET best_version_id=NULL WHERE run_id=?').run(row.key.run_id!);
        if (changed.changes !== 1) throw new Error('DELETION_RECORD_CHANGED');
      }
      if (executionKey) this.db.prepare('INSERT INTO deletion_execution_tombstones VALUES(?,?,?,?,?)')
        .run(table, String(row.key[executionKey]), plan.planId, row.revision, JSON.stringify(row.usage));
      if (table === 'runs') continue; // 最小父行仅作审计及外键锚点，业务查询不再返回。
      const keys = this.primary(table);
      const removed = this.db.prepare(`DELETE FROM ${quote(table)} WHERE ${keys.map(key => `${quote(key)}=?`).join(' AND ')}`)
        .run(...keys.map(key => row.key[key] as SQLInputValue));
      if (removed.changes !== 1) throw new Error('DELETION_RECORD_CHANGED');
    }
  }
}
