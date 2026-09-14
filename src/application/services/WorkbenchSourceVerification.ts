/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：对全部冻结卡片执行独立来源复核，保留纠正意见而不伪造行为失败。
 */
import { SOURCE_EVIDENCE_POLICY, sourceEvidenceBindings } from '../../domain/knowledge/SourceEvidenceBindings.ts';
import { SOURCE_EXECUTION_SCOPE, sourceExecutionScope } from '../../domain/knowledge/SourceExecutionScope.ts';
import { moduleBuild, type WorkbenchProjectSnapshot } from '../../domain/workbench/WorkbenchProject.ts';
import { WorkbenchSourceFindingHistory, assertSourceReviewHistory, type SourceFindingProof, type SourceReviewConcernProof } from './WorkbenchSourceFindingHistory.ts';
import { SOURCE_ASSESSMENT_POLICY, readSourceAssessmentPolicy, SOURCE_REVIEW_POLICY, readSourceReviewPolicy } from '../../domain/knowledge/SourceReviewPolicy.ts';
import { sha256, type ArtifactRef } from '../../domain/Domain.ts';
import { canonicalJson, type JsonValue, type StageInput } from '../../domain/workbench/StageTask.ts';
import { markdownSections } from '../../domain/knowledge/KnowledgeSections.ts';
import { SOURCE_VERIFICATION_CONTRACT, sourceSectionObservations, sourceSectionDecision, sourceSectionsOutcome, sourceVerificationOutcome, type SourceCardBinding, type SourceCardResult } from '../../domain/knowledge/KnowledgeSourceVerification.ts';
import type { NativeBehaviorSuite } from '../../domain/evaluation/NativeBehaviorSuite.ts';
import type { Output as ReviewOutput } from '../../domain/agents/reviewAgent/WorkbenchReviewContract.ts';
import type { StageModelConfiguration } from '../ports/WorkbenchGenerationPorts.ts';
import type { WorkbenchEvaluation } from './WorkbenchEvaluation.ts';
import type { StageExecutionContext } from './WorkbenchStages.ts';
const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value));
const uniqueRefs = (refs: ArtifactRef[]) => [...new Map(refs.map(ref => [ref.sha256, ref])).values()];
export class WorkbenchSourceVerification {
  readonly evaluation: WorkbenchEvaluation;
  constructor(evaluation: WorkbenchEvaluation) { this.evaluation = evaluation; }
  private async load<T>(ref: ArtifactRef): Promise<T> {
    const { artifacts } = this.evaluation.dependencies;
    if (!ref || !await artifacts.verify(ref)) throw new Error('STAGE_ARTIFACT_CORRUPT');
    return JSON.parse(Buffer.from(await artifacts.get(ref)).toString('utf8')) as T;
  }
  async start(evaluationTaskId: string) { return this.evaluation.dependencies.stages.start(await this.prepare(evaluationTaskId)); }
  private async executionScopes(project: WorkbenchProjectSnapshot, modules: Array<{ moduleId: string; testSetId: string }>) {
    const scopes = [];
    for (const module of modules) {
      const set = this.evaluation.dependencies.evaluation.dependencies.store.get(module.testSetId);
      if (!set || set.projectSnapshotId !== project.snapshotId || set.sourceRevision !== project.commit) throw new Error('SOURCE_EXECUTION_BINDING_INVALID');
      const reference = await this.load<Parameters<typeof sourceExecutionScope>[1]>(set.referenceRef);
      const toolchain = await this.load<Parameters<typeof sourceExecutionScope>[2]>(set.fingerprintRef);
      scopes.push({ moduleId: module.moduleId, scope: sourceExecutionScope(set, reference, toolchain, moduleBuild(project, module.moduleId)) });
    }
    return scopes.sort((a, b) => a.moduleId.localeCompare(b.moduleId));
  }
  async prepare(evaluationTaskId: string): Promise<StageInput> {
    const { stages, artifacts, configuration } = this.evaluation.dependencies;
    const parent = stages.get(evaluationTaskId);
    if (parent.input.stage !== 'EVALUATE' || parent.input.parameters.operation !== undefined || parent.status !== 'SUCCEEDED' || !parent.result) throw new Error('SOURCE_VERIFICATION_EVALUATION_REQUIRED');
    const existing = stages.store.list(parent.input.projectId).find(task => task.input.parameters.operation === 'KNOWLEDGE_SOURCE_VERIFICATION'
      && task.input.parameters.verificationContract === SOURCE_VERIFICATION_CONTRACT && task.input.parameters.evaluationTaskId === evaluationTaskId);
    if (existing) return existing.input;
    const evidence = await this.evaluation.revisionEvidence(evaluationTaskId);
    const configurationRef = parent.input.parameters.configurationRef as unknown as ArtifactRef;
    await configuration.assertStageCompatible(await this.load<StageModelConfiguration>(configurationRef));
    const priorFindingsRef = await artifacts.put(Buffer.from(JSON.stringify(await new WorkbenchSourceFindingHistory(this.evaluation).collect(parent))), 'application/json');
    const pendingConcernsRef = await artifacts.put(Buffer.from(JSON.stringify(await new WorkbenchSourceFindingHistory(this.evaluation).collectConcerns(parent))), 'application/json');
    const evidenceRef = await artifacts.put(Buffer.from(canonicalJson(evidence)), 'application/json');
    const project = this.evaluation.dependencies.projects.get(String(parent.input.parameters.snapshotId));
    if (!project) throw new Error('STAGE_INPUT_CHANGED');
    const executionScopesRef = await artifacts.put(Buffer.from(canonicalJson(await this.executionScopes(project, evidence.modules))), 'application/json');
    return { ...parent.input, parameters: { operation: 'KNOWLEDGE_SOURCE_VERIFICATION', verificationContract: SOURCE_VERIFICATION_CONTRACT,
      sourceAssessmentPolicy: SOURCE_ASSESSMENT_POLICY, sourceReviewPolicy: json(SOURCE_REVIEW_POLICY), sourceEvidencePolicy: SOURCE_EVIDENCE_POLICY,
      sourceExecutionPolicy: SOURCE_EXECUTION_SCOPE, executionScopesRef: json(executionScopesRef),
      evaluationTaskId, evaluationDigest: sha256(canonicalJson(parent.result)), snapshotId: parent.input.parameters.snapshotId!,
      pendingConcernsRef: json(pendingConcernsRef), priorFindingsRef: json(priorFindingsRef), evidenceRef: json(evidenceRef), configurationRef: json(configurationRef) } };
  }
  async verify(context: StageExecutionContext) {
    const { stages, projects, repository, artifacts, roles, configuration } = this.evaluation.dependencies;
    const parameters = context.task.input.parameters;
    await assertSourceReviewHistory(artifacts, stages.store.events(context.task.taskId));
    if (parameters.sourceExecutionPolicy !== undefined && parameters.sourceExecutionPolicy !== SOURCE_EXECUTION_SCOPE) throw new Error('SOURCE_EXECUTION_POLICY_INVALID');
    const sourceAssessmentPolicy = readSourceAssessmentPolicy(parameters.sourceAssessmentPolicy);
    const sourceReviewPolicy = readSourceReviewPolicy(parameters.sourceReviewPolicy);
    if (parameters.sourceEvidencePolicy !== undefined && parameters.sourceEvidencePolicy !== SOURCE_EVIDENCE_POLICY) throw new Error('SOURCE_EVIDENCE_POLICY_INVALID');
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
    const executionScopes = parameters.sourceExecutionPolicy ? await this.executionScopes(project, evidence.modules) : [];
    if (parameters.sourceExecutionPolicy && canonicalJson(executionScopes) !== canonicalJson(await this.load(parameters.executionScopesRef as unknown as ArtifactRef))) throw new Error('SOURCE_EXECUTION_BINDING_INVALID');
    if (parameters.sourceExecutionPolicy) await context.step('source-execution-scope', async () => ({
      artifactRefs: [parameters.executionScopesRef as unknown as ArtifactRef, ...executionScopes.flatMap(item => [item.scope.referenceRef, item.scope.fingerprintRef])],
      summary: { sourceExecutionPolicy: SOURCE_EXECUTION_SCOPE, modules: executionScopes.map(item => item.moduleId), publicationVerified: false },
    }));
    const priorFindingsRef = parameters.priorFindingsRef as unknown as ArtifactRef;
    const proofs = await this.load<SourceFindingProof[]>(priorFindingsRef);
    if (!Array.isArray(proofs) || proofs.length > 1000) throw new Error('SOURCE_HISTORY_BINDING_INVALID');
    const history = new WorkbenchSourceFindingHistory(this.evaluation);
    const pendingConcernsRef = parameters.pendingConcernsRef as unknown as ArtifactRef;
    const pendingConcerns = await this.load<SourceReviewConcernProof[]>(pendingConcernsRef);
    await history.validateConcerns(pendingConcerns, context.task.input);
    const preserved = new Map<string, { proof: SourceFindingProof; value: Awaited<ReturnType<WorkbenchSourceFindingHistory['validate']>> }>();
    for (const proof of proofs) {
      const value = await history.validate(proof, context.task.input); const key = canonicalJson([value.finding.versionId, value.finding.section]);
      if (preserved.has(key)) throw new Error('SOURCE_HISTORY_BINDING_INVALID');
      preserved.set(key, { proof, value });
    }
    const expected: SourceCardBinding[] = [], results: Array<SourceCardResult & Record<string, unknown>> = [];
    const refs: ArtifactRef[] = [parameters.evidenceRef as unknown as ArtifactRef, priorFindingsRef, pendingConcernsRef];
    if (parameters.sourceExecutionPolicy) refs.push(parameters.executionScopesRef as unknown as ArtifactRef);
    for (const versionId of context.task.input.cardVersionIds) {
      const card = repository.getKnowledgeVersion(versionId);
      if (!card || typeof card.metadata.cardId !== 'string' || card.metadata.projectSnapshotId !== project.snapshotId || !await artifacts.verify(card.bodyRef)) throw new Error('SOURCE_VERIFICATION_CARD_UNBOUND');
      const module = project.modules.find(item => item.moduleId === card.metadata.sourceModule);
      const moduleEvidence = evidence.modules.find(item => item.moduleId === module?.moduleId);
      if (!module || !moduleEvidence) throw new Error('SOURCE_VERIFICATION_CARD_UNBOUND');
      const executionScope = executionScopes.find(item => item.moduleId === module.moduleId)?.scope;
      const executionMaterials = executionScope ? [
        { ref: executionScope.referenceRef, content: await this.load(executionScope.referenceRef) },
        { ref: executionScope.fingerprintRef, content: await this.load(executionScope.fingerprintRef) },
      ] : [];
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
        const oracle = await this.load<Parameters<typeof sourceSectionObservations>[1]>(moduleEvidence.oracleRef);
        const sections: Array<SourceCardResult & { section: string; unresolved: string[] } & Record<string, unknown>> = [];
        const sectionRefs: ArtifactRef[] = [];
        for (const [sectionIndex, heading] of headings.entries()) {
          context.progress({ phase: 'source-section', versionId, heading, completed: sectionIndex, total: headings.length });
          const sectionKey = sha256(heading).slice(0, 24);
          const section = await context.step(`source-section:${versionId}:${sectionKey}`, async () => {
            const prior = preserved.get(canonicalJson([versionId, heading]));
            if (prior) return { artifactRefs: [...prior.value.result.artifactRefs, priorFindingsRef],
              summary: { ...prior.value.result.summary, originEvidence: json(prior.proof), carriedForward: true } };

            const report = { schemaVersion: 'native-source-review-evidence-v3', sourceRevision: project.commit, sourceDigest: project.sourceDigest,
              suiteRef: moduleEvidence.suiteRef, oracleRef: moduleEvidence.oracleRef,
              ...sourceSectionObservations(suite, oracle, binding.cardId, heading) };
            const reportRef = await artifacts.put(Buffer.from(JSON.stringify(report)), 'application/json');
            const digestBindings = sourceEvidenceBindings(parameters.sourceEvidencePolicy, project, module.moduleId);
            const criteria = { pendingReviewConcerns: pendingConcerns.filter(p => p.versionId === versionId && p.heading === heading).map(({ concernId, criterion, risk }) => ({ concernId, criterion, risk })),
              concernInstruction: '待核实线索来自旧失败输出，不代表事实。逐条回应concernResolutions；确认时保留修订，否定时给出本轮固定源码的逐字引用和理由，无法决定则保留未知风险，不能忽略线索。',
              schemaVersion: SOURCE_VERIFICATION_CONTRACT, phase: 'FINAL_SOURCE_REVIEW', binding,
              ...(executionScope ? { executionScope, executionScopeInstruction: '本次参考测试使用executionScope中的固定构建与平台；definitions列出声明式编译定义，不是编译器全部预定义宏。SINGLE_FROZEN_BUILD不证明其他宏组合或平台已测试。结合源码判断该配置下的事实，不凭空补充覆盖，也不清除实际未知风险。' } : {}),
              ...(digestBindings ? { sourceEvidenceBindings: digestBindings } : {}),
              ...(sourceReviewPolicy ? { sourceReviewPolicy } : {}),
              ...(sourceAssessmentPolicy ? { sourceAssessmentPolicy } : {}),
              applicationVerified: { artifactDigests: true, frozenVersionBindings: true }, section: heading, verifyPreamble: sectionIndex === 0, allowedKnowledgePaths: [`knowledge/${card.moduleId}.md#${heading}`],
              instruction: '本次只独立核对 section 指定的 H2 与固定源码的一致性。完整正文提供上下文，其他 H2 由独立调用复核，不属于本次纠正范围或未知风险。必须核对该节全部事实、边界和例子。verifyPreamble为true时也须核对标题及首个H2之前的文本；若该区域有无法在授权H2修正的矛盾，保留未解决风险，不能放行或修改其他区域。应用已验证提供工件的摘要和冻结来源绑定；无需重新计算摘要或联网审计。仍须检查正文对来源和版本的文字断言是否与提供的绑定相符。cases包含精确绑定当前卡片章节的完整参考用例；relatedObservations保留模块其他已验证观察的摘要，章节标签不能作为源码事实适用范围的硬边界。相关摘要不是完整输入定义，不据此推断未覆盖输入，判断关联性仍以固定源码为准；NO_DIRECT_BEHAVIOR_EVIDENCE 表示没有直接行为用例，不能虚构覆盖，也不自动否定可由固定源码证明的事实。参考观察明确标记PINNED_REFERENCE，只证明对应参考用例；不能推断所有可能输入都已验证。逐项核对边界、状态、接口及示例。与固定源码直接矛盾的事实必须指出，即使重建代码通过了行为测试。上游失败归因PASS不代表正文正确。发现明确错误时指向已有H2；缺少证据则保留风险。仅在当前 H2 无矛盾、无未知风险时PASS；这不是发布授权。' };
            const criteriaRef = await artifacts.put(Buffer.from(JSON.stringify(criteria)), 'application/json');
            const inputRefs = [card.bodyRef, referenceRef, reportRef, criteriaRef, moduleEvidence.suiteRef, moduleEvidence.oracleRef];
            inputRefs.push(...executionMaterials.map(item => item.ref));
            await context.step(`source-materials:${versionId}:${sectionKey}`, async () => ({ artifactRefs: inputRefs, summary: { versionId, heading } }));
            const review = await roles.execute(context, frozen, 'review', `final-source:${versionId}:${sectionKey}`, { moduleId: card.moduleId, sourcePaths: [], publicInterfacePaths: [], provenance: [card.bodyRef, referenceRef],
              payload: { executionContract: 'workbench-review-v1', knowledgeRef: card.bodyRef, evaluationReportRef: reportRef, checkReportRef: referenceRef, criteriaRef },
              materials: [{ ref: card.bodyRef, content: body }, { ref: referenceRef, content: reference }, { ref: reportRef, content: report }, { ref: criteriaRef, content: criteria }, ...executionMaterials] });
            const opinion = review.output as unknown as ReviewOutput;
            const decision = sourceSectionDecision(card.moduleId, body, heading, opinion);
            return { artifactRefs: [...inputRefs, review.resultRef, review.rawRef], summary: { ...binding, section: heading, ...decision, concernResolutions: json(opinion.concernResolutions ?? []), criterion: opinion.correction?.criterion ?? null, referenceRef: json(referenceRef), referenceObservationsRef: json(reportRef), criteriaRef: json(criteriaRef), reviewResultRef: json(review.resultRef), reviewRef: json(review.rawRef) } };
          });
          sections.push(section.summary as unknown as typeof sections[number]); sectionRefs.push(...section.artifactRefs);
          context.progress({ phase: 'source-section', versionId, heading, completed: sectionIndex + 1, total: headings.length });
        }
        const primary = sections.find(section => section.outcome === 'SOURCE_MISMATCH') ?? sections.find(section => section.outcome === 'UNRESOLVED') ?? sections[0]!;
        return { artifactRefs: uniqueRefs(sectionRefs), summary: { ...json(primary) as Record<string, JsonValue>,
          outcome: sourceSectionsOutcome(body, sections), unresolved: [...new Set(sections.flatMap(section => section.unresolved))], sections: json(sections) } };

      });
      await assertSourceReviewHistory(artifacts, stages.store.events(context.task.taskId));
      results.push(output.summary as unknown as SourceCardResult & Record<string, unknown>); refs.push(...output.artifactRefs);
    }
    return { artifactRefs: uniqueRefs(refs), summary: { operation: 'KNOWLEDGE_SOURCE_VERIFICATION', evaluationTaskId: parent.taskId,
      snapshotId: project.snapshotId, versionIds: context.task.input.cardVersionIds, cards: json(results), outcome: sourceVerificationOutcome(expected, results), publicationVerified: false } };
  }
}
