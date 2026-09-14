/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：核对来源发布章节的原始Review及冻结材料身份。
 */
import { sha256, type ArtifactRef } from '../Domain.ts';
import type { AgentCommand, AgentResult } from '../agents/AgentContracts.ts';
import type { Output as ReviewOutput } from '../agents/reviewAgent/WorkbenchReviewContract.ts';
import { canonicalJson } from '../workbench/StageTask.ts';
import { SOURCE_VERIFICATION_CONTRACT, sourceSectionDecision, type SourceCardBinding } from './KnowledgeSourceVerification.ts';
export function assertSourcePublicationSection(input: {
  taskId: string; card: SourceCardBinding; body: string; section: string; first: boolean;
  raw: ReviewOutput; rawRef: ArtifactRef; result: AgentResult; command: AgentCommand;
  criteria: Record<string, unknown>; criteriaRef: ArtifactRef; referenceRef: ArtifactRef; observationsRef: ArtifactRef;
}) {
  const { taskId, card, body, section, first, raw, rawRef, result, command, criteria } = input;
  if (sha256(body) !== card.bodyDigest || raw.recommendation !== 'PASS' || raw.blocking !== false || raw.correction !== null
    || (raw.unresolvedRisks !== undefined && (!Array.isArray(raw.unresolvedRisks) || raw.unresolvedRisks.length))
    || result.agentType !== 'review' || result.status !== 'SUCCEEDED' || result.runId !== taskId
    || result.commandId !== command.commandId || command.runId !== taskId || command.agentType !== 'review'
    || result.rawOutputRef?.sha256 !== rawRef.sha256 || (command.payload.knowledgeRef as ArtifactRef)?.sha256 !== card.bodyDigest
    || result.payload.resultKind !== 'attribution' || !Array.isArray(result.payload.corrections) || result.payload.corrections.length
    || !Array.isArray(result.payload.unresolvedRisks) || result.payload.unresolvedRisks.length) throw new Error('PUBLICATION_SOURCE_REVIEW_REJECTED');
  for (const [key, ref] of [['criteriaRef', input.criteriaRef], ['checkReportRef', input.referenceRef], ['evaluationReportRef', input.observationsRef]] as const) {
    if (canonicalJson(command.payload[key]) !== canonicalJson(ref)) throw new Error('PUBLICATION_SOURCE_REVIEW_BINDING_CHANGED');
  }
  if (criteria.schemaVersion !== SOURCE_VERIFICATION_CONTRACT || criteria.phase !== 'FINAL_SOURCE_REVIEW'
    || criteria.section !== section || criteria.verifyPreamble !== first || canonicalJson(criteria.binding) !== canonicalJson(card)
    || canonicalJson(criteria.allowedKnowledgePaths) !== canonicalJson([`knowledge/${card.moduleId}.md#${section}`])
    || sourceSectionDecision(card.moduleId, body, section, raw).outcome !== 'SOURCE_MATCHED') throw new Error('PUBLICATION_SOURCE_SECTION_CHANGED');
}
