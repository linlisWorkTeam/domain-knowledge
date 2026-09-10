/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：将已绑定的明确源码矛盾转换为定点修订授权，不制造行为失败。
 */
import { sha256, type ArtifactRef } from '../../Domain.ts';
import type { AgentCommand, AgentResult } from '../../agents/AgentContracts.ts';
import type { Output as ReviewOutput } from '../../agents/reviewAgent/ReviewAgentContract.ts';
import { sourceCardDecision, type SourceCardResult } from './KnowledgeSourceVerification.ts';
export const SOURCE_REVISION_CONTRACT = 'knowledge-source-revision-v1';
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
