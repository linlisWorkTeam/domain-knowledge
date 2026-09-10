/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：判定完整卡片来源复核及冻结版本覆盖，不授予发布资格。
 */
import type { Output as ReviewOutput } from '../../agents/reviewAgent/ReviewAgentContract.ts';
import { markdownSections } from './KnowledgeSections.ts';
import { knowledgeRevisionDecision } from './KnowledgeRevision.ts';
export const SOURCE_VERIFICATION_CONTRACT = 'knowledge-source-verification-v1';
export interface SourceCardBinding { cardId: string; versionId: string; moduleId: string; bodyDigest: string }
export type SourceCardOutcome = 'SOURCE_MATCHED' | 'SOURCE_MISMATCH' | 'UNRESOLVED';
export interface SourceCardResult extends SourceCardBinding { outcome: SourceCardOutcome }
/** 未修改的卡片仍需检查全部H2，失败归因的PASS不能替代本次独立复核。 */
export function sourceCardDecision(moduleId: string, body: string, review: ReviewOutput) {
  const headings = markdownSections(body).map(section => section.heading);
  if (!headings.length || new Set(headings).size !== headings.length) throw new Error('SOURCE_VERIFICATION_SECTIONS_REQUIRED');
  const decision = knowledgeRevisionDecision(review, moduleId, headings);
  const outcome: SourceCardOutcome = decision.unresolved.length ? 'UNRESOLVED' : decision.heading ? 'SOURCE_MISMATCH' : 'SOURCE_MATCHED';
  return { outcome, ...decision };
}
/** 完整覆盖冻结卡片及正文；旧版本、遗漏或重复结果不能作为整体通过证据。 */
export function sourceVerificationOutcome(expected: SourceCardBinding[], results: SourceCardResult[]): SourceCardOutcome {
  if (!expected.length || expected.length > 200 || expected.length !== results.length
    || expected.some(card => !card.cardId || !card.versionId || !card.moduleId || !/^[a-f0-9]{64}$/.test(card.bodyDigest))
    || new Set(expected.map(card => card.cardId)).size !== expected.length
    || new Set(expected.map(card => card.versionId)).size !== expected.length
    || new Set(results.map(card => card.cardId)).size !== results.length) throw new Error('SOURCE_VERIFICATION_BINDING_INVALID');
  for (const card of expected) {
    const result = results.find(item => item.cardId === card.cardId);
    if (!result || result.versionId !== card.versionId || result.moduleId !== card.moduleId || result.bodyDigest !== card.bodyDigest
      || !['SOURCE_MATCHED', 'SOURCE_MISMATCH', 'UNRESOLVED'].includes(result.outcome)) throw new Error('SOURCE_VERIFICATION_BINDING_INVALID');
  }
  return results.some(card => card.outcome === 'UNRESOLVED') ? 'UNRESOLVED'
    : results.some(card => card.outcome === 'SOURCE_MISMATCH') ? 'SOURCE_MISMATCH' : 'SOURCE_MATCHED';
}
