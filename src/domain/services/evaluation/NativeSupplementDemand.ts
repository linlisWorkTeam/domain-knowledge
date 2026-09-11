/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：从冻结来源结果提取当前章节的补充验证需求，保留未知原因。
 */
import { sha256 } from '../../Domain.ts';
import { canonicalJson } from '../workbench/StageTask.ts';
import { markdownSections } from '../knowledge/KnowledgeSections.ts';
import { sourceVerificationOutcome, type SourceCardBinding, type SourceCardResult } from '../knowledge/KnowledgeSourceVerification.ts';
export const NATIVE_SUPPLEMENT_CONTRACT = 'knowledge-test-supplement-v1';
export interface SupplementSourceFinding extends SourceCardResult {
  sections?: Array<SourceCardResult & { section: string; unresolved?: string[] }>;
}
export function nativeSupplementDemand(cards: Array<SourceCardBinding & { body: string }>, findings: SupplementSourceFinding[]) {
  sourceVerificationOutcome(cards, findings);
  const demands: Array<SourceCardBinding & { sectionId: string; reasons: string[] }> = [];
  for (const card of cards) {
    const finding = findings.find(item => item.cardId === card.cardId)!;
    const headings = markdownSections(card.body).map(item => item.heading);
    if (!finding.sections || finding.sections.length !== headings.length || new Set(finding.sections.map(item => item.section)).size !== headings.length) throw new Error('NATIVE_SUPPLEMENT_SECTIONS_INVALID');
    for (const section of finding.sections) {
      if (section.cardId !== card.cardId || section.versionId !== card.versionId || section.moduleId !== card.moduleId || section.bodyDigest !== card.bodyDigest || !headings.includes(section.section)) throw new Error('NATIVE_SUPPLEMENT_BINDING_INVALID');
      if (!['SOURCE_MATCHED', 'SOURCE_MISMATCH', 'UNRESOLVED'].includes(section.outcome)) throw new Error('NATIVE_SUPPLEMENT_BINDING_INVALID');
      if (section.outcome !== 'UNRESOLVED') continue;
      if (!section.unresolved?.length || section.unresolved.some(reason => typeof reason !== 'string' || !reason.trim())) throw new Error('NATIVE_SUPPLEMENT_REASON_REQUIRED');
      const { body: _body, ...binding } = card;
      demands.push({ ...binding, sectionId: `${card.cardId}#${section.section}`, reasons: [...new Set(section.unresolved)].sort() });
    }
  }
  if (!demands.length) throw new Error('NATIVE_SUPPLEMENT_NO_DEMAND');
  demands.sort((a, b) => a.sectionId.localeCompare(b.sectionId));
  return { contract: NATIVE_SUPPLEMENT_CONTRACT, demands, demandDigest: sha256(canonicalJson({ contract: NATIVE_SUPPLEMENT_CONTRACT, demands })) };
}
