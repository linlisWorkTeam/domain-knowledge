/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：从指定材料的明确符号提及建立有版本证据的外部引用。
 */
import { sha256 } from '../Domain.ts';
import type { AssociationCard } from './CardAssociations.ts';
import type { ExternalMaterial } from './ExternalMaterial.ts';
export interface ExternalAssociation {
  relationId: string; kind: 'EXTERNAL_SYMBOL_MENTION'; cardId: string; versionId: string; bodyDigest: string;
  materialId: string; rawDigest: string; materialDigest: string; sourceId: string; sourceRevision: string; locator: string; title: string;
  evidence: { line: number; symbol: string; excerpt: string }; reason: string;
  cardApplicability: string; materialApplicability: string; replacementVerified: false;
}
export function associateExternalMaterials(cards: readonly AssociationCard[], materials: readonly { material: ExternalMaterial; text: string }[]): ExternalAssociation[] {
  if (materials.length > 32 || new Set(materials.map(({ material }) => material.materialId)).size !== materials.length || cards.length > 1000) throw new Error('ASSOCIATION_SELECTION_INVALID');
  const relations: ExternalAssociation[] = [];
  for (const { material, text } of materials) for (const card of cards) {
    const symbol = card.symbol.replace(/^@type:/, '');
    if (!/^[A-Za-z_][\w]*(?:::[A-Za-z_][\w]*)*$/.test(symbol)) continue;
    const pattern = new RegExp(`(?<![A-Za-z0-9_:])${symbol}(?![A-Za-z0-9_:])`);
    const lines = text.split(/\r?\n/); const index = lines.findIndex((line) => pattern.test(line));
    if (index < 0) continue;
    if (relations.length >= 10000) throw new Error('ASSOCIATION_LIMIT_EXCEEDED');
    const offset = lines[index]!.search(pattern);
    relations.push({ relationId: `external-relation-${sha256(JSON.stringify([card.versionId, card.bodyDigest, material.materialId, material.textRef.sha256, index, symbol]))}`,
      kind: 'EXTERNAL_SYMBOL_MENTION', cardId: card.cardId, versionId: card.versionId, bodyDigest: card.bodyDigest,
      materialId: material.materialId, rawDigest: material.rawRef.sha256, materialDigest: material.textRef.sha256, sourceId: material.sourceId,
      sourceRevision: material.sourceRevision, locator: material.locator, title: material.title,
      evidence: { line: index + 1, symbol, excerpt: lines[index]!.slice(Math.max(0, offset - 100), offset + symbol.length + 200) },
      reason: `指定材料正文第 ${index + 1} 行提及 ${symbol}`, cardApplicability: card.applicability,
      materialApplicability: material.applicability, replacementVerified: false });
  }
  return relations.sort((a, b) => a.relationId.localeCompare(b.relationId));
}
