/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：冻结可信失败，复用 Review/DocGen 定点修订并刷新受影响索引。
 */
import type { AgentResult } from '../../domain/agents/AgentContracts.ts';
import { type ArtifactRef } from '../../domain/Domain.ts';
import { canonicalJson, type JsonValue, type StageInput, type StageResult } from '../../domain/services/workbench/StageTask.ts';
import { KNOWLEDGE_REVISION_CONTRACT, knowledgeRevisionDecision, knowledgeRevisionOutcome } from '../../domain/services/knowledge/KnowledgeRevision.ts';
import { WorkbenchCardRevision } from './WorkbenchCardRevision.ts';
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
        const files = [];
        for (const file of sourceFiles) {
          if (!await artifacts.verify(file.ref)) throw new Error('STAGE_ARTIFACT_CORRUPT');
          const content = Buffer.from(await artifacts.get(file.ref)).toString('utf8');
          files.push({ path: file.path, content });
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
        return new WorkbenchCardRevision(this.evaluation, this.flywheel).apply(context, {
          card, body, project, frozen, moduleId: module.moduleId, heading: decision.heading, evaluationTaskId: taskId,
          contract: KNOWLEDGE_REVISION_CONTRACT, review, correction, referenceRef, reportRef: module.reportRef, evidenceRef,
          suiteRef: module.suiteRef, oracleRef: module.oracleRef,
          referenceCaseIds: candidate.sections.filter(section => section.heading === decision.heading).flatMap(section => section.caseIds),
          extraRefs: [generatedModule.codeRef],
        });
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
