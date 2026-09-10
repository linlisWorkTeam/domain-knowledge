/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：判定完整卡片来源复核及冻结版本覆盖，不授予发布资格。
 */
import type { Output as ReviewOutput } from '../../agents/reviewAgent/ReviewAgentContract.ts';
import { markdownSections } from './KnowledgeSections.ts';
import type { NativeBehaviorSuite, NativeScalar } from '../evaluation/NativeBehaviorSuite.ts';
import { nativeOracleTrusted } from '../evaluation/NativeTestCache.ts';
import { knowledgeRevisionDecision } from './KnowledgeRevision.ts';
export const SOURCE_VERIFICATION_CONTRACT = 'knowledge-source-verification-v3';
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

/** 分章执行仍需完整覆盖整卡；遗漏章节和跨章节意见不能成为来源通过。 */
export function sourceSectionDecision(moduleId: string, body: string, heading: string, review: ReviewOutput) {
  const headings = markdownSections(body).map(section => section.heading);
  if (!headings.includes(heading)) throw new Error('SOURCE_VERIFICATION_SECTION_INVALID');
  const decision = sourceCardDecision(moduleId, body, review);
  if (decision.heading && decision.heading !== heading) throw new Error('SOURCE_VERIFICATION_SECTION_INVALID');
  return decision;
}
export function sourceSectionsOutcome(body: string, results: Array<{ section: string; outcome: SourceCardOutcome }>): SourceCardOutcome {
  const headings = markdownSections(body).map(section => section.heading);
  if (!headings.length || new Set(headings).size !== headings.length || results.length !== headings.length
    || new Set(results.map(result => result.section)).size !== headings.length
    || results.some(result => !headings.includes(result.section) || !['SOURCE_MATCHED', 'SOURCE_MISMATCH', 'UNRESOLVED'].includes(result.outcome))) throw new Error('SOURCE_VERIFICATION_SECTION_INVALID');
  return results.some(result => result.outcome === 'UNRESOLVED') ? 'UNRESOLVED'
    : results.some(result => result.outcome === 'SOURCE_MISMATCH') ? 'SOURCE_MISMATCH' : 'SOURCE_MATCHED';
}

/** 先验证整套参考证据，再按精确卡片和章节投影；无行为证据不等于来源通过。 */
export function sourceSectionObservations(suite: NativeBehaviorSuite, oracle: Array<{ caseId: string; status: 'PASSED' | 'FAILED'; actual: Record<string, NativeScalar> | null }>, cardId: string, heading: string) {
  if (!nativeOracleTrusted(suite, oracle)) throw new Error('REVISION_REFERENCE_NOT_TRUSTED');
  if (!cardId || !heading || cardId.includes('#')) throw new Error('SOURCE_VERIFICATION_SECTION_INVALID');
  const sectionId = `${cardId}#${heading}`;
  const cases = suite.cases.filter(test => test.sections.includes(sectionId)).map(test => {
    const { caseId, status, actual } = oracle.find(item => item.caseId === test.caseId)!;
    return { input: test, observation: { caseId, status, actual } };
  });
  return { observedImplementation: 'PINNED_REFERENCE' as const, scope: 'EXACT_CARD_SECTION' as const, sectionId,
    coverage: cases.length ? 'DIRECT_BEHAVIOR_EVIDENCE' as const : 'NO_DIRECT_BEHAVIOR_EVIDENCE' as const, cases };
}
