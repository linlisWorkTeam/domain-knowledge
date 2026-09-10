/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：从固定卡片与公开接口启动隔离重建，保存代码和接口比较证据。
 */
import type { AgentCommand, AgentResult } from '../../domain/agents/AgentContracts.ts';
import { sha256, type ArtifactRef, type KnowledgeVersion } from '../../domain/Domain.ts';
import { canonicalJson, type JsonValue } from '../../domain/services/workbench/StageTask.ts';
import { compareNativeSources, SOURCE_COMPARISON_CONTRACT } from '../../domain/services/evaluation/NativeSourceComparison.ts';
import { nativeCodeReuseKey } from '../../domain/services/evaluation/NativeCodeReuse.ts';
import { canRepairNativeCode } from '../../domain/services/evaluation/NativeCodeRepair.ts';
import { compareNativeInterfaces } from '../../domain/services/evaluation/NativeInterfaceComparison.ts';
import type { ArtifactStore, FlywheelRepository } from '../ports/ApplicationPorts.ts';
import type { WorkbenchProjectStore } from '../ports/WorkbenchProjectPorts.ts';
import type { NativeLanguageToolchain, ToolchainFile } from '../ports/LanguageToolchainPorts.ts';
import type { NativeSnapshotter } from '../ports/NativeEvaluationPorts.ts';
import type { StageConfigurationProvider, StageModelConfiguration } from '../ports/WorkbenchGenerationPorts.ts';
import type { WorkbenchStages, StageExecutionContext } from './WorkbenchStages.ts';
import type { WorkbenchRoleExecution } from './WorkbenchRoleExecution.ts';
type PublicInterface = Awaited<ReturnType<NativeLanguageToolchain['publicInterface']>>;
const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value));
export class WorkbenchReconstruction {
  readonly dependencies: { projects: WorkbenchProjectStore; repository: FlywheelRepository; artifacts: ArtifactStore;
    native: NativeLanguageToolchain; snapshot: NativeSnapshotter; configuration: StageConfigurationProvider;
    stages: WorkbenchStages; roles: WorkbenchRoleExecution };
  constructor(dependencies: WorkbenchReconstruction['dependencies']) { this.dependencies = dependencies; }
  async artifact(taskId: string, digest: string) {
    const { stages, artifacts } = this.dependencies;
    const task = stages.get(taskId);
    const refs = [...(task.result?.artifactRefs ?? []), ...stages.store.checkpoints(taskId).flatMap((item) => item.result.artifactRefs)];
    const ref = refs.find((item) => item.sha256 === digest);
    if (!ref) return null;
    if (!await artifacts.verify(ref)) throw new Error('STAGE_ARTIFACT_CORRUPT');
    return { ref, bytes: await artifacts.get(ref) };
  }
  private async load(ref: ArtifactRef) {
    if (!ref || !await this.dependencies.artifacts.verify(ref)) throw new Error('STAGE_ARTIFACT_CORRUPT');
    return Buffer.from(await this.dependencies.artifacts.get(ref)).toString('utf8');
  }
  private selection(snapshotId: string, versionIds: string[]) {
    const project = this.dependencies.projects.get(snapshotId);
    if (!project) throw new Error('PROJECT_INPUT_NOT_FOUND');
    if (!Array.isArray(versionIds) || !versionIds.length || versionIds.length > 200 || new Set(versionIds).size !== versionIds.length) throw new Error('RECONSTRUCTION_SELECTION_INVALID');
    const versions = versionIds.map((id) => this.dependencies.repository.getKnowledgeVersion(id));
    if (versions.some((version) => !version || version.metadata.projectSnapshotId !== snapshotId
      || typeof version.metadata.cardId !== 'string' || !version.metadata.interfaceRef
      || !project.modules.some((module) => module.moduleId === version.metadata.sourceModule && module.language === version.metadata.language && ['c', 'cpp'].includes(module.language)))) throw new Error('RECONSTRUCTION_SELECTION_INVALID');
    if (new Set(versions.map((version) => version!.metadata.cardId)).size !== versions.length) throw new Error('RECONSTRUCTION_SELECTION_INVALID');
    return { project, versions: versions as KnowledgeVersion[] };
  }
  private selectionDigest(versions: KnowledgeVersion[]) {
    return sha256(canonicalJson(versions.map((version) => ({ versionId: version.versionId, bodyRef: version.bodyRef,
      cardId: version.metadata.cardId, module: version.metadata.sourceModule, language: version.metadata.language,
      interfaceRef: version.metadata.interfaceRef })).sort((a, b) => a.versionId.localeCompare(b.versionId))));
  }
  async start(snapshotId: string, versionIds: string[], options: { retryEvaluationTaskId?: string } = {}) {
    return this.dependencies.stages.start(await this.prepare(snapshotId, versionIds, options));
  }
  async prepare(snapshotId: string, versionIds: string[], options: { configurationDigest?: string; signal?: AbortSignal; retryEvaluationTaskId?: string } = {}): Promise<import('../../domain/services/workbench/StageTask.ts').StageInput> {
    const { project, versions } = this.selection(snapshotId, versionIds);
    const { artifacts, configuration, snapshot, stages } = this.dependencies;
    const frozen = await configuration.captureStage();
    const configurationRef = await artifacts.put(Buffer.from(canonicalJson(frozen)), 'application/json');
    if (options.configurationDigest && configurationRef.sha256 !== options.configurationDigest) throw new Error('RUN_CONFIGURATION_INCOMPATIBLE');
    let retry: JsonValue = null;
    if (options.retryEvaluationTaskId) {
      const previous = stages.get(options.retryEvaluationTaskId);
      const modules = previous.result?.summary.modules as unknown as Array<{ status?: string }> | undefined;
      if (previous.input.stage !== 'EVALUATE' || previous.status !== 'SUCCEEDED' || !modules?.some(item => item.status === 'BEHAVIOR_FAILED')
        || previous.input.projectId !== project.projectId || previous.input.sourceDigest !== project.sourceDigest || previous.input.sourceRevision !== project.commit
        || previous.input.parameters.snapshotId !== snapshotId || previous.input.configurationDigest !== configurationRef.sha256) throw new Error('RECONSTRUCTION_RETRY_INVALID');
      const oldCards = previous.input.cardVersionIds.map(id => this.dependencies.repository.getKnowledgeVersion(id)?.metadata.cardId).sort();
      if (canonicalJson(oldCards) !== canonicalJson(versions.map(card => card.metadata.cardId).sort())) throw new Error('RECONSTRUCTION_RETRY_INVALID');
      retry = { contract: 'native-reconstruction-retry-v1', evaluationTaskId: previous.taskId, inputDigest: previous.inputDigest, resultDigest: sha256(canonicalJson(previous.result!)) };
    }
    const fingerprints: Record<string, ArtifactRef> = {};
    for (const language of new Set(versions.map((version) => String(version.metadata.language)))) {
      if (language !== 'c' && language !== 'cpp') throw new Error('RECONSTRUCTION_LANGUAGE_UNSUPPORTED');
      fingerprints[language] = await artifacts.put(Buffer.from(JSON.stringify(await snapshot(language, project.build, options.signal))), 'application/json');
    }
    return { projectId: project.projectId, stage: 'FLYWHEEL', sourceRevision: project.commit, sourceDigest: project.sourceDigest,
      cardVersionIds: [...versionIds].sort(), configurationDigest: configurationRef.sha256,
      parameters: { ...(retry ? { retry } : {}), comparisonContract: SOURCE_COMPARISON_CONTRACT, snapshotId, selectionDigest: this.selectionDigest(versions), configurationRef: json(configurationRef), fingerprints: json(fingerprints) } };
  }
  async reconstruct(context: StageExecutionContext) {
    const { artifacts, configuration, native, snapshot, roles, stages } = this.dependencies;
    if (context.task.input.parameters.comparisonContract !== SOURCE_COMPARISON_CONTRACT) throw new Error('STAGE_CONTRACT_INCOMPATIBLE');
    const retry = context.task.input.parameters.retry as { contract: string; evaluationTaskId: string; inputDigest: string; resultDigest: string } | undefined;
    if (retry) {
      const previous = stages.get(retry.evaluationTaskId);
      if (retry.contract !== 'native-reconstruction-retry-v1' || previous.input.stage !== 'EVALUATE' || previous.status !== 'SUCCEEDED'
        || previous.input.projectId !== context.task.input.projectId || previous.input.sourceDigest !== context.task.input.sourceDigest || previous.input.configurationDigest !== context.task.input.configurationDigest
        || previous.inputDigest !== retry.inputDigest || sha256(canonicalJson(previous.result!)) !== retry.resultDigest) throw new Error('RECONSTRUCTION_RETRY_INVALID');
    }
    const reuseKey = nativeCodeReuseKey(context.task.input);
    const cacheCandidate = stages.store.list().find((task) => task.taskId !== context.task.taskId && task.status === 'SUCCEEDED' && task.result && Array.isArray(task.result.summary.modules) && (task.result.summary.modules as Array<{ interfaceComparison?: { compatible?: boolean }; codeRef?: unknown; roleResultRef?: unknown }>).every((item) => item.interfaceComparison?.compatible && item.codeRef && item.roleResultRef) && reuseKey !== null && nativeCodeReuseKey(task.input) === reuseKey);
    const { project, versions } = this.selection(String(context.task.input.parameters.snapshotId), context.task.input.cardVersionIds);
    if (this.selectionDigest(versions) !== context.task.input.parameters.selectionDigest || project.sourceDigest !== context.task.input.sourceDigest || project.commit !== context.task.input.sourceRevision) throw new Error('STAGE_INPUT_CHANGED');
    const configurationRef = context.task.input.parameters.configurationRef as unknown as ArtifactRef;
    if (configurationRef.sha256 !== context.task.input.configurationDigest) throw new Error('STAGE_INPUT_CHANGED');
    const frozen = JSON.parse(await this.load(configurationRef)) as StageModelConfiguration;
    await configuration.assertStageCompatible(frozen);
    const cacheSelection = await context.step('code-cache-selection', async () => ({ artifactRefs: [], summary: { sourceTaskId: cacheCandidate?.taskId ?? null } }));
    const reusable = cacheSelection.summary.sourceTaskId ? stages.get(String(cacheSelection.summary.sourceTaskId)) : undefined;
    if (reusable && (reusable.status !== 'SUCCEEDED' || nativeCodeReuseKey(reusable.input) !== reuseKey)) throw new Error('STAGE_ARTIFACT_CORRUPT');
    const fingerprints = context.task.input.parameters.fingerprints as unknown as Record<string, ArtifactRef>;
    const results: JsonValue[] = []; const artifactRefs: ArtifactRef[] = [];
    for (const module of project.modules.filter((module) => versions.some((version) => version.metadata.sourceModule === module.moduleId))) {
      const language = module.language as 'c' | 'cpp';
      const fingerprint = JSON.parse(await this.load(fingerprints[language]!)) as { digest: string };
      if ((await snapshot(language, project.build, context.signal)).digest !== fingerprint.digest) throw new Error('NATIVE_TEST_TOOLCHAIN_CHANGED');
      const cards = versions.filter((version) => version.metadata.sourceModule === module.moduleId);
      const interfaceRefs = [...new Map(cards.map((card) => { const ref = card.metadata.interfaceRef as ArtifactRef; return [ref.artifactId, ref] as const; })).values()];
      if (interfaceRefs.length !== 1) throw new Error('RECONSTRUCTION_INTERFACE_CONFLICT');
      const api = JSON.parse(await this.load(interfaceRefs[0]!)) as PublicInterface;
      if (api.schemaVersion !== 'native-interface-v1' || api.language !== language || !module.sourcePaths.includes(api.sourcePath)) throw new Error('RECONSTRUCTION_INTERFACE_INVALID');
      const rejectionPrefix = `code-rejection:${module.moduleId}:`;
      // 旧版已保存的生成编译诊断可转为拒绝检查点，不重写原审计或代码。
      if (!stages.store.checkpoints(context.task.taskId).some((item) => item.key.startsWith(rejectionPrefix))) {
        const priorCode = stages.store.checkpoints(context.task.taskId).find((item) => item.key === `role:code:${module.moduleId}`);
        const priorFailure = [...stages.store.events(context.task.taskId)].reverse().find((event) => {
          const value = event.detail; return value && !Array.isArray(value) && typeof value === 'object'
            && value.phase === 'generated-interface-failed' && value.module === module.moduleId && value.diagnosticRef;
        });
        if (priorCode && priorFailure) {
          const diagnosticRef = (priorFailure.detail as { diagnosticRef: unknown }).diagnosticRef as ArtifactRef;
          const diagnostic = JSON.parse(await this.load(diagnosticRef));
          if (canRepairNativeCode('NATIVE_INTERFACE_COMPILE_FAILED', diagnostic)) await context.step(`${rejectionPrefix}0`, async () => ({
            artifactRefs: [priorCode.result.artifactRefs[1]!, diagnosticRef], summary: { moduleId: module.moduleId, repairable: true, reasonCode: 'NATIVE_INTERFACE_COMPILE_FAILED' },
          }));
        }
      }
      const rejections = stages.store.checkpoints(context.task.taskId).filter((item) => item.key.startsWith(rejectionPrefix))
        .sort((a, b) => Number(a.key.slice(rejectionPrefix.length)) - Number(b.key.slice(rejectionPrefix.length)));
      const revision = rejections.length;
      const latest = rejections.at(-1);
      const previousGeneratedAttempt = latest ? { files: JSON.parse(await this.load(latest.result.artifactRefs[0]!)).files,
        diagnostic: JSON.parse(await this.load(latest.result.artifactRefs[1]!)), knowledgeErrorProven: false } : null;
      // Code只获取知识、公开接口、构建约束及自身上次生成代码的编译诊断，不读参考源码或测试预期。
      const knowledge = [];
      for (const card of cards) knowledge.push({ cardId: card.metadata.cardId, versionId: card.versionId, body: await this.load(card.bodyRef) });
      const knowledgeRef = await artifacts.put(Buffer.from(JSON.stringify(knowledge)), 'application/json');
      const buildContract = { schemaVersion: 'native-build-v1', language, build: project.build, includePath: api.sourcePath,
        allowedGeneratedPaths: module.sourcePaths, scope: api.astFilter, behaviorVerified: false, previousGeneratedAttempt };
      const buildContractRef = await artifacts.put(Buffer.from(JSON.stringify(buildContract)), 'application/json');
      const payload = { knowledgeRef, publicInterfaceRefs: interfaceRefs, languageId: language, buildContractRef, allowedGeneratedPaths: module.sourcePaths };
      context.progress({ phase: 'reconstruction', module: module.moduleId, versions: cards.map((card) => card.versionId) });
      const cachedModule = !revision && reusable ? (reusable.result!.summary.modules as unknown as Array<{ moduleId: string; codeRef: ArtifactRef; roleResultRef: ArtifactRef }>).find((item) => item.moduleId === module.moduleId) : undefined;
      let generated: { output: Record<string, unknown>; resultRef: ArtifactRef; rawRef: ArtifactRef };
      if (cachedModule && reusable) {
        const saved = await context.step(`code-cache:${module.moduleId}`, async () => {
          const output = JSON.parse(await this.load(cachedModule.codeRef));
          const result = JSON.parse(await this.load(cachedModule.roleResultRef)) as AgentResult;
          roles.dependencies.contracts.assertResult(result);
          const command = JSON.parse(await this.load(result.commandRef)) as AgentCommand;
          roles.dependencies.contracts.assertCommand(command);
          const owner = stages.get(result.runId);
          const sourceBuild = JSON.parse(await this.load(command.payload.buildContractRef as ArtifactRef));
          const { previousGeneratedAttempt: _priorAttempt, ...sourceConstraints } = sourceBuild;
          const { previousGeneratedAttempt: _currentAttempt, ...constraints } = buildContract;
          if (result.agentType !== 'code' || result.status !== 'SUCCEEDED' || command.agentType !== 'code'
            || result.commandId !== command.commandId || result.runId !== command.runId || result.rawOutputRef?.sha256 !== cachedModule.codeRef.sha256
            || owner.status !== 'SUCCEEDED' || nativeCodeReuseKey(owner.input) !== reuseKey
            || canonicalJson(command.payload.knowledgeRef) !== canonicalJson(knowledgeRef)
            || canonicalJson(command.payload.publicInterfaceRefs) !== canonicalJson(interfaceRefs)
            || command.payload.languageId !== language || canonicalJson(command.payload.allowedGeneratedPaths) !== canonicalJson(module.sourcePaths)
            || canonicalJson(sourceConstraints) !== canonicalJson(constraints)) throw new Error('RECONSTRUCTION_CACHE_BINDING_INVALID');
          if (!Array.isArray(output.files)) throw new Error('STAGE_ARTIFACT_CORRUPT');
          context.inheritUsage(reusable.taskId);
          return { artifactRefs: [cachedModule.roleResultRef, cachedModule.codeRef], summary: { sourceTaskId: reusable.taskId } };
        });
        generated = { output: JSON.parse(await this.load(saved.artifactRefs[1]!)), resultRef: saved.artifactRefs[0]!, rawRef: saved.artifactRefs[1]! };
        context.progress({ phase: 'code-reused', module: module.moduleId, sourceTaskId: reusable.taskId });
      } else generated = await roles.execute(context, frozen, 'code', revision ? `${module.moduleId}:repair:${revision}` : module.moduleId, { payload,
        materials: [{ ref: knowledgeRef, content: knowledge }, { ref: interfaceRefs[0]!, content: api }, { ref: buildContractRef, content: buildContract }],
        sourcePaths: [], publicInterfacePaths: [], provenance: cards.map((card) => card.bodyRef), moduleId: module.moduleId });
      const files = generated.output.files as ToolchainFile[];
      if (!Array.isArray(files) || files.reduce((sum, file) => sum + Buffer.byteLength(file.content), 0) > 2_097_152) throw new Error('RECONSTRUCTION_OUTPUT_TOO_LARGE');
      const checked = await context.step(`generated-interface:${module.moduleId}${revision ? `:repair:${revision}` : ''}`, async () => {
        try {
          const projected = await native.publicInterface({ language, files, build: project.build, entryPath: api.sourcePath,
            ...(api.astFilter ? { astFilter: api.astFilter } : {}), symbols: [...new Set(api.declarations.map((item) => item.name))] }, context.signal);
          const comparison = compareNativeInterfaces(api.declarations, projected.declarations);
          const ref = await artifacts.put(Buffer.from(JSON.stringify({ ...comparison, generatedInterface: projected })), 'application/json');
          return { artifactRefs: [ref], summary: { compatible: comparison.compatible, ratio: comparison.ratio } };
        } catch (error) {
          context.signal.throwIfAborted();
          if (error instanceof Error && error.cause) {
            const ref = await artifacts.put(Buffer.from(JSON.stringify(error.cause)), 'application/json');
            const reasonCode = error.message.split(':')[0]!;
            const repairable = canRepairNativeCode(reasonCode, error.cause);
            await context.step(repairable ? `${rejectionPrefix}${revision}` : `generated-diagnostic:${module.moduleId}:${context.task.attempt}`, async () => ({
              artifactRefs: [generated.rawRef, ref], summary: { moduleId: module.moduleId, repairable, reasonCode },
            }));
            context.progress({ phase: 'generated-interface-failed', module: module.moduleId, diagnosticRef: json(ref), repairable });
          }
          throw error;
        }
      });
      if ((await snapshot(language, project.build, context.signal)).digest !== fingerprint.digest) throw new Error('NATIVE_TEST_TOOLCHAIN_CHANGED');
      const compared = await context.step(`source-comparison:${module.moduleId}${revision ? `:repair:${revision}` : ''}`, async () => {
        const reference: ToolchainFile[] = [];
        const referenceRefs: ArtifactRef[] = [];
        for (const file of project.sourceFiles.filter((item) => item.kind === 'source' && module.sourcePaths.includes(item.path))) {
          reference.push({ path: file.path, content: await this.load(file.ref) }); referenceRefs.push(file.ref);
        }
        let report;
        try { report = compareNativeSources(reference, files, api.declarations, api.astFilter); }
        catch (error) { report = { schemaVersion: SOURCE_COMPARISON_CONTRACT, available: false, requested: null, compared: 0, functions: [], unresolved: [{ reason: error instanceof Error ? error.message : 'SOURCE_COMPARISON_UNAVAILABLE' }], behaviorVerified: false, knowledgeErrorProven: false }; }
        const ref = await artifacts.put(Buffer.from(JSON.stringify({ ...report, referenceRefs, codeRef: generated.rawRef, cardVersionIds: cards.map((card) => card.versionId) })), 'application/json');
        return { artifactRefs: [ref, ...referenceRefs], summary: json(report) as { [key: string]: JsonValue } };
      });
      if (compared.summary.available === false) throw new Error('SOURCE_COMPARISON_UNAVAILABLE');
      const result = { moduleId: module.moduleId, language, cardVersionIds: cards.map((card) => card.versionId),
        sourceComparisonRef: compared.artifactRefs[0], sourceComparison: compared.summary, codeReusedFrom: cachedModule ? reusable!.taskId : null,
        codeRef: generated.rawRef, roleResultRef: generated.resultRef, interfaceRef: interfaceRefs[0], comparisonRef: checked.artifactRefs[0],
        interfaceComparison: checked.summary, behaviorVerified: false, revisions: [], unresolved: ['BEHAVIOR_EVALUATION_REQUIRED', ...(compared.summary.unresolved as unknown[]).length ? ['SOURCE_COMPARISON_UNRESOLVED'] : []] };
      results.push(json(result)); artifactRefs.push(generated.rawRef, generated.resultRef, ...checked.artifactRefs, ...compared.artifactRefs);
    }
    return { artifactRefs, summary: { snapshotId: project.snapshotId, modules: results, evaluated: false, verified: false } };
  }
}
