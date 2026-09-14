/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：合并业务表、LangGraph内部记录及递归CAS引用，并拒绝扫描期间的记录变化。
 */
import type { DatabaseSync } from 'node:sqlite';
import { sha256 } from '../../domain/Domain.ts';
import { expandDeletionArtifacts } from '../../application/services/DeletionArtifacts.ts';
import type { DeletionArtifactReader } from '../../application/ports/DeletionArtifactPorts.ts';
import { sqliteDeletionInventory, type DeletionRecordInventory } from './SqliteDeletionInventory.ts';
import type { SqliteGraphDeletion } from './SqliteGraphDeletion.ts';
import type { SqliteDeletionRunStates } from './SqliteDeletionRunStates.ts';
import type { PublishedDeletionFile } from './PublishedDeletionManifest.ts';
import type { PublishedDeletionFiles } from './PublishedDeletionFiles.ts';

function identities(inventory: DeletionRecordInventory) {
  return inventory.records.flatMap(record => {
    const values = Object.keys(record.key).length === 1 ? Object.values(record.key)
      : record.table === 'checkpoints' && typeof record.key.checkpoint_id === 'string' ? [record.key.checkpoint_id] : [];
    return values.filter((value): value is string => typeof value === 'string').map(value => ({ value, nodeId: record.id }));
  });
}
/** 调用者持有维护屏障，在写入前重建并确认同一清单；发布存储须显式配置。 */
export async function sqliteDeletionSnapshot(input: {
  databases: Record<string, DatabaseSync>; graph?: SqliteGraphDeletion;
  runStates?: Record<string, SqliteDeletionRunStates>; reader: DeletionArtifactReader;
  published?: { manifest(records: DeletionRecordInventory): PublishedDeletionFile[]; files: PublishedDeletionFiles };
}) {
  const scan = () => {
    let records = sqliteDeletionInventory(input.databases, input.runStates);
    if (input.graph) {
      const combined = input.graph.inventory(records);
      // 业务表也可能引用内部检查点，必须补齐这一个方向，不能只扫描图到业务的引用。
      const baseIds = new Set(records.nodes.map(node => node.id));
      records = input.graph.inventory(sqliteDeletionInventory(input.databases, input.runStates,
        identities(combined).filter(identity => !baseIds.has(identity.nodeId))));
    }
    if (records.unclassifiedTables.length) throw new Error('DELETION_UNCLASSIFIED_TABLES');
    if (!input.published && records.records.some(record => ['wb_card_index', 'wb_publications', 'local_publications_v1'].includes(record.table))) throw new Error('DELETION_PUBLICATION_SCOPE_REQUIRED');
    const publishedManifest = input.published?.manifest(records) ?? [];
    const publishedNodes = input.published?.files.observe(publishedManifest) ?? [];
    return { records, publishedManifest, publishedNodes };
  };
  const snapshot = scan(), { records, publishedManifest, publishedNodes } = snapshot, revision = sha256(JSON.stringify(snapshot));
  const artifacts = await expandDeletionArtifacts({ nodes: [...records.nodes, ...publishedNodes], seeds: records.artifactSeeds,
    identities: identities(records), reader: input.reader });
  if (sha256(JSON.stringify(scan())) !== revision) throw new Error('DELETION_RECORD_CHANGED');
  return { ...records, nodes: artifacts.nodes, missingArtifacts: artifacts.missingArtifacts, publishedManifest,
    missingPublishedFiles: publishedNodes.filter(node => node.revision.startsWith('missing:')).map(node => ({ id: node.id, ownerIds: node.ownedBy })) };
}
