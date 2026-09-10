/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：冻结固定测试并分别评测参考与重建实现，逐案保留恢复证据。
 */
import { sha256, type ArtifactRef } from '../../domain/Domain.ts';
import { canonicalJson, type JsonValue, type StageInput } from '../../domain/services/workbench/StageTask.ts';
import { assertNativeBehaviorSuite, nativeFunctions, type NativeBehaviorSuite, type NativeContract } from '../../domain/services/evaluation/NativeBehaviorSuite.ts';
import { FIXED_EVALUATION_CONTRACT, fixedModuleCoverage, fixedCardCoverage, fixedNativePassed } from '../../domain/services/evaluation/NativeFixedEvaluation.ts';
import { compareNativeInterfaces } from '../../domain/services/evaluation/NativeInterfaceComparison.ts';
import type { NativeLanguageToolchain, NativeToolchainInput, ToolchainFile } from '../ports/LanguageToolchainPorts.ts';
import type { NativeCaseObservation } from '../ports/NativeEvaluationPorts.ts';
import type { WorkbenchEvaluation } from './WorkbenchEvaluation.ts';
import type { StageExecutionContext } from './WorkbenchStages.ts';
interface Module { moduleId: string; language: 'c' | 'cpp'; cardVersionIds: string[]; codeRef: ArtifactRef; interfaceRef: ArtifactRef }
export interface FixedModuleSuite { moduleId: string; suite: NativeBehaviorSuite }
const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value));
export class WorkbenchFixedEvaluation {
  readonly evaluation: WorkbenchEvaluation;
  constructor(evaluation: WorkbenchEvaluation) { this.evaluation = evaluation; }
  private async load<T>(ref: ArtifactRef): Promise<T> {
    const { artifacts } = this.evaluation.dependencies;
    if (!ref || !await artifacts.verify(ref)) throw new Error('FIXED_ARTIFACT_CORRUPT');
    return JSON.parse(Buffer.from(await artifacts.get(ref)).toString('utf8')) as T;
  }
  async start(reconstructionTaskId: string, suites: FixedModuleSuite[]) {
    return this.evaluation.dependencies.stages.start(await this.prepare(reconstructionTaskId, suites));
  }
  async prepare(reconstructionTaskId: string, suites: FixedModuleSuite[]): Promise<StageInput> {
    const { stages, projects, repository, artifacts, evaluation } = this.evaluation.dependencies;
    const parent = stages.get(reconstructionTaskId);
    if (parent.status !== 'SUCCEEDED' || parent.input.stage !== 'FLYWHEEL' || parent.input.parameters.operation !== undefined || !parent.result
      || parent.inputDigest !== sha256(canonicalJson({ contractVersion: parent.contractVersion, input: parent.input, limits: parent.limits }))) throw new Error('FIXED_RECONSTRUCTION_REQUIRED');
    const project = projects.get(String(parent.input.parameters.snapshotId));
    if (!project || project.commit !== parent.input.sourceRevision || project.sourceDigest !== parent.input.sourceDigest) throw new Error('STAGE_INPUT_CHANGED');
    const modules = parent.result.summary.modules as unknown as Module[];
    if (!Array.isArray(modules) || modules.some(module => !module || !Array.isArray(module.cardVersionIds)) || !Array.isArray(suites) || suites.some(item => !item || typeof item.moduleId !== 'string' || Object.keys(item).some(key => !['moduleId', 'suite'].includes(key)))) throw new Error('FIXED_MODULE_COVERAGE_INVALID');
    fixedModuleCoverage(modules.map(item => item.moduleId), suites.map(item => item.moduleId));
    fixedCardCoverage(parent.input.cardVersionIds, modules.flatMap(module => module.cardVersionIds));
    const suiteRefs: Record<string, ArtifactRef> = {}; const fingerprints: Record<string, ArtifactRef> = {};
    for (const module of modules) {
      if (!await artifacts.verify(module.codeRef)) throw new Error('FIXED_ARTIFACT_CORRUPT');
      for (const id of module.cardVersionIds) {
        const card = repository.getKnowledgeVersion(id);
        if (!card || !parent.input.cardVersionIds.includes(id) || card.metadata.projectSnapshotId !== project.snapshotId || card.metadata.sourceModule !== module.moduleId || card.metadata.language !== module.language || !await artifacts.verify(card.bodyRef)) throw new Error('FIXED_KNOWLEDGE_BINDING_INVALID');
      }
      const api = await this.load<Awaited<ReturnType<NativeLanguageToolchain['publicInterface']>>>(module.interfaceRef);
      const contract: NativeContract = { schemaVersion: 'native-contract-v1', language: module.language, includePath: api.sourcePath, entryPaths: [], declarations: api.declarations, targetFunctions: [] };
      contract.targetFunctions = [...nativeFunctions(contract).keys()];
      const suite = suites.find(item => item.moduleId === module.moduleId)!.suite; assertNativeBehaviorSuite(suite, contract);
      Object.defineProperty(suiteRefs, module.moduleId, { value: await artifacts.put(Buffer.from(canonicalJson(suite)), 'application/json'), enumerable: true });
      if (!fingerprints[module.language]) fingerprints[module.language] = await artifacts.put(Buffer.from(JSON.stringify(await evaluation.dependencies.snapshot(module.language, project.build))), 'application/json');
    }
    return { ...parent.input, stage: 'EVALUATE', parameters: { ...parent.input.parameters,
      operation: 'FIXED_NATIVE_EVALUATION', fixedEvaluationContract: FIXED_EVALUATION_CONTRACT, reconstructionTaskId,
      reconstructionDigest: sha256(canonicalJson(parent.result)), suiteRefs: json(suiteRefs), fingerprints: json(fingerprints) } };
  }
  async evaluate(context: StageExecutionContext) {
    const { stages, projects, repository, artifacts, native, evaluation } = this.evaluation.dependencies;
    const p = context.task.input.parameters; const parent = stages.get(String(p.reconstructionTaskId));
    if (p.operation !== 'FIXED_NATIVE_EVALUATION' || p.fixedEvaluationContract !== FIXED_EVALUATION_CONTRACT) throw new Error('STAGE_CONTRACT_INCOMPATIBLE');
    if (parent.status !== 'SUCCEEDED' || !parent.result || sha256(canonicalJson(parent.result)) !== p.reconstructionDigest
      || parent.input.parameters.snapshotId !== p.snapshotId || parent.input.projectId !== context.task.input.projectId || parent.input.configurationDigest !== context.task.input.configurationDigest
      || parent.input.sourceDigest !== context.task.input.sourceDigest || parent.input.sourceRevision !== context.task.input.sourceRevision
      || canonicalJson(parent.input.cardVersionIds) !== canonicalJson(context.task.input.cardVersionIds)) throw new Error('STAGE_INPUT_CHANGED');
    const project = projects.get(String(p.snapshotId));
    if (!project || project.commit !== context.task.input.sourceRevision || project.sourceDigest !== context.task.input.sourceDigest) throw new Error('STAGE_INPUT_CHANGED');
    const modules = parent.result.summary.modules as unknown as Module[];
    const suiteRefs = p.suiteRefs as unknown as Record<string, ArtifactRef>;
    fixedModuleCoverage(modules.map(module => module.moduleId), Object.keys(suiteRefs));
    fixedCardCoverage(context.task.input.cardVersionIds, modules.flatMap(module => module.cardVersionIds));
    const reportRefs: ArtifactRef[] = []; const reports: JsonValue[] = [];
    for (const module of modules) {
      const selected = project.modules.find(item => item.moduleId === module.moduleId && item.language === module.language);
      if (!selected || module.cardVersionIds.some(id => !context.task.input.cardVersionIds.includes(id))) throw new Error('STAGE_INPUT_CHANGED');
      const cards: Array<{ cardId: string; versionId: string; bodyRef: ArtifactRef }> = [];
      for (const id of module.cardVersionIds) {
        const card = repository.getKnowledgeVersion(id);
        if (!card || typeof card.metadata.cardId !== 'string' || !card.metadata.cardId || card.metadata.projectSnapshotId !== project.snapshotId || card.metadata.sourceModule !== module.moduleId || card.metadata.language !== module.language || !await artifacts.verify(card.bodyRef)) throw new Error('FIXED_KNOWLEDGE_BINDING_INVALID');
        cards.push({ cardId: card.metadata.cardId, versionId: id, bodyRef: card.bodyRef });
      }
      const fingerprintRef = (p.fingerprints as unknown as Record<string, ArtifactRef>)[module.language]!;
      const fingerprint = await this.load<{ digest: string }>(fingerprintRef);
      if ((await evaluation.dependencies.snapshot(module.language, project.build, context.signal)).digest !== fingerprint.digest) throw new Error('NATIVE_TEST_TOOLCHAIN_CHANGED');
      const completed = await context.step(`fixed-module:${module.moduleId}`, async () => {
        const api = await this.load<Awaited<ReturnType<NativeLanguageToolchain['publicInterface']>>>(module.interfaceRef);
        const contract: NativeContract = { schemaVersion: 'native-contract-v1', language: module.language, includePath: api.sourcePath,
          entryPaths: selected.sourcePaths.filter(path => /\.(c|cc|cpp|cxx)$/.test(path) && path !== api.sourcePath), declarations: api.declarations, targetFunctions: [] };
        contract.targetFunctions = [...nativeFunctions(contract).keys()];
        const suiteRef = suiteRefs[module.moduleId]!; const suite = await this.load<NativeBehaviorSuite>(suiteRef); assertNativeBehaviorSuite(suite, contract);
        const files: ToolchainFile[] = [];
        for (const source of project.sourceFiles.filter(item => item.kind === 'source')) {
          if (!await artifacts.verify(source.ref)) throw new Error('FIXED_ARTIFACT_CORRUPT');
          files.push({ path: source.path, content: Buffer.from(await artifacts.get(source.ref)).toString('utf8') });
        }
        const referenceInterface = await context.step(`fixed-reference-interface:${module.moduleId}`, async () => {
          const projected = await native.publicInterface({ language: module.language, build: project.build, files, entryPath: api.sourcePath,
            symbols: api.declarations.map(item => item.name), ...(api.astFilter ? { astFilter: api.astFilter } : {}) }, context.signal);
          const ref = await artifacts.put(Buffer.from(JSON.stringify(projected)), 'application/json');
          return { artifactRefs: [ref], summary: { compatible: compareNativeInterfaces(api.declarations, projected.declarations).compatible } };
        });
        if (!referenceInterface.summary.compatible) throw new Error('FIXED_REFERENCE_INTERFACE_CHANGED');
        const refs: ArtifactRef[] = [suiteRef, fingerprintRef, module.codeRef, module.interfaceRef, project.manifestRef, ...referenceInterface.artifactRefs];
        const run = async (phase: 'reference' | 'generated', input: NativeToolchainInput, executionContract: NativeContract) => {
          const observations: NativeCaseObservation[] = [];
          for (const test of suite.cases) {
            const result = await context.step(`fixed-case:${module.moduleId}:${phase}:${test.caseId}`, async () => {
              const observed = await evaluation.dependencies.runner.execute(input, executionContract, test, context.signal);
              const ref = await artifacts.put(Buffer.from(JSON.stringify(observed)), 'application/json');
              return { artifactRefs: [ref], summary: { phase, caseId: test.caseId, status: observed.status } };
            });
            refs.push(...result.artifactRefs); observations.push(await this.load<NativeCaseObservation>(result.artifactRefs[0]!));
            context.progress({ phase: `fixed-${phase}`, moduleId: module.moduleId, caseId: test.caseId, completed: observations.length, total: suite.cases.length });
          }
          return observations;
        };
        const reference = await run('reference', { language: module.language, build: project.build, files }, contract);
        const referencePassed = fixedNativePassed(suite, reference); let generated: NativeCaseObservation[] = []; let compatible = false;
        if (referencePassed) {
          const code = await this.load<{ files: ToolchainFile[] }>(module.codeRef);
          const input = { language: module.language, build: project.build, files: code.files };
          const projected = await native.publicInterface({ ...input, entryPath: api.sourcePath, symbols: api.declarations.map(item => item.name), ...(api.astFilter ? { astFilter: api.astFilter } : {}) }, context.signal);
          compatible = compareNativeInterfaces(api.declarations, projected.declarations).compatible;
          if (compatible) generated = await run('generated', input, { ...contract, entryPaths: code.files.filter(file => file.path !== contract.includePath && /\.(c|cc|cpp|cxx)$/.test(file.path)).map(file => file.path) });
        }
        if ((await evaluation.dependencies.snapshot(module.language, project.build, context.signal)).digest !== fingerprint.digest) throw new Error('NATIVE_TEST_TOOLCHAIN_CHANGED');
        const status = !referencePassed ? 'REFERENCE_REJECTED' : !compatible ? 'INTERFACE_MISMATCH' : fixedNativePassed(suite, generated) ? 'FIXED_PASSED' : 'FIXED_FAILED';
        const report = { schemaVersion: FIXED_EVALUATION_CONTRACT, moduleId: module.moduleId, reconstructionTaskId: parent.taskId,
          snapshotId: project.snapshotId, sourceDigest: project.sourceDigest, manifestRef: project.manifestRef, cards, cardVersionIds: module.cardVersionIds,
          codeRef: module.codeRef, suiteRef, fingerprintRef, reference, generated, status, publicationVerified: false };
        const reportRef = await artifacts.put(Buffer.from(JSON.stringify(report)), 'application/json');
        return { artifactRefs: [...refs, reportRef], summary: { moduleId: module.moduleId, status, reportRef: json(reportRef),
          passed: suite.cases.filter(test => { const item = generated.find(observation => observation.caseId === test.caseId); return item && fixedNativePassed({ schemaVersion: 'native-cases-v1', cases: [test] }, [item]); }).length, total: suite.cases.length, referencePassed, interfaceCompatible: compatible } };
      });
      reports.push(completed.summary); reportRefs.push(completed.summary.reportRef as unknown as ArtifactRef);
    }
    return { artifactRefs: reportRefs, summary: { reconstructionTaskId: parent.taskId, snapshotId: project.snapshotId,
      modules: reports, publicationVerified: false } };
  }
}
