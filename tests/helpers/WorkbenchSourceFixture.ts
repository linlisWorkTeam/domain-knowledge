/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：提供协调器测试的来源执行器替身，不作为真实来源验证证据。
 */
import { sha256 } from '../../src/domain/Domain.ts';
import { SOURCE_VERIFICATION_CONTRACT } from '../../src/domain/services/knowledge/KnowledgeSourceVerification.ts';
import type { StageInput, StageTask, StageResult } from '../../src/domain/services/workbench/StageTask.ts';
export function sourceInput(evaluation: StageTask): StageInput {
  return { ...evaluation.input, stage: 'EVALUATE', parameters: { ...evaluation.input.parameters, operation: 'KNOWLEDGE_SOURCE_VERIFICATION', verificationContract: SOURCE_VERIFICATION_CONTRACT, evaluationTaskId: evaluation.taskId } };
}
export function sourceResult(input: StageInput, outcome = 'SOURCE_MATCHED'): StageResult {
  return { artifactRefs: [], summary: { outcome, publicationVerified: false, snapshotId: input.parameters.snapshotId!, evaluationTaskId: input.parameters.evaluationTaskId!,
    cards: input.cardVersionIds.map((versionId, index) => ({ cardId: `card-${index}`, moduleId: `module-${index}`, versionId, bodyDigest: sha256(versionId), outcome })) } };
}
