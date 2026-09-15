/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：为LangGraph线程建立引用清单和可恢复删除见证，拒绝删除后重写线程。
 */
import type { DatabaseSync } from 'node:sqlite';
import { sha256 } from '../../domain/Domain.ts';
import type { BatchDeletionPlan, DeletionNode } from '../../domain/workbench/BatchDeletion.ts';
import { deletionArtifactSeed } from '../../application/services/DeletionArtifacts.ts';
import type { DeletionRecordInventory } from './SqliteDeletionInventory.ts';

type Row = Record<string, unknown>;
type Table = 'checkpoints' | 'writes';
interface GraphRow { id: string; table: Table; key: Row; threadId: string; revision: string; payload: unknown[] }
interface GraphWitness { contract: 'graph-deletion-rows-v1'; database: string;
  threads: Array<{ threadId: string; revision: string; ids: string[] }> }
const columns: Record<Table, string[]> = {
  checkpoints: ['thread_id', 'checkpoint_ns', 'checkpoint_id', 'parent_checkpoint_id', 'type', 'checkpoint', 'metadata'],
  writes: ['thread_id', 'checkpoint_ns', 'checkpoint_id', 'task_id', 'idx', 'channel', 'type', 'value'],
};
const keys: Record<Table, string[]> = {
  checkpoints: ['thread_id', 'checkpoint_ns', 'checkpoint_id'],
  writes: ['thread_id', 'checkpoint_ns', 'checkpoint_id', 'task_id', 'idx'],
};
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
function values(input: unknown): string[] {
  const result: string[] = [], pending = [input]; let visited = 0;
  while (pending.length) {
    if (++visited > 1000000) throw new Error('DELETION_RECORD_TOO_LARGE');
    const value = pending.pop();
    if (typeof value === 'string') result.push(value);
    else if (value && typeof value === 'object') for (const child of Array.isArray(value) ? value : Object.values(value)) pending.push(child);
  }
  return result;
}
function threadRevision(rows: GraphRow[]) { return sha256(JSON.stringify(rows.map(row => [row.id, row.revision]).sort(([a], [b]) => a!.localeCompare(b!)))); }

