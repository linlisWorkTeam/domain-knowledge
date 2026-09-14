/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：从冻结发布和索引记录推导输出文件及预期摘要，不信任客户端路径。
 */
import type { DatabaseSync } from 'node:sqlite';
import { join, resolve } from 'node:path';
import { assertArtifactRef, sha256 } from '../../domain/Domain.ts';
import { assertPublicationRecord, type PublicationRecord } from '../../domain/workbench/WorkbenchPublicationRecord.ts';
import { CARD_INDEX_VERSION, type CardIndexEntry } from '../../domain/knowledge/KnowledgeIndex.ts';
import type { LocalPublicationInput, LocalPublicationReceipt } from '../../application/ports/PublicationPorts.ts';
import { localPublicationContent } from '../publication/LocalPublicationContent.ts';
import { knowledgeIndexFilename } from './SqliteKnowledgeIndex.ts';
import type { DeletionRecordInventory } from './SqliteDeletionInventory.ts';

export interface PublishedDeletionFile {
  id: string; root: string; path: string; sha256: string; size: number; ownedBy: string[];
}
/** roots来自经授权的服务端目录配置；返回值尚须检查磁盘存在性/内容后才能加入确认清单。 */
export function publishedDeletionManifest(input: {
  databases: Record<string, DatabaseSync>; inventory: DeletionRecordInventory;
  roots: Record<string, string>; indexRoot: string; workbenchRoot: string; legacyRoots: string[];
}): PublishedDeletionFile[] {
  const files = new Map<string, PublishedDeletionFile>(), nodes = new Map(input.inventory.nodes.map(node => [node.id, node]));
  const root = (name: string) => {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(name) || typeof input.roots[name] !== 'string' || !input.roots[name]) throw new Error('DELETION_PUBLICATION_ROOT_UNAUTHORIZED');
    return resolve(input.roots[name]);
  };
  const add = (owner: string, name: string, path: string, digest: string, size: number) => {
    root(name);
    if (!path || path.split('/').some(part => !part || part === '.' || part === '..' || /[\\\0\r\n]/.test(part))
      || !/^[a-f0-9]{64}$/.test(digest) || !Number.isSafeInteger(size) || size < 0 || size > 32 * 1024 * 1024) throw new Error('DELETION_PUBLICATION_FILE_INVALID');
    const id = `published-files/${sha256(JSON.stringify([name, path]))}`, prior = files.get(id);
    if (prior && (prior.sha256 !== digest || prior.size !== size)) throw new Error('DELETION_PUBLICATION_FILE_CONFLICT');
    if (prior) prior.ownedBy = [...new Set([...prior.ownedBy, owner])].sort();
    else files.set(id, { id, root: name, path, sha256: digest, size, ownedBy: [owner] });
  };
  const columns: Record<string, string> = { wb_card_index: 'card_id', wb_publications: 'id', local_publications_v1: 'publication_key' };
  for (const record of input.inventory.records) {
    const column = Object.hasOwn(columns, record.table) ? columns[record.table] : undefined; if (!column) continue;
    const db = input.databases[record.database], key = record.key[column];
    if (!db || typeof key !== 'string') throw new Error('DELETION_RECORD_KEY_INVALID');
    const row = db.prepare(`SELECT * FROM ${record.table} WHERE ${column}=?`).get(key);
    if (!row || sha256(JSON.stringify(row)) !== nodes.get(record.id)?.revision) throw new Error('DELETION_RECORD_CHANGED');
    if (record.table === 'wb_card_index') {
      const entry = JSON.parse(String(row.snapshot)) as CardIndexEntry;
      if (entry.schemaVersion !== CARD_INDEX_VERSION || entry.cardId !== key) throw new Error('DELETION_PUBLICATION_RECORD_INVALID');
      assertArtifactRef(entry.markdownRef);
      add(record.id, input.indexRoot, knowledgeIndexFilename(entry.cardId), entry.markdownRef.sha256, entry.markdownRef.size);
    } else if (record.table === 'wb_publications') {
      const publication = JSON.parse(String(row.record)) as PublicationRecord;
      assertPublicationRecord(publication);
      if (publication.publicationId !== key || publication.projectId !== row.project_id) throw new Error('DELETION_PUBLICATION_RECORD_INVALID');
      for (const file of publication.files) {
        assertArtifactRef(file.ref);
        add(record.id, input.workbenchRoot, `${publication.publicationId}/${file.path}`, file.ref.sha256, file.ref.size);
      }
    } else {
      const publication = JSON.parse(String(row.input_json)) as LocalPublicationInput;
      const receipt = JSON.parse(String(row.receipt_json)) as LocalPublicationReceipt;
      if (sha256(JSON.stringify(publication)) !== row.fingerprint || receipt.schemaVersion !== '1.0'
        || publication.publicationKey !== key || receipt.publicationKey !== key || receipt.runId !== publication.runId
        || receipt.versionId !== publication.versionId || receipt.moduleId !== publication.moduleId
        || typeof publication.body !== 'string' || receipt.bodySha256 !== sha256(publication.body)) throw new Error('DELETION_PUBLICATION_RECORD_INVALID');
      const directory = sha256(key), name = input.legacyRoots.find(name => receipt.path === join(root(name), directory, 'Knowledge.md'));
      if (!name) throw new Error('DELETION_PUBLICATION_ROOT_UNAUTHORIZED');
      const content = localPublicationContent(publication, receipt);
      for (const [path, text] of [['Knowledge.md', content.markdown], ['Provenance.json', content.metadataText]]) {
        add(record.id, name, `${directory}/${path}`, sha256(text!), Buffer.byteLength(text!));
      }
    }
  }
  if (files.size > 100000) throw new Error('DELETION_INVENTORY_TOO_LARGE');
  return [...files.values()].sort((a, b) => a.id.localeCompare(b.id));
}
