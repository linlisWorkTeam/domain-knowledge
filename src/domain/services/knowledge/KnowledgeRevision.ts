/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：限定 Review 纠正意见只能进入已绑定的当前知识章节。
 */
import { validateRevision } from '../../agents/docGenAgent/DocGenRevision.ts';
import type { Output } from '../../agents/reviewAgent/ReviewAgentContract.ts';
export const KNOWLEDGE_REVISION_CONTRACT = 'knowledge-revision-v1';
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
