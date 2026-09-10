/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：冻结可信失败，复用 Review/DocGen 定点修订并刷新受影响索引。
 */
import type { AgentResult } from '../../domain/agents/AgentContracts.ts';
import { sha256, type ArtifactRef } from '../../domain/Domain.ts';
import { canonicalJson, type JsonValue, type StageInput, type StageResult } from '../../domain/services/workbench/StageTask.ts';
import { KNOWLEDGE_REVISION_CONTRACT, knowledgeRevisionDecision, knowledgeRevisionOutcome, finalizeKnowledgeRevision, sourceReviewObservations } from '../../domain/services/knowledge/KnowledgeRevision.ts';
import type { NativeBehaviorSuite } from '../../domain/services/evaluation/NativeBehaviorSuite.ts';
import type { Output as ReviewOutput } from '../../domain/agents/reviewAgent/ReviewAgentContract.ts';
import type { StageModelConfiguration } from '../ports/WorkbenchGenerationPorts.ts';
import type { WorkbenchEvaluation } from './WorkbenchEvaluation.ts';
import type { KnowledgeFlywheelService } from './ApplicationServices.ts';
import type { KnowledgeIndexService } from './KnowledgeIndex.ts';
import type { StageExecutionContext } from './WorkbenchStages.ts';
const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value));
export class WorkbenchKnowledgeRevision {
  readonly evaluation: WorkbenchEvaluation; readonly flywheel: KnowledgeFlywheelService; readonly index: KnowledgeIndexService;
  constructor(evaluation: WorkbenchEvaluation, flywheel: KnowledgeFlywheelService, index: KnowledgeIndexService) { this.evaluation = evaluation; this.flywheel = flywheel; this.index = index; }
  private async load<T>(ref: ArtifactRef): Promise<T> {
    const { artifacts } = this.evaluation.dependencies;
    if (!ref || !await artifacts.verify(ref)) throw new Error('STAGE_ARTIFACT_CORRUPT');
    return JSON.parse(Buffer.from(await artifacts.get(ref)).toString('utf8')) as T;
  }
  async start(evaluationTaskId: string) { return this.evaluation.dependencies.stages.start(await this.prepare(evaluationTaskId)); }
  async prepare(evaluationTaskId: string): Promise<StageInput> {
    const { stages, configuration, artifacts, repository } = this.evaluation.dependencies;
    const existing = stages.store.list().find((task) => task.contractVersion === 'knowledge-workbench-v1' && task.input.parameters.operation === 'KNOWLEDGE_REVISION' && task.input.parameters.revisionContract === KNOWLEDGE_REVISION_CONTRACT && task.input.parameters.evaluationTaskId === evaluationTaskId);
    if (existing) return existing.input;
    const evidence = await this.evaluation.revisionEvidence(evaluationTaskId);
    if (!evidence.modules.some((module) => module.candidates.length)) throw new Error('REVISION_NO_ELIGIBLE_FAILURE');
    const previous = stages.get(evaluationTaskId);
    for (const id of previous.input.cardVersionIds) {
      const card = repository.getKnowledgeVersion(id);
      if (!card || repository.latestKnowledgeVersion(card.moduleId)?.versionId !== id) throw new Error('REVISION_CARD_CHANGED');
    }
    const configurationRef = previous.input.parameters.configurationRef as unknown as ArtifactRef;
    await configuration.assertStageCompatible(await this.load<StageModelConfiguration>(configurationRef));
    const evidenceRef = await artifacts.put(Buffer.from(canonicalJson(evidence)), 'application/json');
    return { ...previous.input, stage: 'FLYWHEEL', parameters: { operation: 'KNOWLEDGE_REVISION', revisionContract: KNOWLEDGE_REVISION_CONTRACT,
      evaluationTaskId, configurationRef: json(configurationRef), evidenceRef: json(evidenceRef) } };
  }
  async revise(context: StageExecutionContext) {
    const { artifacts, repository, stages, roles, configuration, projects } = this.evaluation.dependencies;
    if (context.task.input.parameters.revisionContract !== KNOWLEDGE_REVISION_CONTRACT) throw new Error('STAGE_CONTRACT_INCOMPATIBLE');
    const taskId = String(context.task.input.parameters.evaluationTaskId);
    const evidenceRef = context.task.input.parameters.evidenceRef as unknown as ArtifactRef;
    const evidence = await this.load<Awaited<ReturnType<WorkbenchEvaluation['revisionEvidence']>>>(evidenceRef);
    if (evidence.taskId !== taskId || canonicalJson(await this.evaluation.revisionEvidence(taskId)) !== canonicalJson(evidence)) throw new Error('STAGE_INPUT_CHANGED');
    const original = stages.get(taskId);
    if (canonicalJson(original.input.cardVersionIds) !== canonicalJson(context.task.input.cardVersionIds)
      || original.input.configurationDigest !== context.task.input.configurationDigest) throw new Error('STAGE_INPUT_CHANGED');
    const configurationRef = context.task.input.parameters.configurationRef as unknown as ArtifactRef;
    if (configurationRef.sha256 !== context.task.input.configurationDigest) throw new Error('STAGE_INPUT_CHANGED');
    const frozen = await this.load<StageModelConfiguration>(configurationRef); await configuration.assertStageCompatible(frozen);
    const project = projects.get(String(original.input.parameters.snapshotId));
    if (!project || project.sourceDigest !== original.input.sourceDigest || project.commit !== original.input.sourceRevision) throw new Error('STAGE_INPUT_CHANGED');
    const results: JsonValue[] = [], refs: ArtifactRef[] = [evidenceRef]; const updatedIds: string[] = [];
    const unresolved: JsonValue[] = evidence.modules.flatMap((module) => module.unresolved.map((item) => json({ moduleId: module.moduleId, ...item })));
    for (const module of evidence.modules) for (const candidate of module.candidates) {
      const card = repository.getKnowledgeVersion(candidate.versionId);
      if (!card || card.bodyRef.sha256 !== candidate.bodyDigest || !await artifacts.verify(card.bodyRef)) throw new Error('REVISION_KNOWLEDGE_BINDING_INVALID');
      const body = Buffer.from(await artifacts.get(card.bodyRef)).toString('utf8');
      const output = await context.step(`revision-card:${card.versionId}`, async (): Promise<StageResult> => {
        const current = repository.latestKnowledgeVersion(card.moduleId);
        if (current?.versionId !== card.versionId && current?.metadata.revisionTaskId !== context.task.taskId) throw new Error('REVISION_CARD_CHANGED');
        const selected = project.modules.find(item => item.moduleId === module.moduleId);
        if (!selected) throw new Error('STAGE_INPUT_CHANGED');
        const sourceFiles = project.sourceFiles.filter(item => item.kind === 'source' && selected.sourcePaths.includes(item.path));
        if (!sourceFiles.length || sourceFiles.reduce((sum, item) => sum + item.ref.size, 0) > 1048576) throw new Error('REVISION_SOURCE_LIMIT');
        const sourceMaterials = [], files = [];
        for (const file of sourceFiles) {
          if (!await artifacts.verify(file.ref)) throw new Error('STAGE_ARTIFACT_CORRUPT');
          const content = Buffer.from(await artifacts.get(file.ref)).toString('utf8');
          sourceMaterials.push({ ref: file.ref, content }); files.push({ path: file.path, content });
        }
        const reconstruction = stages.get(String(original.input.parameters.reconstructionTaskId));
        const generatedModule = (reconstruction.result?.summary.modules as unknown as Array<{ moduleId: string; codeRef: ArtifactRef }> | undefined)?.find(item => item.moduleId === module.moduleId);
        if (!generatedModule) throw new Error('REVISION_GENERATED_EVIDENCE_MISSING');
        const generatedCode = await this.load<{ files: Array<{ path: string; content: string }> }>(generatedModule.codeRef);
        const reference = { schemaVersion: KNOWLEDGE_REVISION_CONTRACT, sourceRevision: project.commit, files,
          generatedCodeRef: generatedModule.codeRef, generatedFiles: generatedCode.files };
        const referenceRef = await artifacts.put(Buffer.from(JSON.stringify(reference)), 'application/json');
        const criteria = { schemaVersion: KNOWLEDGE_REVISION_CONTRACT, candidate, allowedKnowledgePaths: candidate.sections.map(section => `knowledge/${card.moduleId}.md#${section.heading}`), instruction: '仅归因当前卡片与候选章节。对照固定参考、生成代码和可信观察，只有当前卡片存在能解释失败的明确知识错误或必要缺失，才给出 ITERATE 纠正意见。若当前卡片已经正确描述行为而生成代码有错，返回 PASS、blocking=false、correction=null；不得为文本相似度或其他函数代码错误扩写正确卡片。其他卡片失败由各自审核处理，不属于本卡未解决风险。必须独立核对固定参考，不得将上游模型意见当作已证明的源码事实。后续代码重建和复测是正常下一步，不属于未知风险。unresolvedRisks 仅记录当前卡片纠正仍缺必要证据的疑点；确有疑点则保留，不能猜测修订。意见只允许指向候选章节。' };
        const criteriaRef = await artifacts.put(Buffer.from(JSON.stringify(criteria)), 'application/json');
        const report = await this.load(module.reportRef);
        const review = await roles.execute(context, frozen, 'review', card.versionId, { moduleId: card.moduleId, sourcePaths: [], publicInterfacePaths: [], provenance: [module.reportRef],
          payload: { knowledgeRef: card.bodyRef, evaluationReportRef: module.reportRef, checkReportRef: referenceRef, criteriaRef },
          materials: [{ ref: card.bodyRef, content: body }, { ref: module.reportRef, content: report }, { ref: criteriaRef, content: criteria }, { ref: referenceRef, content: reference }] });
        const decision = knowledgeRevisionDecision(review.output as unknown as ReviewOutput, card.moduleId, candidate.sections.map((item) => item.heading));
        if (!decision.heading) return { artifactRefs: [review.resultRef, review.rawRef, referenceRef, generatedModule.codeRef], summary: { cardId: candidate.cardId, baseVersionId: card.versionId, outcome: decision.unresolved.length ? 'UNRESOLVED' : 'UNCHANGED', unresolved: decision.unresolved } };
        const rawCorrection = (review.output as unknown as ReviewOutput).correction!;
        const result = await this.load<AgentResult>(review.resultRef);
        roles.dependencies.contracts.assertResult(result);
        const approved = result.payload.corrections as Array<{ correctionId: string; knowledgePath: string; criterion: string; risk: string }>;
        if (result.agentType !== 'review' || result.status !== 'SUCCEEDED' || result.runId !== context.task.taskId
          || result.rawOutputRef?.sha256 !== review.rawRef.sha256 || !Array.isArray(approved) || approved.length !== 1
          || approved[0]!.knowledgePath !== rawCorrection.knowledgePath || approved[0]!.criterion !== rawCorrection.criterion || approved[0]!.risk !== rawCorrection.risk) throw new Error('REVISION_REVIEW_BINDING_INVALID');
        const { correctionId, knowledgePath, criterion, risk } = approved[0]!;
        const correction = { correctionId, knowledgePath, criterion, risk };
        const interfaceRef = card.metadata.interfaceRef as unknown as ArtifactRef;
        const api = await this.load(interfaceRef);
        const corrections = [{ ...correction, evidenceRefs: [module.reportRef, evidenceRef, review.rawRef, referenceRef] }];
        const revised = await roles.execute(context, frozen, 'doc-gen', card.versionId, { moduleId: card.moduleId, sourcePaths: [], publicInterfacePaths: [], provenance: [card.bodyRef],
          payload: { moduleId: card.moduleId, sourceRefs: sourceFiles.map(file => file.ref), publicInterfaceRefs: [interfaceRef], baseKnowledgeRef: card.bodyRef, corrections },
          materials: [{ ref: card.bodyRef, content: body }, { ref: module.reportRef, content: report }, { ref: interfaceRef, content: api }, { ref: evidenceRef, content: evidence }, { ref: review.rawRef, content: review.output }, { ref: referenceRef, content: reference }, ...sourceMaterials] });
        const document = revised.output as unknown as { body: string; title: string; description: string };
        document.body = finalizeKnowledgeRevision(body, document.body, decision.heading, typeof card.metadata.symbol === 'string' ? { commit: project.commit, symbol: card.metadata.symbol } : undefined);
        const draftRef = await artifacts.put(Buffer.from(document.body), 'text/markdown');
        const sourceReference = { schemaVersion: KNOWLEDGE_REVISION_CONTRACT, sourceRevision: project.commit, files };
        const sourceReferenceRef = await artifacts.put(Buffer.from(JSON.stringify(sourceReference)), 'application/json');
        const sourceEvaluation = { schemaVersion: 'native-source-review-evidence-v1', sourceRevision: project.commit,
          sourceDigest: project.sourceDigest, moduleId: module.moduleId, suiteRef: module.suiteRef, oracleRef: module.oracleRef,
          ...sourceReviewObservations(await this.load<NativeBehaviorSuite>(module.suiteRef),
            await this.load<Parameters<typeof sourceReviewObservations>[1]>(module.oracleRef), candidate.sections.filter(section => section.heading === decision.heading).flatMap(section => section.caseIds)) };
        const sourceEvaluationRef = await artifacts.put(Buffer.from(JSON.stringify(sourceEvaluation)), 'application/json');
        const sourceCriteria = { schemaVersion: KNOWLEDGE_REVISION_CONTRACT, phase: 'REVISION_SOURCE_REVIEW',
          allowedKnowledgePaths: [`knowledge/${card.moduleId}.md#${decision.heading}`],
          instruction: '独立复核最终正文的授权章节是否准确描述固定参考源码。上游模型的修订并非事实。逐项核对索引、边界、返回值及示例；有矛盾必须指出，不得因为文字流畅或旧评测通过而放行。评测材料只包含已验证的固定参考实现观察，observedImplementation=PINNED_REFERENCE；不能把旧生成代码的失败当成参考实现结果。本次只判断授权正文与固定源码一致性，后续生成代码重建及行为复测由独立阶段处理。只有正文与参考一致且无未解决风险才返回 PASS、blocking=false、correction=null。' };
        const sourceCriteriaRef = await artifacts.put(Buffer.from(JSON.stringify(sourceCriteria)), 'application/json');
        await context.step(`revision-source-materials:${card.versionId}`, async () => ({ artifactRefs: [draftRef, sourceReferenceRef, sourceEvaluationRef, sourceCriteriaRef, module.suiteRef, module.oracleRef], summary: { versionId: card.versionId, heading: decision.heading!, evaluationReportRef: json(sourceEvaluationRef) } }));
        const sourceReview = await roles.execute(context, frozen, 'review', `${card.versionId}:source-review`, {
          moduleId: card.moduleId, sourcePaths: [], publicInterfacePaths: [], provenance: [draftRef, sourceReferenceRef],
          payload: { knowledgeRef: draftRef, evaluationReportRef: sourceEvaluationRef, checkReportRef: sourceReferenceRef, criteriaRef: sourceCriteriaRef },
          materials: [{ ref: draftRef, content: document.body }, { ref: sourceEvaluationRef, content: sourceEvaluation },
            { ref: sourceReferenceRef, content: sourceReference }, { ref: sourceCriteriaRef, content: sourceCriteria }] });
        const sourceOpinion = sourceReview.output as unknown as ReviewOutput;
        const sourceDecision = knowledgeRevisionDecision(sourceOpinion, card.moduleId, [decision.heading]);
        if (sourceDecision.heading || sourceDecision.unresolved.length) return {
          artifactRefs: [draftRef, sourceReferenceRef, sourceCriteriaRef, sourceEvaluationRef, module.suiteRef, module.oracleRef, review.resultRef, review.rawRef, revised.resultRef, revised.rawRef, sourceReview.resultRef, sourceReview.rawRef],
          summary: { cardId: candidate.cardId, baseVersionId: card.versionId, outcome: 'UNRESOLVED',
            heading: decision.heading, unresolved: ['REVISION_SOURCE_REVIEW_REJECTED', ...(sourceOpinion.correction ? [sourceOpinion.correction.criterion, sourceOpinion.correction.risk] : []), ...sourceDecision.unresolved], draftRef: json(draftRef), sourceReviewRef: json(sourceReview.rawRef), verified: false } };
        const latest = repository.latestKnowledgeVersion(card.moduleId);
        if (latest?.versionId !== card.versionId && !(latest?.metadata.revisionTaskId === context.task.taskId && latest.bodyRef.sha256 === sha256(document.body))) throw new Error('REVISION_CARD_CHANGED');
        const historical = repository.findKnowledgeVersionByBody(card.moduleId, `sha256:${sha256(document.body)}`);
        if (historical && historical.versionId !== latest?.versionId) throw new Error('REVISION_NO_PROGRESS');
        context.signal.throwIfAborted();
        const committed = await this.flywheel.ingestCandidate({ expectedParentVersionId: card.versionId, moduleId: card.moduleId, body: document.body, title: card.title, description: card.description,
          category: card.category, tags: card.tags, provenance: card.provenance, metadata: { ...card.metadata, stageTaskId: context.task.taskId, revisionTaskId: context.task.taskId,
            baseVersionId: card.versionId, evaluationTaskId: taskId, reviewResultRef: review.resultRef, sourceReviewResultRef: sourceReview.resultRef, roleResultRef: revised.resultRef } });
        return { artifactRefs: [draftRef, sourceReferenceRef, sourceCriteriaRef, sourceEvaluationRef, module.suiteRef, module.oracleRef, sourceReview.resultRef, sourceReview.rawRef, referenceRef, generatedModule.codeRef, ...sourceFiles.map(file => file.ref), card.bodyRef, review.resultRef, review.rawRef, revised.resultRef, revised.rawRef, committed.version.bodyRef], summary: {
          cardId: candidate.cardId, baseVersionId: card.versionId, versionId: committed.version.versionId, heading: decision.heading, criterion: correction.criterion,
          beforeRef: json(card.bodyRef), afterRef: json(committed.version.bodyRef), quality: committed.quality.outcome, qualityScore: committed.quality.score, qualityWeakPoints: committed.quality.weakPoints, outcome: 'REVISED', verified: false } };
      });
      results.push(output.summary); refs.push(...output.artifactRefs);
      if (typeof output.summary.versionId === 'string') { updatedIds.push(output.summary.versionId); if (output.summary.quality === 'REJECTED') unresolved.push({ cardId: candidate.cardId, reason: 'REVISION_QUALITY_REJECTED' }); } else if (output.summary.outcome === 'UNRESOLVED') unresolved.push(output.summary);
    }
    if (updatedIds.length) {
      const indexInput = await context.step('revision-index-input', async () => {
        const input = this.index.prepare(updatedIds); const ref = await artifacts.put(Buffer.from(JSON.stringify(input)), 'application/json');
        return { artifactRefs: [ref], summary: {} };
      });
      const index = await this.index.buildInput(await this.load<StageInput>(indexInput.artifactRefs[0]!), context); refs.push(...indexInput.artifactRefs, ...index.artifactRefs);
    }
    const replacements = new Map(results.map(item => item as { baseVersionId: string; versionId?: string }).filter(item => item.versionId).map(item => [item.baseVersionId, item.versionId!]));
    return { artifactRefs: refs, summary: { operation: 'KNOWLEDGE_REVISION', evaluationTaskId: taskId, snapshotId: String(original.input.parameters.snapshotId), versionIds: original.input.cardVersionIds.map(id => replacements.get(id) ?? id), cards: results, updatedVersionIds: updatedIds,
      outcome: knowledgeRevisionOutcome(updatedIds.length, unresolved.length > 0, results.map(item => (item as { quality?: 'ACCEPTED' | 'REJECTED' }).quality).filter((value): value is 'ACCEPTED' | 'REJECTED' => Boolean(value))), unresolved, indexed: updatedIds.length > 0, verified: false } };
  }
}
