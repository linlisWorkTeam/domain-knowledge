/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：冻结可信失败，复用 Review/DocGen 定点修订并刷新受影响索引。
 */
import { sha256, type ArtifactRef } from '../../domain/Domain.ts';
import { canonicalJson, type JsonValue, type StageInput, type StageResult } from '../../domain/services/workbench/StageTask.ts';
import { KNOWLEDGE_REVISION_CONTRACT, knowledgeRevisionDecision, knowledgeRevisionOutcome, finalizeKnowledgeRevision } from '../../domain/services/knowledge/KnowledgeRevision.ts';
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
        const reference = { schemaVersion: KNOWLEDGE_REVISION_CONTRACT, sourceRevision: project.commit, files };
        const referenceRef = await artifacts.put(Buffer.from(JSON.stringify(reference)), 'application/json');
        const criteria = { schemaVersion: KNOWLEDGE_REVISION_CONTRACT, candidate, instruction: '判断失败是否确由知识缺失或错误造成。若知识已正确描述行为而生成代码违反知识，不修改知识；保留未解决风险。不得为提高文本相似度改写等价代码。意见只允许指向候选章节。' };
        const criteriaRef = await artifacts.put(Buffer.from(JSON.stringify(criteria)), 'application/json');
        const report = await this.load(module.reportRef);
        const review = await roles.execute(context, frozen, 'review', card.versionId, { moduleId: card.moduleId, sourcePaths: [], publicInterfacePaths: [], provenance: [module.reportRef],
          payload: { knowledgeRef: card.bodyRef, evaluationReportRef: module.reportRef, checkReportRef: referenceRef, criteriaRef },
          materials: [{ ref: card.bodyRef, content: body }, { ref: module.reportRef, content: report }, { ref: criteriaRef, content: criteria }, { ref: referenceRef, content: reference }] });
        const decision = knowledgeRevisionDecision(review.output as unknown as ReviewOutput, card.moduleId, candidate.sections.map((item) => item.heading));
        if (!decision.heading) return { artifactRefs: [review.resultRef, review.rawRef, referenceRef], summary: { cardId: candidate.cardId, baseVersionId: card.versionId, outcome: decision.unresolved.length ? 'UNRESOLVED' : 'UNCHANGED', unresolved: decision.unresolved } };
        const correction = (review.output as unknown as ReviewOutput).correction!;
        const interfaceRef = card.metadata.interfaceRef as unknown as ArtifactRef;
        const api = await this.load(interfaceRef);
        const corrections = [{ ...correction, evidenceRefs: [module.reportRef, evidenceRef, review.rawRef, referenceRef] }];
        const revised = await roles.execute(context, frozen, 'doc-gen', card.versionId, { moduleId: card.moduleId, sourcePaths: [], publicInterfacePaths: [], provenance: [card.bodyRef],
          payload: { moduleId: card.moduleId, sourceRefs: sourceFiles.map(file => file.ref), publicInterfaceRefs: [interfaceRef], baseKnowledgeRef: card.bodyRef, corrections },
          materials: [{ ref: card.bodyRef, content: body }, { ref: module.reportRef, content: report }, { ref: interfaceRef, content: api }, { ref: evidenceRef, content: evidence }, { ref: review.rawRef, content: review.output }, { ref: referenceRef, content: reference }, ...sourceMaterials] });
        const document = revised.output as unknown as { body: string; title: string; description: string };
        document.body = finalizeKnowledgeRevision(body, document.body, decision.heading, typeof card.metadata.symbol === 'string' ? { commit: project.commit, symbol: card.metadata.symbol } : undefined);
        const latest = repository.latestKnowledgeVersion(card.moduleId);
        if (latest?.versionId !== card.versionId && !(latest?.metadata.revisionTaskId === context.task.taskId && latest.bodyRef.sha256 === sha256(document.body))) throw new Error('REVISION_CARD_CHANGED');
        const historical = repository.findKnowledgeVersionByBody(card.moduleId, `sha256:${sha256(document.body)}`);
        if (historical && historical.versionId !== latest?.versionId) throw new Error('REVISION_NO_PROGRESS');
        context.signal.throwIfAborted();
        const committed = await this.flywheel.ingestCandidate({ expectedParentVersionId: card.versionId, moduleId: card.moduleId, body: document.body, title: card.title, description: card.description,
          category: card.category, tags: card.tags, provenance: card.provenance, metadata: { ...card.metadata, stageTaskId: context.task.taskId, revisionTaskId: context.task.taskId,
            baseVersionId: card.versionId, evaluationTaskId: taskId, reviewResultRef: review.resultRef, roleResultRef: revised.resultRef } });
        return { artifactRefs: [referenceRef, ...sourceFiles.map(file => file.ref), card.bodyRef, review.resultRef, review.rawRef, revised.resultRef, revised.rawRef, committed.version.bodyRef], summary: {
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
