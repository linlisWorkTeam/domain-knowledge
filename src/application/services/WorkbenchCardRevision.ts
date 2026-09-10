/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：复用定点 DocGen、最终源码复核及候选版本保存，不改变上游纠正意见来源。
 */
import { sha256, type ArtifactRef, type KnowledgeVersion } from '../../domain/Domain.ts';
import { type JsonValue, type StageResult } from '../../domain/services/workbench/StageTask.ts';
import { finalizeKnowledgeRevision, knowledgeRevisionDecision, sourceReviewObservations } from '../../domain/services/knowledge/KnowledgeRevision.ts';
import { readSourceReviewPolicy } from '../../domain/services/knowledge/SourceReviewPolicy.ts';
import type { Output as ReviewOutput } from '../../domain/agents/reviewAgent/ReviewAgentContract.ts';
import type { NativeBehaviorSuite } from '../../domain/services/evaluation/NativeBehaviorSuite.ts';
import type { WorkbenchProjectSnapshot } from '../../domain/services/workbench/WorkbenchProject.ts';
import type { StageModelConfiguration } from '../ports/WorkbenchGenerationPorts.ts';
import type { KnowledgeFlywheelService } from './ApplicationServices.ts';
import type { WorkbenchEvaluation } from './WorkbenchEvaluation.ts';
import type { StageExecutionContext } from './WorkbenchStages.ts';
const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value));
export class WorkbenchCardRevision {
  readonly evaluation: WorkbenchEvaluation; readonly flywheel: KnowledgeFlywheelService;
  constructor(evaluation: WorkbenchEvaluation, flywheel: KnowledgeFlywheelService) { this.evaluation = evaluation; this.flywheel = flywheel; }
  private async load<T>(ref: ArtifactRef): Promise<T> {
    const { artifacts } = this.evaluation.dependencies;
    if (!ref || !await artifacts.verify(ref)) throw new Error('STAGE_ARTIFACT_CORRUPT');
    return JSON.parse(Buffer.from(await artifacts.get(ref)).toString('utf8')) as T;
  }
  async apply(context: StageExecutionContext, input: {
    card: KnowledgeVersion; body: string; project: WorkbenchProjectSnapshot; frozen: StageModelConfiguration;
    moduleId: string; heading: string; evaluationTaskId: string; contract: string; sourceVerificationTaskId?: string;
    review: { output: unknown; resultRef: ArtifactRef; rawRef: ArtifactRef };
    correction: { correctionId: string; knowledgePath: string; criterion: string; risk: string };
    referenceRef: ArtifactRef; reportRef: ArtifactRef; evidenceRef: ArtifactRef;
    suiteRef: ArtifactRef; oracleRef: ArtifactRef; referenceCaseIds: string[]; extraRefs: ArtifactRef[];
  }): Promise<StageResult> {
    const { artifacts, repository, roles } = this.evaluation.dependencies;
    const sourceReviewPolicy = readSourceReviewPolicy(context.task.input.parameters.sourceReviewPolicy);
    const { card, body, project, frozen, moduleId, heading, evaluationTaskId, contract, sourceVerificationTaskId,
      review, correction, referenceRef, reportRef, evidenceRef, suiteRef, oracleRef, referenceCaseIds, extraRefs } = input;
    const selected = project.modules.find(module => module.moduleId === moduleId);
    if (!selected || sha256(body) !== card.bodyRef.sha256) throw new Error('REVISION_KNOWLEDGE_BINDING_INVALID');
    const sourceFiles = project.sourceFiles.filter(file => file.kind === 'source' && selected.sourcePaths.includes(file.path));
    if (!sourceFiles.length || sourceFiles.reduce((sum, file) => sum + file.ref.size, 0) > 1048576) throw new Error('REVISION_SOURCE_LIMIT');
    const files = [], sourceMaterials = [];
    for (const file of sourceFiles) {
      if (!await artifacts.verify(file.ref)) throw new Error('STAGE_ARTIFACT_CORRUPT');
      const content = Buffer.from(await artifacts.get(file.ref)).toString('utf8');
      files.push({ path: file.path, content }); sourceMaterials.push({ ref: file.ref, content });
    }
    const reference = await this.load(referenceRef), report = await this.load(reportRef), evidence = await this.load(evidenceRef);
    const interfaceRef = card.metadata.interfaceRef as unknown as ArtifactRef;
    const api = await this.load(interfaceRef);
    const corrections = [{ ...correction, evidenceRefs: [reportRef, evidenceRef, review.rawRef, referenceRef] }];
    const revised = await roles.execute(context, frozen, 'doc-gen', card.versionId, { moduleId: card.moduleId, sourcePaths: [], publicInterfacePaths: [], provenance: [card.bodyRef],
      payload: { moduleId: card.moduleId, sourceRefs: sourceFiles.map(file => file.ref), publicInterfaceRefs: [interfaceRef], baseKnowledgeRef: card.bodyRef, corrections },
      materials: [{ ref: card.bodyRef, content: body }, { ref: reportRef, content: report }, { ref: interfaceRef, content: api }, { ref: evidenceRef, content: evidence }, { ref: review.rawRef, content: review.output }, { ref: referenceRef, content: reference }, ...sourceMaterials] });
    const document = revised.output as unknown as { body: string; title: string; description: string };
    document.body = finalizeKnowledgeRevision(body, document.body, heading, typeof card.metadata.symbol === 'string' ? { commit: project.commit, symbol: card.metadata.symbol } : undefined);
    const draftRef = await artifacts.put(Buffer.from(document.body), 'text/markdown');
    const sourceReference = { schemaVersion: contract, sourceRevision: project.commit, files };
    const sourceReferenceRef = await artifacts.put(Buffer.from(JSON.stringify(sourceReference)), 'application/json');
    const sourceEvaluation = { schemaVersion: 'native-source-review-evidence-v1', sourceRevision: project.commit,
      sourceDigest: project.sourceDigest, moduleId: moduleId, suiteRef: suiteRef, oracleRef: oracleRef,
      ...sourceReviewObservations(await this.load<NativeBehaviorSuite>(suiteRef),
        await this.load<Parameters<typeof sourceReviewObservations>[1]>(oracleRef), referenceCaseIds) };
    const sourceEvaluationRef = await artifacts.put(Buffer.from(JSON.stringify(sourceEvaluation)), 'application/json');
    const sourceCriteria = { schemaVersion: contract, phase: 'REVISION_SOURCE_REVIEW',
      ...(sourceReviewPolicy ? { sourceReviewPolicy } : {}),
      allowedKnowledgePaths: [`knowledge/${card.moduleId}.md#${heading}`],
      instruction: '独立复核最终正文的授权章节是否准确描述固定参考源码。上游模型的修订并非事实。逐项核对索引、边界、返回值及示例；有矛盾必须指出，不得因为文字流畅或旧评测通过而放行。评测材料只包含已验证的固定参考实现观察，observedImplementation=PINNED_REFERENCE；不能把旧生成代码的失败当成参考实现结果。本次只判断授权正文与固定源码一致性，后续生成代码重建及行为复测由独立阶段处理。只有正文与参考一致且无未解决风险才返回 PASS、blocking=false、correction=null。' };
    const sourceCriteriaRef = await artifacts.put(Buffer.from(JSON.stringify(sourceCriteria)), 'application/json');
    await context.step(`revision-source-materials:${card.versionId}`, async () => ({ artifactRefs: [draftRef, sourceReferenceRef, sourceEvaluationRef, sourceCriteriaRef, suiteRef, oracleRef], summary: { versionId: card.versionId, heading: heading!, evaluationReportRef: json(sourceEvaluationRef) } }));
    const sourceReview = await roles.execute(context, frozen, 'review', `${card.versionId}:source-review`, {
      moduleId: card.moduleId, sourcePaths: [], publicInterfacePaths: [], provenance: [draftRef, sourceReferenceRef],
      payload: { knowledgeRef: draftRef, evaluationReportRef: sourceEvaluationRef, checkReportRef: sourceReferenceRef, criteriaRef: sourceCriteriaRef },
      materials: [{ ref: draftRef, content: document.body }, { ref: sourceEvaluationRef, content: sourceEvaluation },
        { ref: sourceReferenceRef, content: sourceReference }, { ref: sourceCriteriaRef, content: sourceCriteria }] });
    const sourceOpinion = sourceReview.output as unknown as ReviewOutput;
    const sourceDecision = knowledgeRevisionDecision(sourceOpinion, card.moduleId, [heading]);
    if (sourceDecision.heading || sourceDecision.unresolved.length) return {
      artifactRefs: [draftRef, sourceReferenceRef, sourceCriteriaRef, sourceEvaluationRef, suiteRef, oracleRef, review.resultRef, review.rawRef, revised.resultRef, revised.rawRef, sourceReview.resultRef, sourceReview.rawRef],
      summary: { cardId: String(card.metadata.cardId), baseVersionId: card.versionId, outcome: 'UNRESOLVED',
        heading: heading, unresolved: ['REVISION_SOURCE_REVIEW_REJECTED', ...(sourceOpinion.correction ? [sourceOpinion.correction.criterion, sourceOpinion.correction.risk] : []), ...sourceDecision.unresolved], draftRef: json(draftRef), sourceReviewRef: json(sourceReview.rawRef), verified: false } };
    const latest = repository.latestKnowledgeVersion(card.moduleId);
    if (latest?.versionId !== card.versionId && !(latest?.metadata.revisionTaskId === context.task.taskId && latest.bodyRef.sha256 === sha256(document.body))) throw new Error('REVISION_CARD_CHANGED');
    const historical = repository.findKnowledgeVersionByBody(card.moduleId, `sha256:${sha256(document.body)}`);
    if (historical && historical.versionId !== latest?.versionId) throw new Error('REVISION_NO_PROGRESS');
    context.signal.throwIfAborted();
    const committed = await this.flywheel.ingestCandidate({ expectedParentVersionId: card.versionId, moduleId: card.moduleId, body: document.body, title: card.title, description: card.description,
      category: card.category, tags: card.tags, provenance: card.provenance, metadata: { ...card.metadata, stageTaskId: context.task.taskId, revisionTaskId: context.task.taskId,
        baseVersionId: card.versionId, evaluationTaskId, ...(sourceVerificationTaskId ? { sourceVerificationTaskId, revisionOrigin: 'PINNED_SOURCE_CONTRADICTION' } : {}), reviewResultRef: review.resultRef, sourceReviewResultRef: sourceReview.resultRef, roleResultRef: revised.resultRef } });
    return { artifactRefs: [draftRef, sourceReferenceRef, sourceCriteriaRef, sourceEvaluationRef, suiteRef, oracleRef, sourceReview.resultRef, sourceReview.rawRef, referenceRef, ...extraRefs, ...sourceFiles.map(file => file.ref), card.bodyRef, review.resultRef, review.rawRef, revised.resultRef, revised.rawRef, committed.version.bodyRef], summary: {
      cardId: String(card.metadata.cardId), baseVersionId: card.versionId, versionId: committed.version.versionId, heading: heading, criterion: correction.criterion,
      beforeRef: json(card.bodyRef), afterRef: json(committed.version.bodyRef), quality: committed.quality.outcome, qualityScore: committed.quality.score, qualityWeakPoints: committed.quality.weakPoints, outcome: 'REVISED', verified: false } };
  }
}
