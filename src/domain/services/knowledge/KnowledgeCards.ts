/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：按稳定身份组织卡片版本，保留旧版正文与门禁事实。
 */
import { sha256, type KnowledgeVersion } from '../../Domain.ts';

/** 当前卡片与不可变历史；缺失仓库身份的旧记录仅按可证明的血缘归组。 */
export interface KnowledgeCard {
  cardId: string;
  current: KnowledgeVersion;
  versions: KnowledgeVersion[];
  identitySource: 'explicit' | 'repository-module' | 'legacy-lineage';
}

/** 标题和源码提交不参与身份计算，避免标题修改或源码升级产生另一张卡片。 */
export function groupKnowledgeCards(versions: KnowledgeVersion[]): KnowledgeCard[] {
  const byVersion = new Map(versions.map((version) => [version.versionId, version]));
  const groups = new Map<string, KnowledgeCard>();
  for (const version of versions) {
    const explicit = version.metadata.cardId;
    const repository = version.metadata.repositoryId;
    let root = version;
    const visited = new Set<string>();
    while (root.parentVersionId && byVersion.has(root.parentVersionId)) {
      if (visited.has(root.versionId)) throw new Error('KNOWLEDGE_LINEAGE_CYCLE');
      visited.add(root.versionId);
      const parent = byVersion.get(root.parentVersionId)!;
      if (parent.moduleId !== version.moduleId) break;
      root = parent;
    }
    const identitySource = typeof explicit === 'string' && explicit.length > 0 ? 'explicit'
      : typeof repository === 'string' && repository.length > 0 ? 'repository-module' : 'legacy-lineage';
    const cardId = identitySource === 'explicit' ? explicit as string
      : `card-${sha256(JSON.stringify(identitySource === 'repository-module'
        ? [repository, version.moduleId] : ['legacy', root.versionId])).slice(0, 32)}`;
    const group = groups.get(cardId);
    if (group) group.versions.push(version);
    else groups.set(cardId, { cardId, current: version, versions: [version], identitySource });
  }
  for (const group of groups.values()) {
    group.versions.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.versionId.localeCompare(a.versionId));
    // 父子同毫秒落盘时仍以叶版本为当前版本。
    const parents = new Set(group.versions.map((version) => version.parentVersionId));
    group.current = group.versions.find((version) => !parents.has(version.versionId)) ?? group.versions[0]!;
  }
  return [...groups.values()].sort((a, b) => b.current.createdAt.localeCompare(a.current.createdAt) || a.cardId.localeCompare(b.cardId));
}

/** 只选择同项目快照内可证明为原卡片后代的当前头，不跨源码版本接续。 */
export function currentCardVersions(versions: KnowledgeVersion[], snapshotId: string, baseIds: string[]): string[] {
  if (!baseIds.length || new Set(baseIds).size !== baseIds.length) throw new Error('PIPELINE_CARD_SELECTION_INVALID');
  const groups = groupKnowledgeCards(versions);
  return baseIds.map(id => {
    const group = groups.find(card => card.versions.some(version => version.versionId === id));
    const base = group?.versions.find(version => version.versionId === id);
    if (!group || !base || base.metadata.projectSnapshotId !== snapshotId || group.current.metadata.projectSnapshotId !== snapshotId) throw new Error('PIPELINE_CARD_SNAPSHOT_CHANGED');
    const byId = new Map(group.versions.map(version => [version.versionId, version]));
    let cursor: KnowledgeVersion | undefined = group.current;
    const visited = new Set<string>();
    while (cursor && cursor.versionId !== id) {
      if (visited.has(cursor.versionId)) throw new Error('KNOWLEDGE_LINEAGE_CYCLE');
      visited.add(cursor.versionId);
      if (cursor.moduleId !== base.moduleId || cursor.metadata.projectSnapshotId !== snapshotId) throw new Error('PIPELINE_CARD_LINEAGE_CHANGED');
      cursor = cursor.parentVersionId ? byId.get(cursor.parentVersionId) : undefined;
    }
    if (!cursor) throw new Error('PIPELINE_CARD_LINEAGE_CHANGED');
    return group.current.versionId;
  }).sort();
}
