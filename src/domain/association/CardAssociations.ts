/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：按明确符号引用建立可审计、绑定版本的库内卡片关系。
 */
import { sha256 } from '../Domain.ts';
export const CARD_ASSOCIATION_CONTRACT = 'card-associations-v3';
export interface AssociationCard {
  cardId: string; versionId: string; bodyDigest: string; body: string; symbol: string;
  repositoryId: string; sourceRevision: string; applicability: string;
}
export interface CardAssociation {
  relationId: string; kind: 'SYMBOL_MENTION'; fromCardId: string; fromVersionId: string;
  toCardId: string; toVersionId: string; fromBodyDigest: string; toBodyDigest: string;
  sourceRevision: string; evidence: { line: number; symbol: string; matchedSymbol?: string; excerpt: string };
  reason: string; applicability: string; fromApplicability: string; replacementVerified: false;
}
/** 只证明某段文字提及公开符号，不从共现推导行为等价或可替代性。 */
export function associateCards(cards: readonly AssociationCard[]): CardAssociation[] {
  if (cards.length > 1000 || new Set(cards.map((card) => card.cardId)).size !== cards.length) throw new Error('ASSOCIATION_SELECTION_INVALID');
  const output: CardAssociation[] = [];
  for (const from of cards) for (const to of cards) {
    if (from.cardId === to.cardId || !from.repositoryId || from.repositoryId !== to.repositoryId
      || !from.sourceRevision || from.sourceRevision !== to.sourceRevision) continue;
    const symbol = to.symbol.replace(/^@type:/, '');
    if (!/^[A-Za-z_][\w]*(?:::[A-Za-z_][\w]*)*$/.test(symbol)) continue;
    const symbols = [symbol];
    const fromParts = from.symbol.replace(/^@type:/, '').split('::'), toParts = symbol.split('::');
    // 只解析同一完整父作用域中成员的 Owner::member 写法，不猜测裸名称或其他命名空间。
    if (toParts.length >= 3 && fromParts.slice(0, -1).join('::') === toParts.slice(0, -1).join('::')) symbols.push(toParts.slice(-2).join('::'));
    const pattern = new RegExp(`(?<![A-Za-z0-9_:])(?:${symbols.join('|')})(?![A-Za-z0-9_:])`);
    const lines = from.body.split(/\r?\n/); const index = lines.findIndex((line) => pattern.test(line));
    if (index < 0) continue;
    const offset = lines[index]!.search(pattern);
    const matchedSymbol = lines[index]!.match(pattern)![0];
    const excerpt = lines[index]!.slice(Math.max(0, offset - 100), offset + matchedSymbol.length + 200);
    if (output.length >= 10000) throw new Error('ASSOCIATION_LIMIT_EXCEEDED');
    output.push({ relationId: `relation-${sha256(JSON.stringify([from.versionId, to.versionId, from.bodyDigest, to.bodyDigest, index, symbol]))}`,
      kind: 'SYMBOL_MENTION', fromCardId: from.cardId, fromVersionId: from.versionId, toCardId: to.cardId, toVersionId: to.versionId,
      fromBodyDigest: from.bodyDigest, toBodyDigest: to.bodyDigest, sourceRevision: from.sourceRevision,
      evidence: { line: index + 1, symbol, ...(matchedSymbol !== symbol ? { matchedSymbol } : {}), excerpt }, reason: `正文第 ${index + 1} 行引用 ${matchedSymbol}${matchedSymbol !== symbol ? `，在双方相同作用域中对应 ${symbol}` : ''}`,
      applicability: to.applicability, fromApplicability: from.applicability, replacementVerified: false });
  }
  return output.sort((a, b) => a.relationId.localeCompare(b.relationId));
}
