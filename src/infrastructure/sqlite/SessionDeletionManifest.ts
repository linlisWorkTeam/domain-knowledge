/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：从受保护的CodeAgent审计确认本地会话归属，冻结文件摘要而不暴露会话标识。
 */
import { sha256 } from '../../domain/Domain.ts';
import type { DeletionNode } from '../../domain/workbench/BatchDeletion.ts';
import type { DeletionRecordInventory } from './SqliteDeletionInventory.ts';
import type { PublishedDeletionFile } from './PublishedDeletionManifest.ts';
import { CasDeletionReader } from './CasDeletionReader.ts';
class SessionReader extends CasDeletionReader {
  session(path: string): Buffer | null { return this.inspectRelative([path], 64 * 1024, file => file.bytes); }
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function sessionDeletionManifest(input: {
  rootName: string; root: string; audits: unknown[]; inventory: DeletionRecordInventory;
}): { files: PublishedDeletionFile[]; protectedNodes: DeletionNode[] } {
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(input.rootName)) throw new Error('DELETION_SESSION_ROOT_UNAUTHORIZED');
  if (input.audits.length > 100000) throw new Error('DELETION_INVENTORY_TOO_LARGE');
  const owners = new Map<string, string[]>();
  for (const record of input.inventory.records) {
    const key = record.table === 'runs' ? record.key.run_id : record.table === 'wb_stage_tasks' ? record.key.task_id : undefined;
    if (typeof key === 'string') owners.set(key, [...(owners.get(key) ?? []), record.id]);
  }
  const sessions = new Map<string, { owners: Set<string>; sessionIds: Set<string>; unknown: boolean }>();
  for (const value of input.audits) {
    const audit = object(value); if (audit.provider !== 'company-codeagent-cli') continue;
    if (audit.schemaVersion !== '1.0' || typeof audit.idempotencyKey !== 'string' || !audit.idempotencyKey
      || typeof audit.sessionId !== 'string' || !audit.sessionId) throw new Error('DELETION_SESSION_AUDIT_INVALID');
    const path = `${sha256(audit.idempotencyKey)}.json`;
    const session = sessions.get(path) ?? { owners: new Set<string>(), sessionIds: new Set<string>(), unknown: false };
    session.sessionIds.add(audit.sessionId);
    const known = typeof audit.runId === 'string' ? owners.get(audit.runId) : undefined;
    if (known?.length) for (const owner of known) session.owners.add(owner); else session.unknown = true;
    sessions.set(path, session);
  }
  const reader = new SessionReader(input.root), files: PublishedDeletionFile[] = [], protectedNodes: DeletionNode[] = [];
  for (const [path, session] of sessions) {
    if (!session.owners.size) continue;
    const bytes = reader.session(path); if (!bytes) continue;
    let value: Record<string, unknown>;
    try { value = object(JSON.parse(bytes.toString('utf8'))); } catch { throw new Error('DELETION_SESSION_FILE_INVALID'); }
    if (Object.keys(value).length !== 1 || typeof value.sessionId !== 'string' || !session.sessionIds.has(value.sessionId)) throw new Error('DELETION_SESSION_IDENTITY_CHANGED');
    const id = `published-files/${sha256(JSON.stringify([input.rootName, path]))}`;
    files.push({ id, root: input.rootName, path, sha256: sha256(bytes), size: bytes.length, ownedBy: [...session.owners].sort() });
    if (session.unknown) protectedNodes.push({ id: `session-unknown/${sha256(JSON.stringify([input.rootName, path]))}`, kind: 'configuration',
      revision: sha256(bytes), ownedBy: [], references: [id] });
  }
  return { files, protectedNodes };
}
