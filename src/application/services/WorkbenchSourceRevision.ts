/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：消费独立来源复核的明确纠正意见，复用定点修订和增量索引。
 */
import { readSourceReviewPolicy } from '../../domain/knowledge/SourceReviewPolicy.ts';
import { WorkbenchSourceFindingHistory, type SourceFindingProof } from './WorkbenchSourceFindingHistory.ts';
import { type ArtifactRef } from '../../domain/Domain.ts';
import type { AgentCommand, AgentResult } from '../../domain/agents/AgentContracts.ts';
import type { Output as ReviewOutput } from '../../domain/agents/reviewAgent/WorkbenchReviewContract.ts';
import { canonicalJson, type JsonValue, type StageInput } from '../../domain/workbench/StageTask.ts';
import { SOURCE_VERIFICATION_CONTRACT, sourceVerificationOutcome, type SourceCardResult } from '../../domain/knowledge/KnowledgeSourceVerification.ts';
import { SOURCE_REVISION_CONTRACT, SOURCE_CORRECTION_POLICY, sourceCorrectionCandidates, authorizeSourceCorrection } from '../../domain/knowledge/SourceRevision.ts';
import { knowledgeRevisionOutcome } from '../../domain/knowledge/KnowledgeRevision.ts';
import type { NativeBehaviorSuite } from '../../domain/evaluation/NativeBehaviorSuite.ts';
import type { StageModelConfiguration } from '../ports/WorkbenchGenerationPorts.ts';
import type { WorkbenchEvaluation } from './WorkbenchEvaluation.ts';
import type { KnowledgeFlywheelService } from './ApplicationServices.ts';
import type { KnowledgeIndexService } from './KnowledgeIndex.ts';
import type { StageExecutionContext } from './WorkbenchStages.ts';
import { WorkbenchCardRevision } from './WorkbenchCardRevision.ts';
const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value));
interface SourceFinding extends SourceCardResult {
  originEvidence?: SourceFindingProof;
  reviewRef: ArtifactRef; reviewResultRef: ArtifactRef; referenceRef: ArtifactRef; referenceObservationsRef: ArtifactRef;
  unresolved?: string[]; sections?: SourceFinding[];
}
export class WorkbenchSourceRevision {
  readonly evaluation: WorkbenchEvaluation; readonly index: KnowledgeIndexService; readonly cardRevision: WorkbenchCardRevision;
  constructor(evaluation: WorkbenchEvaluation, flywheel: KnowledgeFlywheelService, index: KnowledgeIndexService) {
    this.evaluation = evaluation; this.index = index; this.cardRevision = new WorkbenchCardRevision(evaluation, flywheel);
  }
  private async load<T>(ref: ArtifactRef): Promise<T> {
    const { artifacts } = this.evaluation.dependencies;
    if (!ref || !await artifacts.verify(ref)) throw new Error('STAGE_ARTIFACT_CORRUPT');
    return JSON.parse(Buffer.from(await artifacts.get(ref)).toString('utf8')) as T;
  }
  private source(taskId: string) {
    const task = this.evaluation.dependencies.stages.get(taskId);
    if (task.status !== 'SUCCEEDED' || !task.result || task.input.parameters.operation !== 'KNOWLEDGE_SOURCE_VERIFICATION'
      || task.input.parameters.verificationContract !== SOURCE_VERIFICATION_CONTRACT) throw new Error('SOURCE_REVISION_VERIFICATION_REQUIRED');
    return task;
  }
  async start(sourceVerificationTaskId: string) { return this.evaluation.dependencies.stages.start(await this.prepare(sourceVerificationTaskId)); }
  async prepare(sourceVerificationTaskId: string): Promise<StageInput> {
    const { stages, configuration, artifacts, repository } = this.evaluation.dependencies;
    const existing = stages.store.list().find(task => task.input.parameters.operation === 'KNOWLEDGE_SOURCE_REVISION'
      && task.input.parameters.revisionContract === SOURCE_REVISION_CONTRACT && task.input.parameters.sourceCorrectionPolicy === SOURCE_CORRECTION_POLICY && task.input.parameters.sourceVerificationTaskId === sourceVerificationTaskId);
    if (existing) return existing.input;
    const source = this.source(sourceVerificationTaskId);
    if (!sourceCorrectionCandidates(source.result!.summary.cards as unknown as SourceFinding[], SOURCE_CORRECTION_POLICY).length) throw new Error('SOURCE_REVISION_NO_CORRECTION');
    for (const versionId of source.input.cardVersionIds) {
      const card = repository.getKnowledgeVersion(versionId);
      if (!card || repository.latestKnowledgeVersion(card.moduleId)?.versionId !== versionId) throw new Error('REVISION_CARD_CHANGED');
    }
    const configurationRef = source.input.parameters.configurationRef as unknown as ArtifactRef;
    await configuration.assertStageCompatible(await this.load<StageModelConfiguration>(configurationRef));
    const sourceReviewPolicy = readSourceReviewPolicy(source.input.parameters.sourceReviewPolicy);
    const evidenceRef = await artifacts.put(Buffer.from(canonicalJson(source.result)), 'application/json');
    return { ...source.input, stage: 'FLYWHEEL', parameters: { operation: 'KNOWLEDGE_SOURCE_REVISION', revisionContract: SOURCE_REVISION_CONTRACT, sourceCorrectionPolicy: SOURCE_CORRECTION_POLICY,
      ...(sourceReviewPolicy ? { sourceReviewPolicy: json(sourceReviewPolicy) } : {}), sourceVerificationTaskId, evaluationTaskId: source.input.parameters.evaluationTaskId!, evidenceRef: json(evidenceRef), configurationRef: json(configurationRef) } };
  }
  async revise(context: StageExecutionContext) {
    const { artifacts, repository, projects, roles, configuration } = this.evaluation.dependencies;
    const parameters = context.task.input.parameters;
    if (parameters.operation !== 'KNOWLEDGE_SOURCE_REVISION' || parameters.revisionContract !== SOURCE_REVISION_CONTRACT) throw new Error('STAGE_CONTRACT_INCOMPATIBLE');
    const source = this.source(String(parameters.sourceVerificationTaskId));
    const evidenceRef = parameters.evidenceRef as unknown as ArtifactRef;
    readSourceReviewPolicy(parameters.sourceReviewPolicy);
    if (canonicalJson(parameters.sourceReviewPolicy ?? null) !== canonicalJson(source.input.parameters.sourceReviewPolicy ?? null)) throw new Error('STAGE_INPUT_CHANGED');
    if (canonicalJson(await this.load(evidenceRef)) !== canonicalJson(source.result)
      || canonicalJson(source.input.cardVersionIds) !== canonicalJson(context.task.input.cardVersionIds)
      || source.input.sourceRevision !== context.task.input.sourceRevision || source.input.sourceDigest !== context.task.input.sourceDigest
      || source.input.configurationDigest !== context.task.input.configurationDigest || source.input.parameters.evaluationTaskId !== parameters.evaluationTaskId) throw new Error('STAGE_INPUT_CHANGED');
    const configurationRef = parameters.configurationRef as unknown as ArtifactRef;
    if (configurationRef.sha256 !== context.task.input.configurationDigest) throw new Error('STAGE_INPUT_CHANGED');
    const frozen = await this.load<StageModelConfiguration>(configurationRef); await configuration.assertStageCompatible(frozen);
    const evaluationTaskId = String(parameters.evaluationTaskId);
    const evaluationEvidence = await this.evaluation.revisionEvidence(evaluationTaskId);
    const project = projects.get(String(source.input.parameters.snapshotId));
    if (!project || project.commit !== context.task.input.sourceRevision || project.sourceDigest !== context.task.input.sourceDigest) throw new Error('STAGE_INPUT_CHANGED');
    const findings = source.result!.summary.cards as unknown as SourceFinding[];
    const expected = context.task.input.cardVersionIds.map(versionId => {
      const card = repository.getKnowledgeVersion(versionId);
      if (!card || card.metadata.projectSnapshotId !== project.snapshotId || typeof card.metadata.cardId !== 'string') throw new Error('SOURCE_REVISION_BINDING_INVALID');
      return { cardId: card.metadata.cardId, versionId, moduleId: card.moduleId, bodyDigest: card.bodyRef.sha256 };
    });
    sourceVerificationOutcome(expected, findings);
    const refs: ArtifactRef[] = [evidenceRef], results: JsonValue[] = [], updatedIds: string[] = [];
    const unresolved: JsonValue[] = findings.filter(card => card.outcome === 'UNRESOLVED').map(card => json({ cardId: card.cardId, unresolved: card.unresolved ?? ['SOURCE_REVIEW_UNRESOLVED'] }));
    for (const finding of sourceCorrectionCandidates(findings, parameters.sourceCorrectionPolicy)) {
      const card = repository.getKnowledgeVersion(finding.versionId)!;
      const output = await context.step(`revision-card:${card.versionId}`, async () => {
        const latest = repository.latestKnowledgeVersion(card.moduleId);
        if (latest?.versionId !== card.versionId && latest?.metadata.revisionTaskId !== context.task.taskId) throw new Error('REVISION_CARD_CHANGED');
        if (!await artifacts.verify(card.bodyRef)) throw new Error('STAGE_ARTIFACT_CORRUPT');
        const body = Buffer.from(await artifacts.get(card.bodyRef)).toString('utf8');
        const raw = await this.load<ReviewOutput>(finding.reviewRef), result = await this.load<AgentResult>(finding.reviewResultRef);
        roles.dependencies.contracts.assertResult(result);
        const command = await this.load<AgentCommand>(result.commandRef); roles.dependencies.contracts.assertCommand(command);
        let originTaskId = source.taskId;
        if (finding.originEvidence) {
          const frozenProofs = await this.load<SourceFindingProof[]>(source.input.parameters.priorFindingsRef as unknown as ArtifactRef);
          if (!frozenProofs.some(proof => canonicalJson(proof) === canonicalJson(finding.originEvidence))) throw new Error('SOURCE_HISTORY_BINDING_INVALID');
          const prior = await new WorkbenchSourceFindingHistory(this.evaluation).validate(finding.originEvidence, source.input);
          if (prior.finding.reviewRef.sha256 !== finding.reviewRef.sha256 || prior.finding.reviewResultRef.sha256 !== finding.reviewResultRef.sha256) throw new Error('SOURCE_HISTORY_BINDING_INVALID');
          originTaskId = finding.originEvidence.taskId;
        }
        const instruction = authorizeSourceCorrection({ sourceTaskId: originTaskId, card: finding, body, raw, rawRef: finding.reviewRef, result, command });
        const module = evaluationEvidence.modules.find(module => module.moduleId === card.metadata.sourceModule);
        if (!module) throw new Error('SOURCE_REVISION_BINDING_INVALID');
        const suite = await this.load<NativeBehaviorSuite>(module.suiteRef);
        return this.cardRevision.apply(context, { card, body, project, frozen, moduleId: module.moduleId, heading: instruction.heading,
          evaluationTaskId, contract: SOURCE_REVISION_CONTRACT, sourceVerificationTaskId: source.taskId,
          review: { output: raw, resultRef: finding.reviewResultRef, rawRef: finding.reviewRef }, correction: instruction.correction,
          referenceRef: finding.referenceRef, reportRef: finding.referenceObservationsRef, evidenceRef,
          suiteRef: module.suiteRef, oracleRef: module.oracleRef, referenceCaseIds: suite.cases.map(sample => sample.caseId), extraRefs: [result.commandRef] });
      });
      refs.push(...output.artifactRefs); results.push(output.summary);
      if (typeof output.summary.versionId === 'string') updatedIds.push(output.summary.versionId);
      if (output.summary.outcome === 'UNRESOLVED') unresolved.push(output.summary);
    }
    if (updatedIds.length) {
      const input = await context.step('revision-index-input', async () => ({ artifactRefs: [await artifacts.put(Buffer.from(JSON.stringify(this.index.prepare(updatedIds))), 'application/json')], summary: {} }));
      const built = await this.index.buildInput(await this.load<StageInput>(input.artifactRefs[0]!), context); refs.push(...input.artifactRefs, ...built.artifactRefs);
    }
    const cards = results as Array<{ baseVersionId: string; versionId?: string; quality?: 'ACCEPTED' | 'REJECTED' }>;
    return { artifactRefs: refs, summary: { operation: 'KNOWLEDGE_SOURCE_REVISION', sourceVerificationTaskId: source.taskId, evaluationTaskId,
      snapshotId: project.snapshotId, cards: results, updatedVersionIds: updatedIds, versionIds: source.input.cardVersionIds.map(id => cards.find(card => card.baseVersionId === id)?.versionId ?? id),
      outcome: knowledgeRevisionOutcome(updatedIds.length, unresolved.length > 0, cards.flatMap(card => card.quality ? [card.quality] : [])), unresolved, indexed: updatedIds.length > 0, verified: false } };
  }
}
