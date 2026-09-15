/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：限定 Review 纠正意见只能进入已绑定的当前知识章节。
 */
import { validateRevision } from '../agents/docGenAgent/DocGenRevision.ts';
import type { Output } from '../agents/reviewAgent/WorkbenchReviewContract.ts';
import { nativeOracleTrusted } from '../evaluation/NativeTestCache.ts';
import type { NativeBehaviorSuite, NativeScalar } from '../evaluation/NativeBehaviorSuite.ts';
export const KNOWLEDGE_REVISION_CONTRACT = 'knowledge-revision-v5';

/** 源码一致性只读取已验证参考实现的观察，不能把旧生成代码失败移作参考事实。 */
export function sourceReviewObservations(suite: NativeBehaviorSuite, oracle: Array<{ caseId: string; status: 'PASSED' | 'FAILED'; actual: Record<string, NativeScalar> | null }>, caseIds: string[]) {
  if (!nativeOracleTrusted(suite, oracle)) throw new Error('REVISION_REFERENCE_NOT_TRUSTED');
  const selected = new Set(caseIds);
  if (!selected.size || [...selected].some(id => !suite.cases.some(test => test.caseId === id))) throw new Error('REVISION_SOURCE_CASE_BINDING_INVALID');
  return { observedImplementation: 'PINNED_REFERENCE' as const, cases: suite.cases.filter(test => selected.has(test.caseId)).map(test => { const { caseId, status, actual } = oracle.find(item => item.caseId === test.caseId)!; return { input: test, observation: { caseId, status, actual } }; }) };
}
export function knowledgeRevisionDecision(review: Output, moduleId: string, headings: string[]) {
  if (!review.correction && review.recommendation === 'PASS' && !review.blocking && !review.unresolvedRisks?.length) return { heading: null, unresolved: [] };
  if (!review.correction || review.unresolvedRisks?.length) return { heading: null, unresolved: review.unresolvedRisks?.length ? review.unresolvedRisks : ['REVIEW_NO_KNOWLEDGE_CORRECTION'] };
  const heading = review.correction.knowledgePath.slice(`knowledge/${moduleId}.md#`.length);
  if (review.recommendation !== 'ITERATE' || !review.correction.knowledgePath.startsWith(`knowledge/${moduleId}.md#`)
    || !headings.includes(heading)) throw new Error('REVISION_CORRECTION_OUTSIDE_EVIDENCE');
  return { heading, unresolved: [] };
}

/** 完成修订和索引仍需区分质量拒绝、未解决归因及可继续重建。 */
export function knowledgeRevisionOutcome(updated: number, unresolved: boolean, qualities: Array<'ACCEPTED' | 'REJECTED'>) {
  if (qualities.includes('REJECTED')) return 'QUALITY_REJECTED';
  if (unresolved) return 'UNRESOLVED';
  return updated > 0 ? 'REVISED_INDEXED' : 'NO_REVISION';
}

/** 来源尾注由系统生成；最后一个 H2 被修订时仍保留原始固定来源。 */
export function finalizeKnowledgeRevision(base: string, generated: string, heading: string, source?: { commit: string; symbol: string }) {
  let body = generated;
  if (source) {
    const footer = `\n\n---\n\n来源提交：\`${source.commit}\`；知识单元：\`${source.symbol}\`。\n`;
    if (base.endsWith(footer) && !body.endsWith(footer)) body = body.trimEnd() + footer;
  }
  validateRevision(base, body, new Set([heading]));
  return body;
}
