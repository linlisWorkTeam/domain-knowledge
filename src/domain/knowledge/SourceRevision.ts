/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：将已绑定的明确源码矛盾转换为定点修订授权，不制造行为失败。
 */
import { sha256, type ArtifactRef } from '../Domain.ts';
import type { AgentCommand, AgentResult } from '../agents/AgentContracts.ts';
import type { Output as ReviewOutput } from '../agents/reviewAgent/WorkbenchReviewContract.ts';
import { sourceCardDecision, type SourceCardResult } from './KnowledgeSourceVerification.ts';
export const SOURCE_REVISION_CONTRACT = 'knowledge-source-revision-v4';
export function authorizeSourceCorrection(input: {
  sourceTaskId: string; card: SourceCardResult; body: string; raw: ReviewOutput; rawRef: ArtifactRef;
  result: AgentResult; command: AgentCommand;
}) {
  const { sourceTaskId, card, body, raw, rawRef, result, command } = input;
  const knowledgeRef = command.payload.knowledgeRef as ArtifactRef | undefined;
  if (!sourceTaskId || card.outcome !== 'SOURCE_MISMATCH' || sha256(body) !== card.bodyDigest
    || result.agentType !== 'review' || result.status !== 'SUCCEEDED' || result.runId !== sourceTaskId
    || result.rawOutputRef?.sha256 !== rawRef.sha256 || result.commandId !== command.commandId
    || command.runId !== sourceTaskId || command.agentType !== 'review' || knowledgeRef?.sha256 !== card.bodyDigest) throw new Error('SOURCE_REVISION_BINDING_INVALID');
  const decision = sourceCardDecision(card.moduleId, body, raw);
  if (decision.outcome !== 'SOURCE_MISMATCH' || !decision.heading || !raw.correction) throw new Error('SOURCE_REVISION_EXPLICIT_CORRECTION_REQUIRED');
  const corrections = result.payload.corrections as Array<{ correctionId: string; knowledgePath: string; criterion: string; risk: string }>;
  if (!Array.isArray(corrections) || corrections.length !== 1) throw new Error('SOURCE_REVISION_BINDING_INVALID');
  const correction = corrections[0]!;
  if (!/^COR-[0-9]+$/.test(correction.correctionId) || correction.knowledgePath !== raw.correction.knowledgePath
    || correction.criterion !== raw.correction.criterion || correction.risk !== raw.correction.risk) throw new Error('SOURCE_REVISION_BINDING_INVALID');
  return { origin: 'PINNED_SOURCE_CONTRADICTION' as const, sourceTaskId, cardId: card.cardId, versionId: card.versionId,
    bodyDigest: card.bodyDigest, heading: decision.heading, correction: { correctionId: correction.correctionId, knowledgePath: correction.knowledgePath, criterion: correction.criterion, risk: correction.risk } };
}

/** 选择可独立修正的章节，不改变整卡风险；原始角色授权仍由authorizeSourceCorrection校验。 */
export const SOURCE_CORRECTION_POLICY = 'source-correction-selection-v1';
export function sourceCorrectionCandidates<T extends SourceCardResult & { unresolved?: string[]; sections?: T[] }>(cards: T[], policy?: unknown): T[] {
  if (policy !== undefined && policy !== SOURCE_CORRECTION_POLICY) throw new Error('SOURCE_CORRECTION_POLICY_INVALID');
  return cards.flatMap(card => {
    if (card.outcome === 'SOURCE_MISMATCH') return [card];
    if (policy === undefined || card.outcome !== 'UNRESOLVED' || !card.sections) return [];
    if (!Array.isArray(card.sections)) throw new Error('SOURCE_CORRECTION_SECTION_BINDING_INVALID');
    for (const section of card.sections) {
      if (!section || ['cardId', 'versionId', 'moduleId', 'bodyDigest'].some(key => section[key as keyof SourceCardResult] !== card[key as keyof SourceCardResult])) throw new Error('SOURCE_CORRECTION_SECTION_BINDING_INVALID');
    }
    const selected = card.sections.find(section => section.outcome === 'SOURCE_MISMATCH' && Array.isArray(section.unresolved) && section.unresolved.length === 0);
    return selected ? [selected] : [];
  });
}

/** 只读校验旧来源命令的结构视图；不改写原始命令、摘要或授权依据。 */
export function sourceHistoryCommandView(command: AgentCommand, verificationContract: unknown, assessmentPolicy: unknown): AgentCommand {
  if (assessmentPolicy !== undefined || !['knowledge-source-verification-v2', 'knowledge-source-verification-v3', 'knowledge-source-verification-v4'].includes(String(verificationContract))
    || command.agentType !== 'review' || command.schemaVersion !== '1.0' || command.payload.executionContract !== undefined) return command;
  const keys = Object.keys(command.payload).sort();
  if (keys.join(',') !== 'checkReportRef,criteriaRef,evaluationReportRef,knowledgeRef') return command;
  return { ...command, payload: { ...command.payload, executionContract: 'workbench-review-v1' } };
}
