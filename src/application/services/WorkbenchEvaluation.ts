/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：将固定重建结果交给原生参考验证与可信评测，不授予发布资格。
 */
import { moduleBuild, moduleFingerprintKey } from '../../domain/workbench/WorkbenchProject.ts';
import { sha256, type ArtifactRef } from '../../domain/Domain.ts';
import { canonicalJson, createStageTask, type JsonValue } from '../../domain/workbench/StageTask.ts';
import { nativeSupplementTargets, nativeSupplementTargetCoverage, type NativeSupplementTargets } from '../../domain/evaluation/NativeSupplementTargets.ts';
import { nativeFunctions, assertNativeContract, type NativeContract, type NativeBehaviorSuite } from '../../domain/evaluation/NativeBehaviorSuite.ts';
import { compareNativeObservations, type NativeBehaviorCase, type NativeScalar } from '../../domain/evaluation/NativeBehaviorSuite.ts';
import { nativeRevisionEvidence } from '../../domain/evaluation/NativeRevisionEvidence.ts';
import { nativeSupplementDemand, NATIVE_SUPPLEMENT_CONTRACT, type SupplementSourceFinding } from '../../domain/evaluation/NativeSupplementDemand.ts';
import { SOURCE_VERIFICATION_CONTRACT } from '../../domain/knowledge/KnowledgeSourceVerification.ts';
import { nativeCandidateHints } from '../../domain/evaluation/NativeCandidateFeedback.ts';
import { markdownSections } from '../../domain/knowledge/KnowledgeSections.ts';
import type { ArtifactStore, FlywheelRepository } from '../ports/ApplicationPorts.ts';
import type { WorkbenchProjectStore } from '../ports/WorkbenchProjectPorts.ts';
import type { NativeLanguageToolchain, ToolchainFile } from '../ports/LanguageToolchainPorts.ts';
import type { StageConfigurationProvider, StageModelConfiguration } from '../ports/WorkbenchGenerationPorts.ts';
import type { WorkbenchStages, StageExecutionContext } from './WorkbenchStages.ts';
import type { WorkbenchRoleExecution } from './WorkbenchRoleExecution.ts';
import type { NativeSuiteEvaluation } from './NativeSuiteEvaluation.ts';
interface ModuleResult { moduleId: string; language: 'c' | 'cpp'; cardVersionIds: string[]; codeRef: ArtifactRef; interfaceRef: ArtifactRef; interfaceComparison: { compatible: boolean } }
const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value));
export class WorkbenchEvaluation {
  readonly dependencies: { projects: WorkbenchProjectStore; repository: FlywheelRepository; artifacts: ArtifactStore;
    native: NativeLanguageToolchain; configuration: StageConfigurationProvider; stages: WorkbenchStages;
    roles: WorkbenchRoleExecution; evaluation: NativeSuiteEvaluation };
  constructor(dependencies: WorkbenchEvaluation['dependencies']) { this.dependencies = dependencies; }
  private async load<T>(ref: ArtifactRef): Promise<T> {
    const { artifacts } = this.dependencies;
    if (!ref || !await artifacts.verify(ref)) throw new Error('STAGE_ARTIFACT_CORRUPT');
    return JSON.parse(Buffer.from(await artifacts.get(ref)).toString('utf8')) as T;
  }
  /** 只读派生修订候选，重新验证可信来源及固定正文，不改写旧评测。 */
  async revisionEvidence(taskId: string) {
    const { stages, repository, artifacts, evaluation } = this.dependencies;
    const task = stages.get(taskId);
    if (task.input.stage !== 'EVALUATE' || task.input.parameters.operation !== undefined || task.status !== 'SUCCEEDED' || !task.result) throw new Error('REVISION_COMPLETED_EVALUATION_REQUIRED');
    const previous = stages.get(String(task.input.parameters.reconstructionTaskId));
    if (!previous.result || previous.status !== 'SUCCEEDED' || sha256(canonicalJson(previous.result)) !== task.input.parameters.reconstructionDigest) throw new Error('STAGE_INPUT_CHANGED');
    const modules = [];
    for (const summary of task.result.summary.modules as unknown as Array<{ moduleId: string; testSetId: string; reportRef: ArtifactRef }>) {
      const original = (previous.result.summary.modules as unknown as ModuleResult[]).find((item) => item.moduleId === summary.moduleId);
      const set = evaluation.dependencies.store.get(summary.testSetId);
      if (!original || !set || set.projectSnapshotId !== task.input.parameters.snapshotId || set.sourceRevision !== task.input.sourceRevision) throw new Error('REVISION_REPORT_BINDING_INVALID');
      const cards = [];
      for (const id of original.cardVersionIds) {
        const card = repository.getKnowledgeVersion(id);
        if (!card || !task.input.cardVersionIds.includes(id) || !await artifacts.verify(card.bodyRef)) throw new Error('REVISION_KNOWLEDGE_BINDING_INVALID');
        cards.push({ cardId: String(card.metadata.cardId), versionId: id, bodyDigest: card.bodyRef.sha256, body: Buffer.from(await artifacts.get(card.bodyRef)).toString('utf8') });
      }
      const report = await this.load<Parameters<typeof nativeRevisionEvidence>[3]>(summary.reportRef);
      const evidence = nativeRevisionEvidence(set, await this.load<NativeBehaviorSuite>(set.suiteRef),
        await this.load<Parameters<typeof nativeRevisionEvidence>[2]>(set.oracleRef), report, cards);
      modules.push({ moduleId: summary.moduleId, reportRef: summary.reportRef, suiteRef: set.suiteRef, oracleRef: set.oracleRef, ...evidence });
    }
    return { taskId, inputDigest: task.inputDigest, modules, revisionAuthorized: false };
  }
  /** 比较失败用例本身，忽略可重命名的 caseId，不以正文或词法分数制造进展。 */
  async progress(taskId: string) {
    const task = this.dependencies.stages.get(taskId);
    if (task.input.stage !== 'EVALUATE' || task.input.parameters.operation !== undefined || task.status !== 'SUCCEEDED' || !task.result) throw new Error('PIPELINE_PROGRESS_UNAVAILABLE');
    const failed: string[] = []; let total = 0, passed = 0;
    for (const module of task.result.summary.modules as unknown as Array<{ moduleId: string; reportRef: ArtifactRef }>) {
      const report = await this.load<{ cases: Array<{ status: string; actual: Record<string, NativeScalar> | null; input: NativeBehaviorCase }> }>(module.reportRef);
      for (const item of report.cases) {
        total++;
        if (item.status === 'PASSED' && item.actual !== null && compareNativeObservations(item.input, item.actual).length === 0) passed++;
        else { const { caseId: _alias, description: _description, sections: _sections, ...input } = item.input; failed.push(sha256(canonicalJson({ moduleId: module.moduleId, input }))); }
      }
    }
    if (!total) throw new Error('PIPELINE_PROGRESS_UNAVAILABLE');
    return { total, passed, failed: [...new Set(failed)].sort() };
  }
  async start(reconstructionTaskId: string, sourceVerificationTaskId?: string) {
    return this.dependencies.stages.start(await this.prepare(reconstructionTaskId, sourceVerificationTaskId));
  }
  async prepare(reconstructionTaskId: string, sourceVerificationTaskId?: string): Promise<import('../../domain/workbench/StageTask.ts').StageInput> {
    const { stages, configuration } = this.dependencies;
    const previous = stages.get(reconstructionTaskId);
    if (previous.contractVersion !== 'knowledge-workbench-v1' || previous.input.stage !== 'FLYWHEEL' || previous.input.parameters.operation !== undefined || previous.status !== 'SUCCEEDED' || !previous.result) throw new Error('EVALUATION_RECONSTRUCTION_REQUIRED');
    const configurationRef = previous.input.parameters.configurationRef as unknown as ArtifactRef;
    await configuration.assertStageCompatible(await this.load<StageModelConfiguration>(configurationRef));
    const supplement = sourceVerificationTaskId ? await this.supplementDemand(sourceVerificationTaskId, reconstructionTaskId) : null;
    const supplementRef = supplement ? await this.dependencies.artifacts.put(Buffer.from(canonicalJson(supplement)), 'application/json') : null;
    const input: import('../../domain/workbench/StageTask.ts').StageInput = { ...previous.input, stage: 'EVALUATE', parameters: { ...previous.input.parameters, reconstructionTaskId,
      reconstructionDigest: sha256(canonicalJson(previous.result)), ...(supplementRef ? { supplementContract: NATIVE_SUPPLEMENT_CONTRACT,
        sourceVerificationTaskId: sourceVerificationTaskId!, supplementRef: json(supplementRef) } : {}) } };
    // Existing frozen executions retain their identity and consumed budget. Never silently upgrade a retry.
    if (supplement && !stages.store.get(createStageTask(input, {}, new Date().toISOString()).taskId)) {
      input.parameters.supplementTargets = json(nativeSupplementTargets(supplement.demands.map(item => item.sectionId)));
    }
    return input;
  }
  private async supplementDemand(sourceTaskId: string, reconstructionTaskId: string) {
    const { stages, repository, artifacts } = this.dependencies;
    const source = stages.get(sourceTaskId), code = stages.get(reconstructionTaskId);
    if (source.status !== 'SUCCEEDED' || !source.result || source.input.parameters.operation !== 'KNOWLEDGE_SOURCE_VERIFICATION'
      || source.input.parameters.verificationContract !== SOURCE_VERIFICATION_CONTRACT) throw new Error('NATIVE_SUPPLEMENT_SOURCE_REQUIRED');
    const evaluation = stages.get(String(source.input.parameters.evaluationTaskId));
    if (evaluation.status !== 'SUCCEEDED' || !evaluation.result || evaluation.input.stage !== 'EVALUATE' || evaluation.input.parameters.operation !== undefined
      || source.input.parameters.evaluationDigest !== sha256(canonicalJson(evaluation.result)) || evaluation.input.parameters.reconstructionTaskId !== reconstructionTaskId
      || source.input.configurationDigest !== code.input.configurationDigest || source.input.sourceDigest !== code.input.sourceDigest
      || source.input.sourceRevision !== code.input.sourceRevision || source.input.projectId !== code.input.projectId
      || canonicalJson(source.input.cardVersionIds) !== canonicalJson(code.input.cardVersionIds)) throw new Error('NATIVE_SUPPLEMENT_BINDING_INVALID');
    const cards = [];
    for (const versionId of source.input.cardVersionIds) {
      const card = repository.getKnowledgeVersion(versionId);
      if (!card || !await artifacts.verify(card.bodyRef)) throw new Error('STAGE_ARTIFACT_CORRUPT');
      cards.push({ cardId: String(card.metadata.cardId), versionId, moduleId: card.moduleId, bodyDigest: card.bodyRef.sha256,
        body: Buffer.from(await artifacts.get(card.bodyRef)).toString('utf8') });
    }
    return { sourceTaskId, sourceResultDigest: sha256(canonicalJson(source.result)),
      ...nativeSupplementDemand(cards, source.result.summary.cards as unknown as SupplementSourceFinding[]) };
  }
  async evaluate(context: StageExecutionContext) {
    const { projects, repository, artifacts, native, stages, configuration, roles, evaluation } = this.dependencies;
    const parameters = context.task.input.parameters;
    if (parameters.supplementContract !== undefined && parameters.supplementContract !== NATIVE_SUPPLEMENT_CONTRACT) throw new Error('STAGE_CONTRACT_INCOMPATIBLE');
    const supplement = parameters.supplementContract ? await this.supplementDemand(String(parameters.sourceVerificationTaskId), String(parameters.reconstructionTaskId)) : null;
    if (supplement && canonicalJson(supplement) !== canonicalJson(await this.load(parameters.supplementRef as unknown as ArtifactRef))) throw new Error('STAGE_INPUT_CHANGED');
    const targets = parameters.supplementTargets as unknown as NativeSupplementTargets | undefined;
    if (targets) {
      nativeSupplementTargetCoverage(targets, { schemaVersion: 'native-cases-v1', cases: [] });
      if (!supplement || canonicalJson(targets) !== canonicalJson(nativeSupplementTargets(supplement.demands.map(item => item.sectionId)))) throw new Error('STAGE_INPUT_CHANGED');
    }
    const previous = stages.get(String(context.task.input.parameters.reconstructionTaskId));
    if (!previous.result || previous.status !== 'SUCCEEDED' || sha256(canonicalJson(previous.result)) !== context.task.input.parameters.reconstructionDigest
      || previous.inputDigest !== sha256(canonicalJson({ contractVersion: previous.contractVersion, input: previous.input, limits: previous.limits }))) throw new Error('STAGE_INPUT_CHANGED');
    const project = projects.get(String(context.task.input.parameters.snapshotId));
    if (!project || project.commit !== context.task.input.sourceRevision || project.sourceDigest !== context.task.input.sourceDigest) throw new Error('STAGE_INPUT_CHANGED');
    const configurationRef = context.task.input.parameters.configurationRef as unknown as ArtifactRef;
    if (configurationRef.sha256 !== context.task.input.configurationDigest) throw new Error('STAGE_INPUT_CHANGED');
    const frozen = await this.load<StageModelConfiguration>(configurationRef);
    await configuration.assertStageCompatible(frozen);
    const modules = previous.result.summary.modules as unknown as ModuleResult[];
    if (!Array.isArray(modules) || !modules.length) throw new Error('EVALUATION_RECONSTRUCTION_REQUIRED');
    const reports: JsonValue[] = []; const artifactRefs: ArtifactRef[] = [];
    for (const module of modules) {
      const selected = project.modules.find((item) => item.moduleId === module.moduleId);
      if (!selected || selected.language !== module.language) throw new Error('STAGE_INPUT_CHANGED');
      const api = await this.load<Awaited<ReturnType<NativeLanguageToolchain['publicInterface']>>>(module.interfaceRef);
      const contract: NativeContract = { schemaVersion: 'native-contract-v1', language: module.language, includePath: api.sourcePath,
        entryPaths: selected.sourcePaths.filter((path) => /\.(c|cc|cpp|cxx)$/.test(path) && path !== api.sourcePath), declarations: api.declarations, targetFunctions: [] };
      contract.targetFunctions = [...nativeFunctions(contract).keys()];
      assertNativeContract(contract);
      const fingerprintRefs = context.task.input.parameters.fingerprints as unknown as Record<string, ArtifactRef>;
      const fingerprint = await this.load<{ digest: string }>(fingerprintRefs[moduleFingerprintKey(project, module.moduleId, module.language)]!);
      if ((await evaluation.dependencies.snapshot(module.language, moduleBuild(project, module.moduleId), context.signal)).digest !== fingerprint.digest) throw new Error('NATIVE_TEST_TOOLCHAIN_CHANGED');
      const completed = stages.store.checkpoints(context.task.taskId).find((item) => item.key === `module-report:${module.moduleId}`);
      if (completed) { reports.push(completed.result.summary); artifactRefs.push(...completed.result.artifactRefs);
        if (completed.result.summary.status === 'BEHAVIOR_FAILED') break;
        continue;
      }
      const referenceFiles: ToolchainFile[] = [];
      for (const source of project.sourceFiles.filter((item) => item.kind === 'source')) {
        if (!await artifacts.verify(source.ref)) throw new Error('STAGE_ARTIFACT_CORRUPT');
        referenceFiles.push({ path: source.path, content: Buffer.from(await artifacts.get(source.ref)).toString('utf8') });
      }
      const reference = { language: module.language, build: moduleBuild(project, module.moduleId), files: referenceFiles };
      const baseline = await context.step(`reference-baseline:${module.moduleId}`, async () => {
        const path = module.language === 'c' ? '__workbench_baseline.c' : '__workbench_baseline.cpp';
        if (referenceFiles.some((item) => item.path === path)) throw new Error('EVALUATION_RESERVED_PATH');
        const report = await native.compileAndRun({ ...reference, sanitizers: true,
          files: [...referenceFiles, { path, content: `#include "${contract.includePath}"\nint main(void){return 0;}\n` }], entryPaths: [...contract.entryPaths, path] }, context.signal);
        const ref = await artifacts.put(Buffer.from(JSON.stringify(report)), 'application/json');
        const valid = report.build.exitCode === 0 && report.execution?.exitCode === 0
          && !report.build.timedOut && !report.build.outputLimitExceeded && !report.execution.timedOut && !report.execution.outputLimitExceeded;
        if (!valid) {
          await context.step(`reference-baseline:${module.moduleId}:failure:${context.task.attempt}`, async () => ({ artifactRefs: [ref], summary: { valid: false } }));
          throw new Error('NATIVE_REFERENCE_BASELINE_FAILED');
        }
        return { artifactRefs: [ref], summary: { valid: true } };
      });
      artifactRefs.push(...baseline.artifactRefs);
      if (!baseline.summary.valid) throw new Error('NATIVE_REFERENCE_BASELINE_FAILED');
      const cards = module.cardVersionIds.map((id) => repository.getKnowledgeVersion(id));
      if (cards.some((card) => !card || card.metadata.projectSnapshotId !== project.snapshotId || !context.task.input.cardVersionIds.includes(card.versionId))) throw new Error('STAGE_INPUT_CHANGED');
      const knowledge = [];
      for (const card of cards) {
        if (!await artifacts.verify(card!.bodyRef)) throw new Error('STAGE_ARTIFACT_CORRUPT');
        const body = Buffer.from(await artifacts.get(card!.bodyRef)).toString('utf8');
        knowledge.push({ cardId: String(card!.metadata.cardId), versionId: card!.versionId, body,
          sections: markdownSections(body).map((section) => `${card!.metadata.cardId}#${section.heading}`) });
      }
      // 只反馈本阶段、本模块已经拒绝的候选观察；不暴露参考正文或生成实现。
      const rejection = stages.store.checkpoints(context.task.taskId)
        .filter((item) => item.key.startsWith(`candidate-rejection:${module.moduleId}:`))
        .sort((a, b) => Number(a.key.split(':').at(-1)) - Number(b.key.split(':').at(-1))).at(-1);
      let rejectedCandidate: unknown = null;
      if (rejection) {
        const report = await this.load<{ moduleId: string; status: string; targetCoverage?: ReturnType<typeof nativeSupplementTargetCoverage>; cases: Array<{ input: NativeBehaviorSuite['cases'][number]; observation?: { status: string; reasonCode: string | null; actual: unknown; mismatches: string[] } }> }>(rejection.result.artifactRefs[0]!);
        if (report.moduleId !== module.moduleId || report.status !== 'CANDIDATE_REJECTED') throw new Error('STAGE_ARTIFACT_CORRUPT');
        rejectedCandidate = { trusted: false, ...(report.targetCoverage ? { targetCoverage: report.targetCoverage } : {}), cases: report.cases.map(({ input, observation }) => ({ input, constructionHints: nativeCandidateHints(input, observation?.reasonCode ?? null),
          observation: observation ? { status: observation.status, reasonCode: observation.reasonCode, actual: observation.actual, mismatches: observation.mismatches } : null })) };
      }
      const moduleDemands = supplement?.demands.filter(item => module.cardVersionIds.includes(item.versionId)) ?? [];
      const moduleTargets = targets && moduleDemands.length ? nativeSupplementTargets(moduleDemands.map(item => item.sectionId)) : undefined;
      const policy = { schemaVersion: 'native-test-policy-v1', nativeContract: contract, knowledge, rejectedCandidate,
        ...(moduleDemands.length ? { supplement: { contract: supplement!.contract, demands: moduleDemands, ...(moduleTargets ? { targets: moduleTargets } : {}), instruction: 'Add cases addressing these exact sections and missing evidence. Preserve all established expectations.' + (moduleTargets ? ' Exact section citations locate evidence but do not prove semantic coverage; do not claim metadata or source provenance is proven by behavior tests.' : '') } } : {}),
        sourceVisibility: 'metadata-only', oracleRequired: true, immutableTrustedExpectations: true,
        sectionRule: 'Each case.sections must use exact cardId#H2 identifiers from knowledge.sections.' };
      const testPolicyRef = await artifacts.put(Buffer.from(JSON.stringify(policy)), 'application/json');
      const sourceMetadata = { projectSnapshotId: project.snapshotId, sourceRevision: project.commit, sourceDigest: project.sourceDigest };
      const sourceSnapshotRef = await artifacts.put(Buffer.from(JSON.stringify(sourceMetadata)), 'application/json');
      const testPrompt = frozen.agents.find((item) => item.agentId === 'test-gen');
      if (!testPrompt) throw new Error('RUN_CONFIGURATION_INCOMPATIBLE');
      const policyDigest = sha256(canonicalJson({ schemaVersion: policy.schemaVersion, prompt: testPrompt.effectivePromptSha256,
        roleExecutionVersion: frozen.roleExecutionVersion, contracts: frozen.contracts, provider: frozen.provider }));
      const candidateRevision = stages.store.events(context.task.taskId).filter((event) => {
        const detail = event.detail; return detail && !Array.isArray(detail) && typeof detail === 'object' && detail.phase === 'candidate-rejected' && detail.module === module.moduleId;
      }).length;
      context.progress({ phase: 'reference-validation', module: module.moduleId });
      const prepared = await evaluation.prepare({ projectSnapshotId: project.snapshotId, sourceRevision: project.commit,
        cardIds: knowledge.map((card) => card.cardId), versionIds: module.cardVersionIds, bodyRefs: cards.map((card) => card!.bodyRef),
        reference, contract, policyDigest, ...(moduleDemands.length ? { supplement: { schemaVersion: 'native-supplement-v1' as const, demandDigest: supplement!.demandDigest, ...(moduleTargets ? { targets: moduleTargets } : {}) } } : {}), expectedToolchainDigest: fingerprint.digest, propose: async () => {
          const payload = { executionContract: 'behavior-cases-v1', moduleId: module.moduleId, sourceSnapshotRef, publicInterfaceRefs: [module.interfaceRef], languageId: module.language, testPolicyRef };
          const result = await roles.execute(context, frozen, 'test-gen', `${module.moduleId}:candidate:${candidateRevision}`, { payload,
            materials: [{ ref: sourceSnapshotRef, content: sourceMetadata }, { ref: module.interfaceRef, content: api }, { ref: testPolicyRef, content: policy }],
            sourcePaths: [], publicInterfacePaths: [], provenance: [sourceSnapshotRef], moduleId: module.moduleId });
          return result.output.nativeSuite as unknown as NativeBehaviorSuite;
        } }, context);
      artifactRefs.push(prepared.set.suiteRef, prepared.set.oracleRef, prepared.set.fingerprintRef);
      const targetCoverage = moduleTargets ? prepared.targetCoverage ?? nativeSupplementTargetCoverage(moduleTargets, await this.load<NativeBehaviorSuite>(prepared.set.suiteRef)) : undefined;
      const targetCoverageRef = targetCoverage ? await artifacts.put(Buffer.from(JSON.stringify(targetCoverage)), 'application/json') : undefined;
      if (targetCoverageRef) artifactRefs.push(targetCoverageRef);
      if (prepared.set.status !== 'TRUSTED') {
        const suite = await this.load<NativeBehaviorSuite>(prepared.set.suiteRef);
        const observations = await this.load<Array<{ caseId: string; actual: unknown; reasonCode: string }>>(prepared.set.oracleRef);
        const conflict = prepared.rejection === 'TRUSTED_GATE_CONFLICT';
        const rejected = { moduleId: module.moduleId, testSetId: prepared.set.testSetId, status: conflict ? 'TRUSTED_GATE_CONFLICT' : 'CANDIDATE_REJECTED', proposed: prepared.proposed, reused: prepared.reused,
          oracleRef: prepared.set.oracleRef, suiteRef: prepared.set.suiteRef, generatedEvaluated: false, knowledgeErrorProven: false,
          ...(targetCoverage ? { targetCoverage } : {}),
          cases: suite.cases.map((input) => ({ input, expected: input.expected, sectionBindings: prepared.set.sectionBindings.filter((item) => input.sections.includes(item.sectionId)), observation: observations.find((item) => item.caseId === input.caseId) })) };
        const rejectionRef = await artifacts.put(Buffer.from(JSON.stringify(rejected)), 'application/json');
        await context.step(`${conflict ? 'trusted-gate-conflict' : 'candidate-rejection'}:${module.moduleId}:${conflict ? context.task.attempt : candidateRevision}`, async () => ({
          artifactRefs: [rejectionRef, prepared.set.oracleRef, prepared.set.suiteRef], summary: { moduleId: module.moduleId, status: rejected.status, proposed: prepared.proposed, reused: prepared.reused, knowledgeErrorProven: false, reportRef: json(rejectionRef), oracleRef: json(prepared.set.oracleRef) } }));
        context.progress({ phase: conflict ? 'trusted-gate-conflict' : 'candidate-rejected', module: module.moduleId, testSetId: prepared.set.testSetId, reportRef: json(rejectionRef) });
        // 恢复保留累计预算，仅重新生成已证明不可信的候选；中断中的候选仍复用。
        throw new Error(conflict ? 'NATIVE_TRUSTED_REFERENCE_FAILED' : 'TEST_CANDIDATE_REJECTED');
      }
      const generated = await this.load<{ files: ToolchainFile[] }>(module.codeRef);
      context.progress({ phase: 'generated-evaluation', module: module.moduleId, testSetId: prepared.set.testSetId });
      const result = await evaluation.evaluate(prepared.set.testSetId, { language: module.language, build: moduleBuild(project, module.moduleId), files: generated.files }, contract, context);
      artifactRefs.push(result.reportRef, result.report.generatedRef);
      const moduleReport = { moduleId: module.moduleId, testSetId: prepared.set.testSetId, status: result.report.allPassed ? 'BEHAVIOR_PASSED' : 'BEHAVIOR_FAILED',
        ...(targetCoverage ? { targetCoverage: json(targetCoverage), targetCoverageRef: json(targetCoverageRef) } : {}),
        interfaceCompatible: module.interfaceComparison.compatible, proposed: prepared.proposed, reused: prepared.reused, revalidated: prepared.revalidated,
        reportRef: json(result.reportRef), passed: result.report.passed, total: result.report.total, publicationVerified: false };
      await context.step(`module-report:${module.moduleId}`, async () => ({ artifactRefs: [result.reportRef, result.report.generatedRef], summary: moduleReport }));
      reports.push(moduleReport);
      if (!result.report.allPassed) break;
    }
    return { artifactRefs, summary: { snapshotId: project.snapshotId, reconstructionTaskId: previous.taskId, modules: reports,
      completedModules: reports.length, requestedModules: modules.length, publicationVerified: false, revisions: [] } };
  }
}
