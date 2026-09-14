/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：依据归属和引用计算批次删除清单，绑定二次确认且保留共享产物。
 */
import { sha256 } from '../Domain.ts';
const deletionKinds = ['batch', 'run', 'pipeline', 'stage', 'knowledge', 'index', 'association', 'testSet', 'publication', 'artifact', 'source', 'configuration'] as const;
export type DeletionKind = typeof deletionKinds[number];
export interface DeletionNode {
  id: string; kind: DeletionKind; revision: string;
  ownedBy: string[]; references: string[];
  active?: boolean; bytes?: number;
}
export interface BatchDeletionPlan {
  schemaVersion: 'batch-deletion-v1'; planId: string; targetId: string;
  deleteIds: string[]; preservedIds: string[];
  counts: Partial<Record<DeletionKind, number>>; reclaimableBytes: number;
}
/** 独占归属才可删除；外部引用及其传递依赖始终保留。 */
export function planBatchDeletion(targetId: string, input: DeletionNode[]): BatchDeletionPlan {
  if (typeof targetId !== 'string' || !targetId || !Array.isArray(input) || input.length > 100000
    || input.some(node => !node || typeof node !== 'object' || Array.isArray(node)
      || typeof node.id !== 'string' || !node.id || typeof node.revision !== 'string' || !node.revision
      || !deletionKinds.includes(node.kind)
      || Object.keys(node).some(key => !['id', 'kind', 'revision', 'ownedBy', 'references', 'active', 'bytes'].includes(key))
      || node.active !== undefined && typeof node.active !== 'boolean'
      || !Array.isArray(node.ownedBy) || !Array.isArray(node.references)
      || [...node.ownedBy, ...node.references].some(id => typeof id !== 'string' || !id)
      || new Set(node.ownedBy).size !== node.ownedBy.length || new Set(node.references).size !== node.references.length)) throw new Error('DELETION_INVENTORY_INVALID');
  const nodes = [...input].sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map(nodes.map(node => [node.id, node]));
  if (byId.size !== nodes.length || nodes.some(node => !node.id || !node.revision || !Array.isArray(node.ownedBy) || !Array.isArray(node.references)
    || [...node.ownedBy, ...node.references].some(id => !byId.has(id))
    || (node.bytes !== undefined && (!Number.isSafeInteger(node.bytes) || node.bytes < 0)))) throw new Error('DELETION_INVENTORY_INVALID');
  const target = byId.get(targetId);
  if (!target || !['batch', 'run'].includes(target.kind)) throw new Error('DELETION_TARGET_NOT_FOUND');
  const owned = new Map<string, string[]>();
  for (const node of nodes) for (const owner of node.ownedBy) { const children = owned.get(owner) ?? []; children.push(node.id); owned.set(owner, children); }
  const candidates = new Set([targetId]), pending = [targetId];
  for (let index = 0; index < pending.length; index++) for (const child of owned.get(pending[index]!) ?? []) {
    if (!candidates.has(child)) { candidates.add(child); pending.push(child); }
  }
  if ([...candidates].some(id => byId.get(id)!.active)) throw new Error('DELETION_EXECUTION_ACTIVE');
  const retained = new Set<string>(), visit: string[] = [];
  const retain = (id: string) => { if (!retained.has(id)) { retained.add(id); visit.push(id); } };
  for (const node of nodes) if (!candidates.has(node.id) || ['source', 'configuration'].includes(node.kind)
    || node.ownedBy.some(owner => !candidates.has(owner))) retain(node.id);
  for (let index = 0; index < visit.length; index++) {
    const node = byId.get(visit[index]!)!;
    for (const reference of node.references) retain(reference);
    // 保留的共享父产物也必须保留它独占的文件及派生索引。
    for (const child of owned.get(node.id) ?? []) retain(child);
  }
  if (retained.has(targetId)) throw new Error('DELETION_TARGET_REFERENCED');
  const deleteIds = [...candidates].filter(id => !retained.has(id)).sort();
  const preservedIds = [...candidates].filter(id => retained.has(id)).sort();
  const counts: BatchDeletionPlan['counts'] = {}; let reclaimableBytes = 0;
  for (const id of deleteIds) { const node = byId.get(id)!; counts[node.kind] = (counts[node.kind] ?? 0) + 1; reclaimableBytes += node.bytes ?? 0; }
  if (!Number.isSafeInteger(reclaimableBytes)) throw new Error('DELETION_INVENTORY_INVALID');
  const inventory = nodes.map(node => ({ id: node.id, kind: node.kind, revision: node.revision,
    ownedBy: [...node.ownedBy].sort(), references: [...node.references].sort(), active: node.active ?? false, bytes: node.bytes ?? 0 }));
  const planId = `delete-${sha256(JSON.stringify({ schemaVersion: 'batch-deletion-v1', targetId, inventory }))}`;
  return { schemaVersion: 'batch-deletion-v1', planId, targetId, deleteIds, preservedIds, counts, reclaimableBytes };
}
export function assertBatchDeletionConfirmation(plan: BatchDeletionPlan, confirmation: unknown): void {
  if (!confirmation || typeof confirmation !== 'object' || Array.isArray(confirmation)
    || Object.keys(confirmation).sort().join(',') !== 'confirmed,planId'
    || !('confirmed' in confirmation) || confirmation.confirmed !== true
    || !('planId' in confirmation) || confirmation.planId !== plan.planId) throw new Error('DELETION_CONFIRMATION_CHANGED');
}
