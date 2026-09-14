/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义卡片索引元数据、内容失效摘要及确定性摘要匹配。
 */
import { sha256, type ArtifactRef, type KnowledgeVersion } from '../Domain.ts';

export const CARD_INDEX_VERSION = 'card-index-v1';
export interface CardIndexHeader {
  cardId: string; versionId: string; name: string; purpose: string; applicability: string;
  language: string; module: string; keywords: string[]; sourceVersions: string[]; summary: string;
}
export interface CardIndexEntry {
  schemaVersion: typeof CARD_INDEX_VERSION;
  cardId: string; versionId: string; sourceDigest: string; bodyDigest: string;
  header: CardIndexHeader; yamlRef: ArtifactRef; markdownRef: ArtifactRef; updatedAt: string;
}
/** 正文摘要用于内容缓存，索引摘要同时绑定元数据；改标题不会伪装成正文变化。 */
export function cardIndexSourceDigest(cardId: string, version: KnowledgeVersion): string {
  return sha256(JSON.stringify([CARD_INDEX_VERSION, cardId, version.versionId, version.bodyRef.sha256,
    version.title, version.description, version.moduleId, version.tags, version.provenance,
    version.metadata.applicability ?? '', version.metadata.language ?? '', version.metadata.sourceModule ?? '', version.status]));
}
/** 只提取确定性的正文摘要；缺适用条件时明确未提供，不推测源码行为。 */
export function cardIndexHeader(cardId: string, version: KnowledgeVersion, body: string): CardIndexHeader {
  const paths = version.provenance.map((item) => item.path);
  const language = typeof version.metadata.language === 'string' ? version.metadata.language
    : paths.some((path) => /\.(cpp|cc|cxx|hpp|hxx)$/.test(path)) ? 'cpp'
    : paths.some((path) => /\.(c|h)$/.test(path)) ? 'c'
    : paths.some((path) => /\.(ts|tsx)$/.test(path)) ? 'typescript' : 'unknown';
  return { cardId, versionId: version.versionId, name: version.title, purpose: version.description,
    applicability: typeof version.metadata.applicability === 'string' ? version.metadata.applicability : '未提供适用条件',
    language, module: typeof version.metadata.sourceModule === 'string' ? version.metadata.sourceModule : version.moduleId, keywords: [...new Set(version.tags)],
    sourceVersions: [...new Set(version.provenance.map((source) => source.commit).filter((commit): commit is string => !!commit))],
    summary: body.replace(/```[\s\S]*?```/g, ' ').replace(/[#*_>`|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 800),
  };
}
/** 检索只处理摘要和索引字段；命中原因携带实际匹配词，不生成臆测说明。 */
export function matchCardIndex(header: CardIndexHeader, query: string): { score: number; terms: string[]; fields: string[] } {
  const normalized = query.toLowerCase();
  const phrases = normalized.match(/[\u3400-\u9fff]+/g) ?? [];
  const terms = [...new Set([...(normalized.match(/[a-z0-9_+-]+/g) ?? []),
    ...phrases.flatMap((phrase) => [phrase, ...[...phrase].slice(0, -1).map((char, index) => char + phrase[index + 1])])])];
  const fields: Array<[string, string, number]> = [
    ['name', header.name, 4], ['module', header.module, 3], ['keywords', header.keywords.join(' '), 3],
    ['purpose', header.purpose, 2], ['applicability', header.applicability, 1], ['summary', header.summary, 1],
  ];
  const matchedTerms = new Set<string>(); const matchedFields = new Set<string>(); let score = 0;
  for (const [name, text, weight] of fields) for (const term of terms) if (text.toLowerCase().includes(term)) {
    matchedTerms.add(term); matchedFields.add(name); score += weight;
  }
  return { score: terms.length ? score : 1,
    terms: [...matchedTerms].filter((term) => ![...matchedTerms].some((other) => other !== term && other.includes(term))),
    fields: [...matchedFields] };
}
