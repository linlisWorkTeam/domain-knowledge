/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：读取并校验删除清单的递归工件引用，保留共享文件及嵌套实体依赖。
 */
import { assertArtifactRef, sha256, type ArtifactRef } from '../../domain/Domain.ts';
import type { DeletionNode } from '../../domain/workbench/BatchDeletion.ts';
import type { ArtifactStore } from '../ports/ApplicationPorts.ts';
export interface DeletionArtifactSeed { ownerId: string; refs: ArtifactRef[]; artifactIds: string[] }

/** 仅返回引用，不向删除预览传播配置或文档正文。 */
export function deletionArtifactSeed(ownerId: string, value: unknown): DeletionArtifactSeed {
  const refs: ArtifactRef[] = [], ids = new Set<string>(), pending = [value]; let visited = 0;
  while (pending.length) {
    if (++visited > 1000000) throw new Error('DELETION_RECORD_TOO_LARGE');
    const item = pending.pop();
    if (typeof item === 'string' && /^sha256:[a-f0-9]{64}$/.test(item)) ids.add(item);
    if (!item || typeof item !== 'object') continue;
    if (!Array.isArray(item) && 'artifactId' in item && 'sha256' in item && 'size' in item && 'mediaType' in item) {
      const ref = item as ArtifactRef; assertArtifactRef(ref);
      refs.push({ artifactId: ref.artifactId, sha256: ref.sha256, size: ref.size, mediaType: ref.mediaType });
    }
    const children = Array.isArray(item) ? item : Object.values(item);
    for (const child of children) pending.push(child);
  }
  return { ownerId, refs, artifactIds: [...ids].sort() };
}

/** 串行读取，每份内容仅加载一次；仅构建图，不删除文件或改变数据库。 */
export async function expandDeletionArtifacts(input: {
  nodes: DeletionNode[]; seeds: DeletionArtifactSeed[];
  identities: Array<{ value: string; nodeId: string }>;
  artifacts: Pick<ArtifactStore, 'get'>;
}): Promise<DeletionNode[]> {
  const nodes = new Map(input.nodes.map(node => [node.id, { ...node, ownedBy: [...node.ownedBy], references: [...node.references] }]));
  if (nodes.size !== input.nodes.length) throw new Error('DELETION_INVENTORY_INVALID');
  const refs = new Map<string, ArtifactRef>(), queue: ArtifactRef[] = [], links = [...input.seeds];
  const identities = new Map<string, string[]>();
  for (const identity of input.identities) {
    if (!nodes.has(identity.nodeId)) throw new Error('DELETION_INVENTORY_INVALID');
    const list = identities.get(identity.value) ?? []; list.push(identity.nodeId); identities.set(identity.value, list);
  }
  const register = (ref: ArtifactRef) => {
    assertArtifactRef(ref);
    const previous = refs.get(ref.artifactId);
    if (previous && previous.size !== ref.size) throw new Error('DELETION_ARTIFACT_REFERENCE_CONFLICT');
    if (previous) return;
    if (ref.size > 32 * 1024 * 1024 || nodes.size + queue.length >= 100000) throw new Error('DELETION_ARTIFACT_LIMIT');
    refs.set(ref.artifactId, ref); queue.push(ref);
  };
  for (const seed of links) { if (!nodes.has(seed.ownerId)) throw new Error('DELETION_INVENTORY_INVALID'); for (const ref of seed.refs) register(ref); }
  let loadedBytes = 0;
  for (let index = 0; index < queue.length; index++) {
    const ref = queue[index]!;
    loadedBytes += ref.size;
    if (loadedBytes > 256 * 1024 * 1024) throw new Error('DELETION_ARTIFACT_LIMIT');
    const bytes = await input.artifacts.get(ref);
    if (bytes.byteLength !== ref.size || sha256(bytes) !== ref.sha256) throw new Error('DELETION_ARTIFACT_CORRUPT');
    const id = `cas/${ref.artifactId}`;
    if (nodes.has(id)) throw new Error('DELETION_INVENTORY_INVALID');
    const node: DeletionNode = { id, kind: 'artifact', revision: ref.sha256, bytes: ref.size, ownedBy: [], references: [] };
    nodes.set(id, node);
    const text = new TextDecoder().decode(bytes).trim(); let parsed: unknown;
    try { parsed = JSON.parse(text); }
    catch { if (/json/i.test(ref.mediaType)) throw new Error('DELETION_ARTIFACT_JSON_INVALID'); continue; }
    const seed = deletionArtifactSeed(id, parsed); links.push(seed);
    for (const child of seed.refs) register(child);
    const pending: unknown[] = [parsed];
    while (pending.length) {
      const value = pending.pop();
      if (typeof value === 'string') node.references.push(...identities.get(value) ?? []);
      else if (value && typeof value === 'object') for (const child of Array.isArray(value) ? value : Object.values(value)) pending.push(child);
    }
  }
  for (const seed of links) for (const artifactId of new Set([...seed.artifactIds, ...seed.refs.map(ref => ref.artifactId)])) {
    const artifact = nodes.get(`cas/${artifactId}`);
    if (!artifact) throw new Error('DELETION_ARTIFACT_REFERENCE_UNRESOLVED', { cause: { ownerId: seed.ownerId, artifactId } });
    if (artifact.id === seed.ownerId) continue;
    artifact.ownedBy.push(seed.ownerId); nodes.get(seed.ownerId)!.references.push(artifact.id);
  }
  for (const node of nodes.values()) {
    node.ownedBy = [...new Set(node.ownedBy)].sort(); node.references = [...new Set(node.references)].sort();
  }
  return [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id));
}
