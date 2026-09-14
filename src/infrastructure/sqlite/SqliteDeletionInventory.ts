/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：只读提取真实 SQLite 记录的删除归属与跨库引用，不推测未知记录的归属。
 */
import type { DatabaseSync } from 'node:sqlite';
import { sha256 } from '../../domain/Domain.ts';
import type { DeletionKind, DeletionNode } from '../../domain/workbench/BatchDeletion.ts';
import { deletionArtifactSeed, type DeletionArtifactSeed } from '../../application/services/DeletionArtifacts.ts';
import type { SqliteDeletionRunStates } from './SqliteDeletionRunStates.ts';

type Row = Record<string, unknown>;
interface Entry { database: string; table: string; key: Row; row: Row; value: Row; node: DeletionNode }
export interface DeletionRecordInventory {
  nodes: DeletionNode[];
  /** 仅服务器内部使用；不包含行内容或配置值。不能直接当作 SQL/文件删除指令。 */
  records: Array<{ id: string; database: string; table: string; key: Row }>;
  /** 新表必须经过归属审计；不允许忽略它后继续物理删除。 */
  unclassifiedTables: string[];
  artifactSeeds: DeletionArtifactSeed[];
}
const kinds: Record<string, DeletionKind> = {
  runs: 'run', wb_batches: 'batch', wb_pipelines: 'pipeline', wb_stage_tasks: 'stage',
  knowledge_versions: 'knowledge', wb_card_index: 'index', wb_native_test_sets: 'testSet',
  publications: 'publication', local_publications_v1: 'publication', wb_publications: 'publication',
  evaluations: 'artifact', gate_decisions: 'artifact', events: 'artifact', checkpoints: 'artifact',
  checkpoint_owners: 'artifact', workflow_node_projections: 'artifact', action_items: 'artifact',
  action_item_sources: 'artifact', action_item_history: 'artifact', feedback: 'artifact',
  wb_stage_events: 'artifact', wb_stage_checkpoints: 'artifact', wb_pipeline_events: 'artifact', wb_publication_events: 'artifact',
  sources: 'source', source_refresh_jobs: 'source', source_audit: 'source', wb_external_materials: 'source', wb_project_inputs: 'source',
  // 序号、幂等命令、预算及运行配置另行迁移为墓碑，不能随产物直接删除。
  wb_batch_sequences: 'configuration', wb_batch_commands: 'configuration', wb_batch_controls: 'configuration',
  wb_batch_round_commands: 'configuration', wb_stage_usage: 'configuration', provider_invocations: 'configuration',
  run_configuration_snapshots: 'configuration', agent_prompt_configurations: 'configuration', publication_settings: 'configuration',
  evaluation_rules: 'configuration', evaluation_rule_bindings: 'configuration', command_receipts: 'configuration',
  content_command_receipts: 'configuration', schema_migrations: 'configuration', wb_deletion_receipts: 'configuration',
  validated_test_suites: 'testSet', wb_native_test_heads: 'configuration',
  deletion_recovery_intents: 'configuration', deletion_participant_receipts: 'configuration',
  deletion_execution_tombstones: 'configuration',
};
const identifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
const jsonColumns = new Set(['value', 'record', 'snapshot', 'delta', 'json']);
function decode(row: Row, table: string): Row {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (typeof value === 'string' && (key.endsWith('_json') || jsonColumns.has(key) || table === 'wb_stage_events' && key === 'detail')) {
      try { return [key, JSON.parse(value) as unknown]; }
      catch { throw new Error('DELETION_RECORD_JSON_INVALID'); }
    }
    if (value instanceof Uint8Array) throw new Error('DELETION_RECORD_BINARY_UNSUPPORTED');
    return [key, value];
  }));
}
function object(value: unknown): Row { return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {}; }
function strings(value: unknown): string[] {
  const result: string[] = [], pending: unknown[] = [value]; let visited = 0;
  while (pending.length) {
    if (++visited > 1000000) throw new Error('DELETION_RECORD_TOO_LARGE');
    const item = pending.pop();
    if (typeof item === 'string') result.push(item);
    else if (item && typeof item === 'object') for (const child of Array.isArray(item) ? item : Object.values(item)) pending.push(child);
  }
  return result;
}

/**
 * 调用者负责以同一快照读取各库；本函数不建立跨库写事务，也不执行删除。
 * 输出只涵盖数据库记录。CAS 递归引用、发布文件和墓碑仍须加入最终删除清单。
 */
