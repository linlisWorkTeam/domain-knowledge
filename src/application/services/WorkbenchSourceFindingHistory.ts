/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：冻结并验证同正文的既有源码矛盾，不将后续PASS当作问题已修复。
 */
import { sha256, type ArtifactRef } from '../../domain/Domain.ts';
import { canonicalJson, type StageInput, type StageTask } from '../../domain/services/workbench/StageTask.ts';
import type { AgentCommand, AgentResult } from '../../domain/agents/AgentContracts.ts';
import type { Output as ReviewOutput } from '../../domain/agents/reviewAgent/ReviewAgentContract.ts';
import { authorizeSourceCorrection } from '../../domain/services/knowledge/SourceRevision.ts';
import type { SourceCardResult } from '../../domain/services/knowledge/KnowledgeSourceVerification.ts';
import type { WorkbenchEvaluation } from './WorkbenchEvaluation.ts';
export interface SourceFindingProof { taskId: string; checkpointKey: string; checkpointDigest: string }
export interface HistoricalSourceFinding extends SourceCardResult {
  section: string; reviewRef: ArtifactRef; reviewResultRef: ArtifactRef; referenceRef: ArtifactRef;
  referenceObservationsRef: ArtifactRef; criteriaRef: ArtifactRef; originEvidence?: SourceFindingProof;
}
export class WorkbenchSourceFindingHistory {
  readonly evaluation: WorkbenchEvaluation;
  constructor(evaluation: WorkbenchEvaluation) { this.evaluation = evaluation; }
  private async load<T>(ref: ArtifactRef): Promise<T> {
    const { artifacts } = this.evaluation.dependencies;
    if (!ref || !await artifacts.verify(ref)) throw new Error('SOURCE_HISTORY_ARTIFACT_INVALID');
    return JSON.parse(Buffer.from(await artifacts.get(ref)).toString('utf8')) as T;
  }
  async validate(proof: SourceFindingProof, input: StageInput) {
    const { stages, repository, artifacts, roles } = this.evaluation.dependencies;
    const source = stages.get(proof.taskId);
    if (source.input.stage !== 'EVALUATE' || source.input.parameters.operation !== 'KNOWLEDGE_SOURCE_VERIFICATION'
      || !['knowledge-source-verification-v2', 'knowledge-source-verification-v3', 'knowledge-source-verification-v4'].includes(String(source.input.parameters.verificationContract))
      || source.input.projectId !== input.projectId || source.input.sourceRevision !== input.sourceRevision || source.input.sourceDigest !== input.sourceDigest
      || source.input.parameters.snapshotId !== input.parameters.snapshotId
      || source.inputDigest !== sha256(canonicalJson({ contractVersion: source.contractVersion, input: source.input, limits: source.limits }))) throw new Error('SOURCE_HISTORY_BINDING_INVALID');
    const checkpoint = stages.store.checkpoints(proof.taskId).find(item => item.key === proof.checkpointKey);
    if (!checkpoint || sha256(canonicalJson(checkpoint.result)) !== proof.checkpointDigest) throw new Error('SOURCE_HISTORY_BINDING_INVALID');
    const finding = checkpoint.result.summary as unknown as HistoricalSourceFinding;
    const card = repository.getKnowledgeVersion(finding.versionId);
    if (!card || finding.originEvidence || finding.outcome !== 'SOURCE_MISMATCH' || typeof finding.section !== 'string'
      || !source.input.cardVersionIds.includes(card.versionId) || !input.cardVersionIds.includes(card.versionId)
      || card.metadata.cardId !== finding.cardId || card.moduleId !== finding.moduleId || card.bodyRef.sha256 !== finding.bodyDigest
      || card.metadata.projectSnapshotId !== input.parameters.snapshotId
      || checkpoint.key !== `source-section:${card.versionId}:${sha256(finding.section).slice(0, 24)}`) throw new Error('SOURCE_HISTORY_BINDING_INVALID');
    for (const ref of [...checkpoint.result.artifactRefs, card.bodyRef]) if (!await artifacts.verify(ref)) throw new Error('SOURCE_HISTORY_ARTIFACT_INVALID');
    const raw = await this.load<ReviewOutput>(finding.reviewRef), result = await this.load<AgentResult>(finding.reviewResultRef);
    roles.dependencies.contracts.assertResult(result);
    const command = await this.load<AgentCommand>(result.commandRef); roles.dependencies.contracts.assertCommand(command);
    for (const [key, ref] of [['checkReportRef', finding.referenceRef], ['evaluationReportRef', finding.referenceObservationsRef], ['criteriaRef', finding.criteriaRef]] as const) {
      if (!ref || (command.payload[key] as ArtifactRef | undefined)?.sha256 !== ref.sha256 || !checkpoint.result.artifactRefs.some(item => item.sha256 === ref.sha256)) throw new Error('SOURCE_HISTORY_BINDING_INVALID');
    }
    const body = Buffer.from(await artifacts.get(card.bodyRef)).toString('utf8');
    const instruction = authorizeSourceCorrection({ sourceTaskId: source.taskId, card: finding, body, raw, rawRef: finding.reviewRef, result, command });
    if (instruction.heading !== finding.section) throw new Error('SOURCE_HISTORY_BINDING_INVALID');
    return { finding, result: checkpoint.result };
  }
  async collect(parent: StageTask): Promise<SourceFindingProof[]> {
    const { stages } = this.evaluation.dependencies;
    const selected = new Map<string, SourceFindingProof>();
    const tasks = stages.store.list(parent.input.projectId).filter(task => task.input.parameters.operation === 'KNOWLEDGE_SOURCE_VERIFICATION'
      && task.input.parameters.snapshotId === parent.input.parameters.snapshotId && task.input.sourceDigest === parent.input.sourceDigest
      && task.input.sourceRevision === parent.input.sourceRevision).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.taskId.localeCompare(b.taskId));
    for (const task of tasks) for (const checkpoint of stages.store.checkpoints(task.taskId)) {
      const finding = checkpoint.result.summary as unknown as HistoricalSourceFinding;
      if (!checkpoint.key.startsWith('source-section:') || finding.outcome !== 'SOURCE_MISMATCH' || finding.originEvidence || !parent.input.cardVersionIds.includes(finding.versionId)) continue;
      const key = canonicalJson([finding.versionId, finding.section]);
      if (selected.has(key)) continue;
      const proof = { taskId: task.taskId, checkpointKey: checkpoint.key, checkpointDigest: sha256(canonicalJson(checkpoint.result)) };
      await this.validate(proof, parent.input); selected.set(key, proof);
      if (selected.size > 1000) throw new Error('SOURCE_HISTORY_LIMIT');
    }
    return [...selected.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, proof]) => proof);
  }
}