/** 调用方须持有维护屏障及跨库写入排他；本适配器不自行提交，不接收客户端路径。 */
export class SqliteGraphDeletion {
  readonly contract = 'graph-deletion-rows-v1';
  private readonly name: string;
  private readonly database: DatabaseSync;
  constructor(name: string, database: DatabaseSync) {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(name)) throw new Error('DELETION_DATABASE_INVALID');
    this.name = name; this.database = database;
  }
  private tables(): Set<string> {
    const tables = new Set(this.database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row => String(row.name)));
    if ([...tables].some(table => !['checkpoints', 'writes', 'deletion_graph_threads', 'deletion_participant_receipts'].includes(table))
      || tables.has('checkpoints') !== tables.has('writes')) throw new Error('DELETION_GRAPH_SCHEMA_UNSUPPORTED');
    for (const table of ['checkpoints', 'writes'] as const) if (tables.has(table)) {
      const info = this.database.prepare(`PRAGMA table_info(${quote(table)})`).all();
      const primary = info.filter(row => Number(row.pk) > 0).sort((a, b) => Number(a.pk) - Number(b.pk)).map(row => String(row.name));
      if (JSON.stringify(info.map(row => row.name)) !== JSON.stringify(columns[table])
        || JSON.stringify(primary) !== JSON.stringify(keys[table])) throw new Error('DELETION_GRAPH_SCHEMA_UNSUPPORTED');
    }
    for (const [table, expected] of Object.entries({ deletion_graph_threads: ['thread_id', 'plan_id', 'revision'],
      deletion_participant_receipts: ['plan_id', 'fingerprint', 'contract'] })) if (tables.has(table)) {
      const info = this.database.prepare(`PRAGMA table_info(${quote(table)})`).all();
      if (JSON.stringify(info.map(row => row.name)) !== JSON.stringify(expected)
        || JSON.stringify(info.filter(row => Number(row.pk) > 0).map(row => row.name)) !== JSON.stringify([expected[0]])) throw new Error('DELETION_GRAPH_SCHEMA_UNSUPPORTED');
    }
    return tables;
  }
  private *scan(): Generator<GraphRow> {
    const tables = this.tables(); let totalBytes = 0, count = 0;
    for (const table of ['checkpoints', 'writes'] as const) if (tables.has(table)) {
      for (const row of this.database.prepare(`SELECT * FROM ${quote(table)} ORDER BY ${keys[table].map(quote).join(',')} LIMIT 100001`).iterate()) {
        if (++count > 100000) throw new Error('DELETION_INVENTORY_TOO_LARGE');
        const key = Object.fromEntries(keys[table].map(name => [name, row[name]]));
        if (Object.entries(key).some(([name, value]) => name === 'idx' ? !Number.isSafeInteger(value) : typeof value !== 'string')
          || !row.thread_id) throw new Error('DELETION_RECORD_KEY_INVALID');
        const payload: unknown[] = [row.parent_checkpoint_id, ...(table === 'writes' ? [row.checkpoint_id] : [])], normalized: Row = { ...row };
        for (const column of table === 'checkpoints' ? ['checkpoint', 'metadata'] : ['value']) {
          const value = row[column];
          if (!(value instanceof Uint8Array) && typeof value !== 'string') throw new Error('DELETION_GRAPH_ENCODING_UNSUPPORTED');
          const bytes = typeof value === 'string' ? Buffer.from(value) : value;
          totalBytes += bytes.byteLength;
          if (bytes.byteLength > 8 * 1024 * 1024 || totalBytes > 128 * 1024 * 1024) throw new Error('DELETION_ARTIFACT_LIMIT');
          normalized[column] = { storage: typeof value === 'string' ? 'text' : 'blob', digest: sha256(bytes), bytes: bytes.byteLength };
          if (row.type !== null && row.type !== 'json') throw new Error('DELETION_GRAPH_ENCODING_UNSUPPORTED');
          try { payload.push(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))); }
          catch { throw new Error('DELETION_GRAPH_JSON_INVALID'); }
        }
        yield { id: `${this.name}/${table}/${sha256(JSON.stringify(key))}`, table, key,
          threadId: String(row.thread_id), revision: sha256(JSON.stringify(normalized)), payload };
      }
    }
  }
  /** 合并真实注册表/工作台库存；未知线程保持无归属，保护其全部引用。 */
  inventory(base: DeletionRecordInventory): DeletionRecordInventory {
    if (base.records.some(row => row.database === this.name)) throw new Error('DELETION_DATABASE_INVALID');
    const result = { nodes: [...base.nodes], records: [...base.records], artifactSeeds: [...base.artifactSeeds], unclassifiedTables: [...base.unclassifiedTables] };
    const identities = new Map<string, string[]>(), runs = new Map<string, string[]>();
    for (const record of base.records) if (Object.keys(record.key).length === 1) for (const value of Object.values(record.key)) if (typeof value === 'string') {
      identities.set(value, [...identities.get(value) ?? [], record.id]);
      if (record.table === 'runs') runs.set(value, [...runs.get(value) ?? [], record.id]);
    }
    if (this.tables().has('checkpoints')) {
      let count = 0;
      for (const row of this.database.prepare('SELECT thread_id,checkpoint_ns,checkpoint_id FROM checkpoints LIMIT 100001').iterate()) {
        if (++count > 100000) throw new Error('DELETION_INVENTORY_TOO_LARGE');
        const id = `${this.name}/checkpoints/${sha256(JSON.stringify(row))}`, value = String(row.checkpoint_id);
        const matching = identities.get(value) ?? []; matching.push(id); identities.set(value, matching);
      }
    }
    for (const row of this.scan()) {
      const owners = runs.get(row.threadId) ?? [];
      const node: DeletionNode = { id: row.id, kind: 'artifact', revision: row.revision, ownedBy: owners,
        references: [...new Set([...owners, ...values(row.payload).flatMap(value => identities.get(value) ?? [])])].sort() };
      result.nodes.push(node); result.records.push({ id: row.id, database: this.name, table: row.table, key: row.key });
      result.artifactSeeds.push(deletionArtifactSeed(row.id, row.payload));
    }
    for (const table of ['deletion_graph_threads', 'deletion_participant_receipts']) if (this.tables().has(table)) {
      const primary = table === 'deletion_graph_threads' ? 'thread_id' : 'plan_id';
      for (const row of this.database.prepare(`SELECT * FROM ${quote(table)} ORDER BY ${quote(primary)} LIMIT 100001`).iterate()) {
        const key = { [primary]: row[primary] }, id = `${this.name}/${table}/${sha256(JSON.stringify(key))}`;
        result.nodes.push({ id, kind: 'configuration', revision: sha256(JSON.stringify(row)), ownedBy: [], references: [] });
        result.records.push({ id, database: this.name, table, key });
      }
    }
    if (result.nodes.length > 100000) throw new Error('DELETION_INVENTORY_TOO_LARGE');
    return result;
  }
  capture(plan: BatchDeletionPlan): GraphWitness {
    const selected = new Set(plan.deleteIds.filter(id => id.startsWith(`${this.name}/`)));
    const rows = Array.from(this.scan(), row => ({ ...row, payload: [] }));
    const byId = new Map(rows.map(row => [row.id, row]));
    if ([...selected].some(id => !byId.has(id))) throw new Error('DELETION_RECORD_CHANGED');
    const groups = this.group(rows);
    const threads: GraphWitness['threads'] = [];
    for (const threadId of [...new Set(rows.filter(row => selected.has(row.id)).map(row => row.threadId))].sort()) {
      const entries = groups.get(threadId)!;
      if (entries.some(row => !selected.has(row.id))) throw new Error('DELETION_GRAPH_THREAD_SHARED');
      threads.push({ threadId, revision: threadRevision(entries), ids: entries.map(row => row.id).sort() });
    }
    return { contract: this.contract, database: this.name, threads };
  }
  remove(plan: BatchDeletionPlan, witness: unknown): void {
    if (!this.database.isTransaction) throw new Error('DELETION_TRANSACTION_REQUIRED');
    const frozen = witness as GraphWitness;
    if (!frozen || frozen.contract !== this.contract || frozen.database !== this.name || !Array.isArray(frozen.threads)
      || frozen.threads.some(thread => !thread || typeof thread.threadId !== 'string' || !thread.threadId || !Array.isArray(thread.ids))
      || new Set(frozen.threads.map(thread => thread.threadId)).size !== frozen.threads.length
      || JSON.stringify(frozen.threads.flatMap(thread => thread.ids).sort()) !== JSON.stringify(plan.deleteIds.filter(id => id.startsWith(`${this.name}/`)).sort())) throw new Error('DELETION_WITNESS_INVALID');
    const groups = this.group(Array.from(this.scan(), row => ({ ...row, payload: [] })));
    for (const thread of frozen.threads) {
      const entries = groups.get(thread.threadId) ?? [];
      if (thread.revision !== threadRevision(entries) || JSON.stringify(entries.map(row => row.id).sort()) !== JSON.stringify([...thread.ids].sort())) throw new Error('DELETION_RECORD_CHANGED');
    }
    if (!frozen.threads.length) return;
    this.database.exec('CREATE TABLE IF NOT EXISTS deletion_graph_threads(thread_id TEXT PRIMARY KEY,plan_id TEXT NOT NULL,revision TEXT NOT NULL)');
    for (const table of ['checkpoints', 'writes']) for (const action of ['INSERT', 'UPDATE']) {
      this.database.exec(`CREATE TRIGGER IF NOT EXISTS ${quote(`deleted_graph_${table}_${action.toLowerCase()}`)} BEFORE ${action} ON ${quote(table)}
        WHEN EXISTS(SELECT 1 FROM deletion_graph_threads WHERE thread_id=NEW.thread_id)
        BEGIN SELECT RAISE(ABORT,'EXECUTION_DELETED'); END`);
    }
    for (const thread of frozen.threads) {
      this.database.prepare('INSERT INTO deletion_graph_threads VALUES(?,?,?)').run(thread.threadId, plan.planId, thread.revision);
      this.database.prepare('DELETE FROM writes WHERE thread_id=?').run(thread.threadId);
      this.database.prepare('DELETE FROM checkpoints WHERE thread_id=?').run(thread.threadId);
    }
  }
  private group(rows: GraphRow[]): Map<string, GraphRow[]> {
    const groups = new Map<string, GraphRow[]>();
    for (const row of rows) { const entries = groups.get(row.threadId) ?? []; entries.push(row); groups.set(row.threadId, entries); }
    return groups;
  }
}