export function sqliteDeletionInventory(databases: Record<string, DatabaseSync>, runStates: Record<string, SqliteDeletionRunStates> = {},
  externalIdentities: Array<{ value: string; nodeId: string }> = []): DeletionRecordInventory {
  const entries: Entry[] = [], unclassifiedTables: string[] = [];
  for (const [database, db] of Object.entries(databases).sort(([a], [b]) => a.localeCompare(b))) {
    runStates[database]?.assertCurrent(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    const deletedRuns = new Set(tables.some(table => table.name === 'deletion_execution_tombstones')
      ? db.prepare("SELECT execution_id FROM deletion_execution_tombstones WHERE table_name='runs'").all().map(row => String(row.execution_id)) : []);
    for (const item of tables) {
      const table = String(item.name), kind = kinds[table] ?? 'configuration';
      if (!kinds[table]) unclassifiedTables.push(`${database}.${table}`);
      const columns = db.prepare(`PRAGMA table_info(${identifier(table)})`).all();
      const primary = columns.filter(column => Number(column.pk) > 0).sort((a, b) => Number(a.pk) - Number(b.pk)).map(column => String(column.name));
      if (!primary.length) throw new Error('DELETION_RECORD_KEY_UNSUPPORTED');
      for (const row of db.prepare(`SELECT * FROM ${identifier(table)} LIMIT 100001`).all()) {
        if (entries.length >= 100000) throw new Error('DELETION_INVENTORY_TOO_LARGE');
        const key = Object.fromEntries(primary.map(name => [name, row[name]]));
        const value = decode(row, table), id = `${database}/${table}/${sha256(JSON.stringify(key))}`;
        const rowKind = table === 'runs' && deletedRuns.has(String(row.run_id)) ? 'configuration' : kind;
        const node: DeletionNode = { id, kind: rowKind, revision: sha256(JSON.stringify(row)), ownedBy: [], references: [] };
        const record = object(value.value ?? value.record ?? value.snapshot);
        if (rowKind === 'run') node.active = runStates[database]?.active(row)
          ?? !['VERIFIED', 'LOW_CONFIDENCE', 'FAILED', 'CANCELLED'].includes(String(row.state));
        if (['batch', 'pipeline', 'stage'].includes(kind)) node.active = !!row.lease_id
          || !['READY', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'PAUSED'].includes(String(record.status))
          || kind === 'batch' && object(record.schedule).enabled === true;
        entries.push({ database, table, key, row, value, node });
      }
    }
  }
  const byTable = new Map<string, Entry[]>(), identities = new Map<string, Set<string>>();
  for (const { value, nodeId } of externalIdentities) {
    const ids = identities.get(value) ?? new Set<string>(); ids.add(nodeId); identities.set(value, ids);
  }
  for (const entry of entries) {
    const list = byTable.get(entry.table) ?? []; list.push(entry); byTable.set(entry.table, list);
    if (Object.keys(entry.key).length === 1) for (const key of Object.values(entry.key)) if (typeof key === 'string') {
      const ids = identities.get(key) ?? new Set<string>(); ids.add(entry.node.id); identities.set(key, ids);
    }
  }
  const find = (table: string, column: string, value: unknown) => value == null ? [] : (byTable.get(table) ?? []).filter(entry => entry.row[column] === value);
  const own = (child: Entry, parents: Entry[]) => { child.node.ownedBy.push(...parents.map(parent => parent.node.id)); };
  const ownerColumns: Record<string, [string, string]> = {
    run_id: ['runs', 'run_id'], task_id: ['wb_stage_tasks', 'task_id'], pipeline_id: ['wb_pipelines', 'id'],
    publication_id: ['wb_publications', 'id'], action_item_id: ['action_items', 'action_item_id'],
  };
  for (const entry of entries) {
    for (const [column, [table, key]] of Object.entries(ownerColumns)) if (entry.table !== table
      && !['source', 'configuration'].includes(entry.node.kind)) own(entry, find(table, key, entry.row[column]));
    if (entry.table === 'checkpoint_owners') own(entry, find('checkpoints', 'generation_key', entry.row.generation_key));
    if (entry.table === 'action_items') own(entry, find('events', 'event_id', entry.row.source_event_id));
    if (entry.table === 'events' && entry.row.event_type === 'ArtifactCommitted') {
      const event = object(entry.value.event_json), payload = object(event.payload);
      for (const version of find('knowledge_versions', 'version_id', payload.versionId)) {
        if (entry.row.run_id === `catalog:${String(version.row.module_id)}` && event.runId === entry.row.run_id
          && payload.artifactId === object(version.value.body_ref_json).artifactId) own(entry, [version]);
      }
    }
    if (entry.table === 'knowledge_versions') {
      const metadata = object(entry.value.metadata_json);
      // 修订元数据可能保留旧 stageTaskId；修订版本归本次修订任务。
      own(entry, find('wb_stage_tasks', 'task_id', metadata.revisionTaskId ?? metadata.stageTaskId));
      const artifactId = object(entry.value.body_ref_json).artifactId;
      for (const checkpoint of byTable.get('checkpoints') ?? []) if (typeof artifactId === 'string' && checkpoint.row.node_id === 'candidate_knowledge'
        && strings(checkpoint.value.output_refs_json).includes(artifactId)) {
        own(entry, find('runs', 'run_id', checkpoint.row.run_id));
      }
    }
    if (entry.table === 'wb_batches') {
      const record = object(entry.value.value);
      for (const round of Array.isArray(record.rounds) ? record.rounds : []) {
        for (const child of find('wb_pipelines', 'id', object(round).pipelineId)) own(child, [entry]);
      }
    }
    if (entry.table === 'wb_pipelines') {
      const record = object(entry.value.record);
      for (const id of strings([record.children, record.iterations])) for (const child of find('wb_stage_tasks', 'task_id', id)) own(child, [entry]);
      for (const child of find('wb_publications', 'id', record.publicationId)) own(child, [entry]);
    }
    if (entry.table === 'wb_card_index') own(entry, find('knowledge_versions', 'version_id', object(entry.value.snapshot).versionId));
    if (entry.table === 'feedback') own(entry, find('knowledge_versions', 'version_id', entry.row.version_id));
    if (entry.table === 'publications') own(entry, find('gate_decisions', 'decision_id', entry.row.decision_id));
    if (entry.table === 'local_publications_v1') {
      const runId = object(entry.value.input_json).runId;
      if (typeof runId === 'string' && runId === object(entry.value.receipt_json).runId) own(entry, find('runs', 'run_id', runId));
    }
  }
  for (const entry of entries) {
    entry.node.ownedBy = [...new Set(entry.node.ownedBy)].sort();
    // 任意保留行中的实体引用都参与保护；未知表也不能静默绕过引用检查。
    // 回指 owner 仍保留，直到持久墓碑协议明确替代它，宁可拒绝不完整删除。
    for (const value of strings(entry.value)) for (const id of identities.get(value) ?? []) {
      if (id !== entry.node.id) entry.node.references.push(id);
    }
    entry.node.references = [...new Set(entry.node.references)].sort();
  }
  // 只有明确的用量/配置/幂等父键是审计关系；JSON中的功能引用仍按硬依赖保护。
  const auditOwners: Record<string, [string, string, string]> = {
    run_configuration_snapshots: ['run_id', 'runs', 'run_id'], provider_invocations: ['run_id', 'runs', 'run_id'],
    wb_stage_usage: ['task_id', 'wb_stage_tasks', 'task_id'], wb_batch_commands: ['batch_id', 'wb_batches', 'batch_id'],
    wb_batch_controls: ['batch_id', 'wb_batches', 'batch_id'], wb_batch_round_commands: ['batch_id', 'wb_batches', 'batch_id'],
  };
  for (const entry of entries) {
    const rule = auditOwners[entry.table]; if (!rule) continue;
    const [column, table, key] = rule;
    const audits = find(table, key, entry.row[column]).filter(parent => ['batch', 'run', 'pipeline', 'stage'].includes(parent.node.kind)).map(parent => parent.node.id);
    entry.node.auditReferences = audits;
    entry.node.references = entry.node.references.filter(id => !audits.includes(id));
  }
  return { nodes: entries.map(entry => entry.node).sort((a, b) => a.id.localeCompare(b.id)),
    records: entries.map(({ node, database, table, key }) => ({ id: node.id, database, table, key })), unclassifiedTables,
    artifactSeeds: entries.map(entry => deletionArtifactSeed(entry.node.id, entry.value)).filter(seed => seed.refs.length || seed.artifactIds.length) };
}
