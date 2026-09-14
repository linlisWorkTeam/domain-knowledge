/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：读取并校验删除清单的递归工件引用，保留共享文件及嵌套实体依赖。
 */
import { assertArtifactRef, sha256, type ArtifactRef } from '../../domain/Domain.ts';
import type { DeletionNode } from '../../domain/workbench/BatchDeletion.ts';
import type { DeletionArtifactReader } from '../ports/DeletionArtifactPorts.ts';
export interface DeletionArtifactSeed { ownerId: string; refs: ArtifactRef[]; artifactIds: string[] }
export interface DeletionArtifactGraph { nodes: DeletionNode[]; missingArtifacts: Array<{ artifactId: string; ownerIds: string[] }> }

/** 仅返回引用，不向删除预览传播配置或文档正文。 */
export function deletionArtifactSeed(ownerId: string, value: unknown): DeletionArtifactSeed {
  const refs: ArtifactRef[] = [], ids = new Set<string>();
  const pending: Array<{ value: unknown; key: string; artifactSubject?: boolean }> = [{ value, key: '' }]; let visited = 0;
  while (pending.length) {
    if (++visited > 1000000) throw new Error('DELETION_RECORD_TOO_LARGE');
    const current = pending.pop()!, item = current.value;
    // 指纹、源码版本和工具链摘要同样可能有 sha256: 前缀，不能凭前缀认定是文件。
    if (typeof item === 'string' && /^sha256:[a-f0-9]{64}$/.test(item)
      && (!current.key || /(?:artifact_?ids?|refs?)(?:_json)?$/i.test(current.key) || current.artifactSubject)) ids.add(item);
    if (!item || typeof item !== 'object') continue;
    if (!Array.isArray(item) && 'artifactId' in item && 'sha256' in item && 'size' in item && 'mediaType' in item) {
      const ref = item as ArtifactRef; assertArtifactRef(ref);
      refs.push({ artifactId: ref.artifactId, sha256: ref.sha256, size: ref.size, mediaType: ref.mediaType });
    }
    if (Array.isArray(item)) for (const child of item) pending.push({ value: child, key: current.key });
    else for (const [key, child] of Object.entries(item)) pending.push({ value: child, key,
      artifactSubject: ['subject_id', 'subjectId'].includes(key)
        && ['ARTIFACT', 'artifact'].includes(String((item as Record<string, unknown>).subject_kind ?? (item as Record<string, unknown>).subjectKind)) });
  }
  return { ownerId, refs, artifactIds: [...ids].sort() };
}

/** 串行读取，每份内容仅加载一次；仅构建图，不删除文件或改变数据库。 */
export async function expandDeletionArtifacts(input: {
  nodes: DeletionNode[]; seeds: DeletionArtifactSeed[];
  identities: Array<{ value: string; nodeId: string }>;
  reader: DeletionArtifactReader;
}): Promise<DeletionArtifactGraph> {
  const nodes = new Map<string, DeletionNode>(input.nodes.map(node => [node.id, { ...node, ownedBy: [...node.ownedBy], references: [...node.references], auditReferences: [...(node.auditReferences ?? [])] }]));
  if (nodes.size !== input.nodes.length) throw new Error('DELETION_INVENTORY_INVALID');
  const refs = new Map<string, ArtifactRef>(), queue: string[] = [], queued = new Set<string>(), links = [...input.seeds];
  const missing = new Set<string>(), jsonStates = new Map<string, boolean>();
  const identities = new Map<string, string[]>();
  for (const identity of input.identities) {
    if (!nodes.has(identity.nodeId)) throw new Error('DELETION_INVENTORY_INVALID');
    const list = identities.get(identity.value) ?? []; list.push(identity.nodeId); identities.set(identity.value, list);
  }
  const enqueue = (artifactId: string) => {
    if (!/^sha256:[a-f0-9]{64}$/.test(artifactId)) throw new Error('DELETION_ARTIFACT_ID_INVALID');
    if (queued.has(artifactId)) return;
    if (input.nodes.length + queue.length >= 100000) throw new Error('DELETION_ARTIFACT_LIMIT');
    queued.add(artifactId); queue.push(artifactId);
  };
  const register = (ref: ArtifactRef) => {
    assertArtifactRef(ref);
    const previous = refs.get(ref.artifactId);
    if (previous && previous.size !== ref.size) throw new Error('DELETION_ARTIFACT_REFERENCE_CONFLICT');
    const loaded = nodes.get(`cas/${ref.artifactId}`);
    if (loaded && !missing.has(ref.artifactId) && loaded.bytes !== ref.size) throw new Error('DELETION_ARTIFACT_REFERENCE_CONFLICT');
    if (/json/i.test(ref.mediaType) && jsonStates.get(ref.artifactId) === false) throw new Error('DELETION_ARTIFACT_JSON_INVALID');
    if (ref.size > 32 * 1024 * 1024) throw new Error('DELETION_ARTIFACT_LIMIT');
    if (!previous || /json/i.test(ref.mediaType)) refs.set(ref.artifactId, { ...ref });
    enqueue(ref.artifactId);
  };
  const addSeed = (seed: DeletionArtifactSeed) => { for (const ref of seed.refs) register(ref); for (const id of seed.artifactIds) enqueue(id); };
  for (const seed of links) { if (!nodes.has(seed.ownerId)) throw new Error('DELETION_INVENTORY_INVALID'); addSeed(seed); }
  let loadedBytes = 0;
  for (let index = 0; index < queue.length; index++) {
    const artifactId = queue[index]!, ref = refs.get(artifactId), digest = artifactId.slice(7);
    const bytes = await input.reader.read(artifactId, Math.min(32 * 1024 * 1024, 256 * 1024 * 1024 - loadedBytes));
    const id = `cas/${artifactId}`;
    if (nodes.has(id)) throw new Error('DELETION_INVENTORY_INVALID');
    if (bytes === null) {
      missing.add(artifactId);
      nodes.set(id, { id, kind: 'artifact', revision: `missing:${digest}`, bytes: 0, ownedBy: [], references: [] });
      continue;
    }
    loadedBytes += bytes.byteLength;
    if (bytes.byteLength > 32 * 1024 * 1024 || loadedBytes > 256 * 1024 * 1024) throw new Error('DELETION_ARTIFACT_LIMIT');
    if ((ref && bytes.byteLength !== ref.size) || sha256(bytes) !== digest) throw new Error('DELETION_ARTIFACT_CORRUPT');
    const node: DeletionNode = { id, kind: 'artifact', revision: digest, bytes: bytes.byteLength, ownedBy: [], references: [] };
    nodes.set(id, node);
    const text = new TextDecoder().decode(bytes).trim(); let parsed: unknown;
    try { parsed = JSON.parse(text); }
    catch { jsonStates.set(artifactId, false); if (ref && /json/i.test(ref.mediaType)) throw new Error('DELETION_ARTIFACT_JSON_INVALID'); continue; }
    jsonStates.set(artifactId, true);
    const seed = deletionArtifactSeed(id, parsed); links.push(seed);
    addSeed(seed);
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
  return { nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    missingArtifacts: [...missing].sort().map(artifactId => ({ artifactId, ownerIds: nodes.get(`cas/${artifactId}`)!.ownedBy })) };
}
