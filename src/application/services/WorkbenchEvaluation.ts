/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：将固定重建结果交给原生参考验证与可信评测，不授予发布资格。
 */
import { sha256, type ArtifactRef } from '../../domain/Domain.ts';
import { canonicalJson, type JsonValue } from '../../domain/services/workbench/StageTask.ts';
import { nativeFunctions, assertNativeContract, type NativeContract, type NativeBehaviorSuite } from '../../domain/services/evaluation/NativeBehaviorSuite.ts';
import { markdownSections } from '../../domain/services/knowledge/KnowledgeSections.ts';
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
  async start(reconstructionTaskId: string) {
    const { stages, configuration } = this.dependencies;
    const previous = stages.get(reconstructionTaskId);
    if (previous.contractVersion !== 'knowledge-workbench-v1' || previous.input.stage !== 'FLYWHEEL' || previous.status !== 'SUCCEEDED' || !previous.result) throw new Error('EVALUATION_RECONSTRUCTION_REQUIRED');
    const configurationRef = previous.input.parameters.configurationRef as unknown as ArtifactRef;
    await configuration.assertStageCompatible(await this.load<StageModelConfiguration>(configurationRef));
    return stages.start({ ...previous.input, stage: 'EVALUATE', parameters: { ...previous.input.parameters, reconstructionTaskId,
      reconstructionDigest: sha256(canonicalJson(previous.result)) } });
  }
  async evaluate(context: StageExecutionContext) {
    const { projects, repository, artifacts, native, stages, configuration, roles, evaluation } = this.dependencies;
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
      const fingerprint = await this.load<{ digest: string }>(fingerprintRefs[module.language]!);
      if ((await evaluation.dependencies.snapshot(module.language, project.build, context.signal)).digest !== fingerprint.digest) throw new Error('NATIVE_TEST_TOOLCHAIN_CHANGED');
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
      const reference = { language: module.language, build: project.build, files: referenceFiles };
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
      const policy = { schemaVersion: 'native-test-policy-v1', nativeContract: contract, knowledge,
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
        reference, contract, policyDigest, expectedToolchainDigest: fingerprint.digest, propose: async () => {
          const payload = { moduleId: module.moduleId, sourceSnapshotRef, publicInterfaceRefs: [module.interfaceRef], languageId: module.language, testPolicyRef };
          const result = await roles.execute(context, frozen, 'test-gen', `${module.moduleId}:candidate:${candidateRevision}`, { payload,
            materials: [{ ref: sourceSnapshotRef, content: sourceMetadata }, { ref: module.interfaceRef, content: api }, { ref: testPolicyRef, content: policy }],
            sourcePaths: [], publicInterfacePaths: [], provenance: [sourceSnapshotRef], moduleId: module.moduleId });
          return result.output.nativeSuite as unknown as NativeBehaviorSuite;
        } }, context);
      artifactRefs.push(prepared.set.suiteRef, prepared.set.oracleRef, prepared.set.fingerprintRef);
      if (prepared.set.status !== 'TRUSTED') {
        const suite = await this.load<NativeBehaviorSuite>(prepared.set.suiteRef);
        const observations = await this.load<Array<{ caseId: string; actual: unknown; reasonCode: string }>>(prepared.set.oracleRef);
        const rejected = { moduleId: module.moduleId, testSetId: prepared.set.testSetId, status: 'CANDIDATE_REJECTED', proposed: prepared.proposed, reused: prepared.reused,
          oracleRef: prepared.set.oracleRef, suiteRef: prepared.set.suiteRef, generatedEvaluated: false, knowledgeErrorProven: false,
          cases: suite.cases.map((input) => ({ input, expected: input.expected, sectionBindings: prepared.set.sectionBindings.filter((item) => input.sections.includes(item.sectionId)), observation: observations.find((item) => item.caseId === input.caseId) })) };
        const rejectionRef = await artifacts.put(Buffer.from(JSON.stringify(rejected)), 'application/json');
        await context.step(`candidate-rejection:${module.moduleId}:${candidateRevision}`, async () => ({
          artifactRefs: [rejectionRef, prepared.set.oracleRef, prepared.set.suiteRef], summary: { moduleId: module.moduleId, status: 'CANDIDATE_REJECTED', proposed: prepared.proposed, reused: prepared.reused, knowledgeErrorProven: false, reportRef: json(rejectionRef), oracleRef: json(prepared.set.oracleRef) } }));
        context.progress({ phase: 'candidate-rejected', module: module.moduleId, testSetId: prepared.set.testSetId, reportRef: json(rejectionRef) });
        // 恢复保留累计预算，仅重新生成已证明不可信的候选；中断中的候选仍复用。
        throw new Error('TEST_CANDIDATE_REJECTED');
      }
      const generated = await this.load<{ files: ToolchainFile[] }>(module.codeRef);
      context.progress({ phase: 'generated-evaluation', module: module.moduleId, testSetId: prepared.set.testSetId });
      const result = await evaluation.evaluate(prepared.set.testSetId, { language: module.language, build: project.build, files: generated.files }, contract, context);
      artifactRefs.push(result.reportRef, result.report.generatedRef);
      const moduleReport = { moduleId: module.moduleId, testSetId: prepared.set.testSetId, status: result.report.allPassed ? 'BEHAVIOR_PASSED' : 'BEHAVIOR_FAILED',
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
