/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：读取旧 OKF 卡片并转换为知识候选，保留来源证据且重新执行质量与行为验收。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import YAML from 'yaml';
/** 迁移只调用候选入库能力，历史 verified 标记不能直接触发发布。 */
export interface LegacyMigrationTarget {
  /** 通过现有入库链路接收转换后的候选正文，并返回去重与质量结果。 */
  ingestCandidate(input: {
    moduleId: string; body: string; title: string; description: string; category: string;
    tags: string[]; provenance: ProvenanceRef[]; metadata: Record<string, unknown>;
  }): Promise<{ replayed: boolean; quality: { outcome: string } }>;
}
import type { ProvenanceRef } from '../../Domain.ts';

interface LegacyCard {
  /** 提供元数据信息，供调用方读取或传入。 */
  metadata: Record<string, unknown>;
  /** 提供正文信息，供调用方读取或传入。 */
  body: string;
}

/** 解析LegacyCard。 */
export function parseLegacyCard(text: string): LegacyCard {
  const normalized = text.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return { metadata: {}, body: normalized.trim() };
  const end = normalized.indexOf('\n---\n', 4);
  if (end < 0) throw new Error('LEGACY_CARD_INVALID: unterminated YAML frontmatter');
  const metadata = YAML.parse(normalized.slice(4, end));
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error('LEGACY_CARD_INVALID: frontmatter must be an object');
  }
  return { metadata: metadata as Record<string, unknown>, body: normalized.slice(end + 5).trim() };
}

function normalizeSources(value: unknown): ProvenanceRef[] {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return items.flatMap((item): ProvenanceRef[] => {
    if (typeof item === 'string') return [{ path: item }];
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const source = item as Record<string, unknown>;
    const path = String(source.path ?? source.url ?? '').trim();
    if (!path) return [];
    return [{
      path,
      lines: source.lines ? String(source.lines) : undefined,
      commit: source.commit ? String(source.commit) : undefined,
      symbol: source.symbol ? String(source.symbol) : undefined,
      url: source.url ? String(source.url) : undefined,
      pinned: Boolean(source.pinned),
    }];
  });
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

/** 提供 migrateLegacyOkf 对应的migrateLegacyOkf操作。 */
export async function migrateLegacyOkf(input: {
  legacyKnowledgeRoot: string;
  service: LegacyMigrationTarget;
}): Promise<{
  imported: number;
  replayed: number;
  rejected: number;
  errors: { file: string; error: string }[];
}> {
  const result = { imported: 0, replayed: 0, rejected: 0, errors: [] as { file: string; error: string }[] };
  for (const legacyStatus of ['concepts', 'drafts']) {
    const directory = join(input.legacyKnowledgeRoot, legacyStatus);
    if (!existsSync(directory)) continue;
    for (const file of readdirSync(directory).filter((name) => name.endsWith('.md')).sort()) {
      const path = join(directory, file);
      try {
        const legacyPath = join(basename(input.legacyKnowledgeRoot), relative(input.legacyKnowledgeRoot, path)).replace(/\\/g, '/');
        const card = parseLegacyCard(readFileSync(path, 'utf8'));
        const moduleId = String(card.metadata.name ?? basename(file, '.md'));
        const provenance = normalizeSources(card.metadata.sources);
        if (!provenance.length) provenance.push({ path: legacyPath, pinned: false });
        const migrated = await input.service.ingestCandidate({
          moduleId,
          body: card.body,
          title: String(card.metadata.title ?? moduleId),
          description: String(card.metadata.description ?? ''),
          category: String(card.metadata.category ?? ''),
          tags: stringList(card.metadata.tags),
          provenance,
          metadata: {
            legacyStatus: String(card.metadata.status ?? legacyStatus),
            legacyVerified: card.metadata.verified === true,
            legacyVersion: Number(card.metadata.version ?? 1),
            requiresBehavioralVerification: true,
            migratedFrom: legacyPath,
          },
        });
        if (migrated.replayed) result.replayed += 1;
        else result.imported += 1;
        if (migrated.quality.outcome === 'REJECTED') result.rejected += 1;
      } catch (error) {
        result.errors.push({ file: path, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  return result;
}
