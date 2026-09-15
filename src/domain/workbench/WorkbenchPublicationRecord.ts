/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义独立且按冻结工件寻址的本地知识发布记录。
 */
import { sha256, type ArtifactRef } from '../Domain.ts';
import { canonicalJson } from './StageTask.ts';
export const PUBLICATION_CONTRACT = 'workbench-publication-v1';
export interface PublicationFile { path: string; ref: ArtifactRef }
export interface PublicationIntent { projectId: string; versionIds: string[]; preparationRef: ArtifactRef; files: PublicationFile[] }
export interface PublicationRecord extends PublicationIntent {
  contractVersion: string; publicationId: string; status: 'PREPARED' | 'COMMITTED'; lastError: string | null; createdAt: string; updatedAt: string;
}
export function createPublication(intent: PublicationIntent, now: string): PublicationRecord {
  if (!intent.projectId || !intent.versionIds.length || new Set(intent.versionIds).size !== intent.versionIds.length
    || !intent.files.length || intent.files.length > 202 || new Set(intent.files.map(file => file.path)).size !== intent.files.length
    || intent.files.some(file => !/^(?:cards\/[A-Za-z0-9_-]{1,160}\.md|manifest\.json|evidence\.json)$/.test(file.path))
    || [intent.preparationRef, ...intent.files.map(file => file.ref)].some(ref => !ref || !/^[a-f0-9]{64}$/.test(ref.sha256))) throw new Error('PUBLICATION_INTENT_INVALID');
  const frozen: PublicationIntent = JSON.parse(canonicalJson({ ...intent, versionIds: [...intent.versionIds].sort(), files: [...intent.files].sort((a, b) => a.path.localeCompare(b.path)) }));
  const digest = sha256(canonicalJson({ contractVersion: PUBLICATION_CONTRACT, ...frozen }));
  return { ...frozen, contractVersion: PUBLICATION_CONTRACT, publicationId: `publication-${digest}`, status: 'PREPARED', lastError: null, createdAt: now, updatedAt: now };
}
export function assertPublicationRecord(record: PublicationRecord) {
  const expected = createPublication({ projectId: record.projectId, versionIds: record.versionIds, preparationRef: record.preparationRef, files: record.files }, record.createdAt);
  if (record.contractVersion !== PUBLICATION_CONTRACT || record.publicationId !== expected.publicationId) throw new Error('PUBLICATION_RECORD_CHANGED');
}
