/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：对全部冻结卡片执行独立来源复核，保留纠正意见而不伪造行为失败。
 */
import { sha256, type ArtifactRef } from '../../domain/Domain.ts';
import { canonicalJson, type JsonValue, type StageInput } from '../../domain/services/workbench/StageTask.ts';
import { markdownSections } from '../../domain/services/knowledge/KnowledgeSections.ts';
import { sourceReviewObservations } from '../../domain/services/knowledge/KnowledgeRevision.ts';
import { SOURCE_VERIFICATION_CONTRACT, sourceCardDecision, sourceVerificationOutcome, type SourceCardBinding, type SourceCardResult } from '../../domain/services/knowledge/KnowledgeSourceVerification.ts';
import type { NativeBehaviorSuite } from '../../domain/services/evaluation/NativeBehaviorSuite.ts';
import type { Output as ReviewOutput } from '../../domain/agents/reviewAgent/ReviewAgentContract.ts';
import type { StageModelConfiguration } from '../ports/WorkbenchGenerationPorts.ts';
import type { WorkbenchEvaluation } from './WorkbenchEvaluation.ts';
import type { StageExecutionContext } from './WorkbenchStages.ts';
const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value));
export class WorkbenchSourceVerification {
  readonly evaluation: WorkbenchEvaluation;
  constructor(evaluation: WorkbenchEvaluation) { this.evaluation = evaluation; }
  private async load<T>(ref: ArtifactRef): Promise<T> {
    const { artifacts } = this.evaluation.dependencies;
    if (!ref || !await artifacts.verify(ref)) throw new Error('STAGE_ARTIFACT_CORRUPT');
    return JSON.parse(Buffer.from(await artifacts.get(ref)).toString('utf8')) as T;
  }
  async start(evaluationTaskId: string) { return this.evaluation.dependencies.stages.start(await this.prepare(evaluationTaskId)); }
  async prepare(evaluationTaskId: string): Promise<StageInput> {
    const { stages, artifacts, configuration } = this.evaluation.dependencies;
    const parent = stages.get(evaluationTaskId);
    if (parent.input.stage !== 'EVALUATE' || parent.input.parameters.operation !== undefined || parent.status !== 'SUCCEEDED' || !parent.result) throw new Error('SOURCE_VERIFICATION_EVALUATION_REQUIRED');
    const evidence = await this.evaluation.revisionEvidence(evaluationTaskId);
    const configurationRef = parent.input.parameters.configurationRef as unknown as ArtifactRef;
    await configuration.assertStageCompatible(await this.load<StageModelConfiguration>(configurationRef));
    const evidenceRef = await artifacts.put(Buffer.from(canonicalJson(evidence)), 'application/json');
    return { ...parent.input, parameters: { operation: 'KNOWLEDGE_SOURCE_VERIFICATION', verificationContract: SOURCE_VERIFICATION_CONTRACT,
      evaluationTaskId, evaluationDigest: sha256(canonicalJson(parent.result)), snapshotId: parent.input.parameters.snapshotId!,
      evidenceRef: json(evidenceRef), configurationRef: json(configurationRef) } };
  }
  async verify(context: StageExecutionContext) {
    const { stages, projects, repository, artifacts, roles, configuration } = this.evaluation.dependencies;
    const parameters = context.task.input.parameters;
    if (parameters.operation !== 'KNOWLEDGE_SOURCE_VERIFICATION' || parameters.verificationContract !== SOURCE_VERIFICATION_CONTRACT) throw new Error('STAGE_CONTRACT_INCOMPATIBLE');
    const parent = stages.get(String(parameters.evaluationTaskId));
    const evidence = await this.load<Awaited<ReturnType<WorkbenchEvaluation['revisionEvidence']>>>(parameters.evidenceRef as unknown as ArtifactRef);
    if (canonicalJson(await this.evaluation.revisionEvidence(parent.taskId)) !== canonicalJson(evidence)
      || sha256(canonicalJson(parent.result)) !== parameters.evaluationDigest
      || canonicalJson(parent.input.cardVersionIds) !== canonicalJson(context.task.input.cardVersionIds)
      || parent.input.sourceDigest !== context.task.input.sourceDigest || parent.input.sourceRevision !== context.task.input.sourceRevision
      || parent.input.configurationDigest !== context.task.input.configurationDigest) throw new Error('STAGE_INPUT_CHANGED');
    const configRef = parameters.configurationRef as unknown as ArtifactRef;
    if (configRef.sha256 !== context.task.input.configurationDigest) throw new Error('STAGE_INPUT_CHANGED');
    const frozen = await this.load<StageModelConfiguration>(configRef); await configuration.assertStageCompatible(frozen);
    const project = projects.get(String(parameters.snapshotId));
    if (!project || project.snapshotId !== parent.input.parameters.snapshotId || project.commit !== context.task.input.sourceRevision || project.sourceDigest !== context.task.input.sourceDigest) throw new Error('STAGE_INPUT_CHANGED');
    const expected: SourceCardBinding[] = [], results: Array<SourceCardResult & Record<string, unknown>> = [];
    const refs: ArtifactRef[] = [parameters.evidenceRef as unknown as ArtifactRef];
    for (const versionId of context.task.input.cardVersionIds) {
      const card = repository.getKnowledgeVersion(versionId);
      if (!card || typeof card.metadata.cardId !== 'string' || card.metadata.projectSnapshotId !== project.snapshotId || !await artifacts.verify(card.bodyRef)) throw new Error('SOURCE_VERIFICATION_CARD_UNBOUND');
      const module = project.modules.find(item => item.moduleId === card.metadata.sourceModule);
      const moduleEvidence = evidence.modules.find(item => item.moduleId === module?.moduleId);
      if (!module || !moduleEvidence) throw new Error('SOURCE_VERIFICATION_CARD_UNBOUND');
      const binding: SourceCardBinding = { cardId: card.metadata.cardId, versionId, moduleId: card.moduleId, bodyDigest: card.bodyRef.sha256 };
      expected.push(binding);
      const output = await context.step(`source-card:${versionId}`, async () => {
        const body = Buffer.from(await artifacts.get(card.bodyRef)).toString('utf8');
        const headings = markdownSections(body).map(section => section.heading);
        if (!headings.length || new Set(headings).size !== headings.length) throw new Error('SOURCE_VERIFICATION_SECTIONS_REQUIRED');
        const sources = project.sourceFiles.filter(file => file.kind === 'source' && module.sourcePaths.includes(file.path));
        if (!sources.length || sources.reduce((sum, file) => sum + file.ref.size, 0) > 1048576) throw new Error('SOURCE_VERIFICATION_SOURCE_LIMIT');
        const files = [];
        for (const file of sources) {
          if (!await artifacts.verify(file.ref)) throw new Error('STAGE_ARTIFACT_CORRUPT');
          files.push({ path: file.path, content: Buffer.from(await artifacts.get(file.ref)).toString('utf8') });
        }
        const reference = { schemaVersion: SOURCE_VERIFICATION_CONTRACT, sourceRevision: project.commit, sourceDigest: project.sourceDigest, files };
        const referenceRef = await artifacts.put(Buffer.from(JSON.stringify(reference)), 'application/json');
        const suite = await this.load<NativeBehaviorSuite>(moduleEvidence.suiteRef);
        const report = { schemaVersion: 'native-source-review-evidence-v1', sourceRevision: project.commit, sourceDigest: project.sourceDigest,
          suiteRef: moduleEvidence.suiteRef, oracleRef: moduleEvidence.oracleRef,
          ...sourceReviewObservations(suite, await this.load<Parameters<typeof sourceReviewObservations>[1]>(moduleEvidence.oracleRef), suite.cases.map(item => item.caseId)) };
        const reportRef = await artifacts.put(Buffer.from(JSON.stringify(report)), 'application/json');
        const criteria = { schemaVersion: SOURCE_VERIFICATION_CONTRACT, phase: 'FINAL_SOURCE_REVIEW', binding,
          allowedKnowledgePaths: headings.map(heading => `knowledge/${card.moduleId}.md#${heading}`),
          instruction: '独立核对整张冻结卡片与固定源码的一致性，包括此前未修改的章节。参考观察明确标记PINNED_REFERENCE，只证明对应参考用例；不能推断所有可能输入都已验证。逐项核对边界、状态、接口及示例。与固定源码直接矛盾的事实必须指出，即使重建代码通过了行为测试。上游失败归因PASS不代表正文正确。发现明确错误时指向已有H2；缺少证据则保留风险。仅在全卡片无矛盾、无未知风险时PASS；这不是发布授权。' };
        const criteriaRef = await artifacts.put(Buffer.from(JSON.stringify(criteria)), 'application/json');
        const inputRefs = [card.bodyRef, referenceRef, reportRef, criteriaRef, moduleEvidence.suiteRef, moduleEvidence.oracleRef];
        await context.step(`source-materials:${versionId}`, async () => ({ artifactRefs: inputRefs, summary: { versionId } }));
        const review = await roles.execute(context, frozen, 'review', `final-source:${versionId}`, { moduleId: card.moduleId, sourcePaths: [], publicInterfacePaths: [], provenance: [card.bodyRef, referenceRef],
          payload: { knowledgeRef: card.bodyRef, evaluationReportRef: reportRef, checkReportRef: referenceRef, criteriaRef },
          materials: [{ ref: card.bodyRef, content: body }, { ref: referenceRef, content: reference }, { ref: reportRef, content: report }, { ref: criteriaRef, content: criteria }] });
        const opinion = review.output as unknown as ReviewOutput;
        const decision = sourceCardDecision(card.moduleId, body, opinion);
        return { artifactRefs: [...inputRefs, review.resultRef, review.rawRef], summary: { ...binding, ...decision, criterion: opinion.correction?.criterion ?? null, referenceRef: json(referenceRef), referenceObservationsRef: json(reportRef), criteriaRef: json(criteriaRef), reviewResultRef: json(review.resultRef), reviewRef: json(review.rawRef) } };
      });
      results.push(output.summary as unknown as SourceCardResult & Record<string, unknown>); refs.push(...output.artifactRefs);
    }
    return { artifactRefs: refs, summary: { operation: 'KNOWLEDGE_SOURCE_VERIFICATION', evaluationTaskId: parent.taskId,
      snapshotId: project.snapshotId, versionIds: context.task.input.cardVersionIds, cards: json(results), outcome: sourceVerificationOutcome(expected, results), publicationVerified: false } };
  }
}
