/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：从持久化任务和卡片准备可审计发布证据，不授予已发布状态。
 */
import { workbenchSupplementDemand } from './WorkbenchEvaluation.ts';
import { NATIVE_SUPPLEMENT_CONTRACT } from '../../domain/evaluation/NativeSupplementDemand.ts';
import { nativeSupplementTargets, readNativeSuppliedCandidates, type NativeSuppliedCandidates } from '../../domain/evaluation/NativeSupplementTargets.ts';
import { nativeTrustedGates } from '../../domain/evaluation/NativeTrustedGates.ts';
import { nativeTestPolicyDigest } from '../../domain/evaluation/NativeTestCache.ts';
import { markdownSections } from '../../domain/knowledge/KnowledgeSections.ts';
import { assertFixedPublicationObservations } from '../../domain/evaluation/NativeFixedEvaluation.ts';
import { assertNativeBehaviorSuite, nativeFunctions, type NativeContract, type NativeBehaviorSuite } from '../../domain/evaluation/NativeBehaviorSuite.ts';
import { canonicalJson } from '../../domain/workbench/StageTask.ts';
import { sha256, type ArtifactRef } from '../../domain/Domain.ts';
import { assertTrustedPublicationObservations, type TrustedPublicationReport } from '../../domain/evaluation/NativeTrustedPublication.ts';
import type { StageModelConfiguration } from '../ports/WorkbenchGenerationPorts.ts';
import type { NativeLanguageToolchain } from '../ports/LanguageToolchainPorts.ts';
import type { WorkbenchProjectStore } from '../ports/WorkbenchProjectPorts.ts';
import { buildConstraints, moduleBuild, moduleFingerprintKey } from '../../domain/workbench/WorkbenchProject.ts';
import type { NativeTestStore } from '../ports/NativeEvaluationPorts.ts';
import type { FixedNativeObservation } from '../../domain/evaluation/NativeFixedEvaluation.ts';
import { assertProjectPublication, type ProjectPublicationManifest } from '../../domain/workbench/ProjectPublication.ts';
import { assertSourceReviewHistory } from './WorkbenchSourceFindingHistory.ts';
import type { StageTaskStore } from '../ports/StageTaskPorts.ts';
import { WorkbenchSourcePublication } from './WorkbenchSourcePublication.ts';
import type { AgentContractValidator, ArtifactStore, FlywheelRepository } from '../ports/ApplicationPorts.ts';
import type { StageTask } from '../../domain/workbench/StageTask.ts';
import type { PipelineFixedSuite } from '../../domain/workbench/WorkbenchPipeline.ts';
import { publicationEvidence } from '../../domain/workbench/WorkbenchPublication.ts';
export interface PublicationTaskIds { reconstruction: string; evaluation: string; fixedEvaluation: string; sourceVerification: string }
export class WorkbenchPublicationEvidence {
  readonly dependencies: {
    stages: { get(id: string): StageTask; store: Pick<StageTaskStore, 'events'> };
    tests: Pick<NativeTestStore, 'get'>;
    projects: Pick<WorkbenchProjectStore, 'get'>;
    contracts: AgentContractValidator;
    repository: Pick<FlywheelRepository, 'getKnowledgeVersion'>;
    artifacts: Pick<ArtifactStore, 'get' | 'put' | 'verify'>;
  };
  constructor(dependencies: WorkbenchPublicationEvidence['dependencies']) { this.dependencies = dependencies; }
  async verifyResume(preparationRef: ArtifactRef): Promise<void> {
    const { artifacts, stages } = this.dependencies;
    if (!await artifacts.verify(preparationRef)) throw new Error('PUBLICATION_ARTIFACT_CORRUPT');
    const prepared = JSON.parse(Buffer.from(await artifacts.get(preparationRef)).toString('utf8')) as {
      schemaVersion: string; evidence?: { tasks?: Array<{ taskId: string; inputDigest: string; resultDigest: string }> } };
    if (prepared.schemaVersion !== 'workbench-publication-preparation-v8' || !Array.isArray(prepared.evidence?.tasks)
      || prepared.evidence.tasks.length !== 4) throw new Error('PUBLICATION_TASK_BINDING_CHANGED');
    let sourceCount = 0;
    for (const binding of prepared.evidence.tasks) {
      const task = stages.get(binding.taskId);
      if (task.inputDigest !== binding.inputDigest || sha256(canonicalJson(task.result)) !== binding.resultDigest) throw new Error('PUBLICATION_TASK_BINDING_CHANGED');
      if (task.input.parameters.operation === 'KNOWLEDGE_SOURCE_VERIFICATION') {
        sourceCount++;
        await assertSourceReviewHistory(artifacts, stages.store.events(task.taskId));
      }
    }
    if (sourceCount !== 1) throw new Error('PUBLICATION_TASK_BINDING_CHANGED');
  }
  async prepare(ids: PublicationTaskIds, fixedSuites: PipelineFixedSuite[]) {
    fixedSuites = structuredClone(fixedSuites);
    const { stages, repository, artifacts } = this.dependencies;
    const reconstruction = stages.get(ids.reconstruction); const evaluation = stages.get(ids.evaluation);
    const fixedEvaluation = stages.get(ids.fixedEvaluation); const sourceVerification = stages.get(ids.sourceVerification);
    await assertSourceReviewHistory(this.dependencies.artifacts, stages.store.events(sourceVerification.taskId));
    const project = this.dependencies.projects.get(String(reconstruction.input.parameters.snapshotId));
    if (!project || project.projectId !== reconstruction.input.projectId || project.snapshotId !== reconstruction.input.parameters.snapshotId
      || project.commit !== reconstruction.input.sourceRevision || project.sourceDigest !== reconstruction.input.sourceDigest) throw new Error('PUBLICATION_PROJECT_BINDING_CHANGED');
    const bodies: ArtifactRef[] = [];
    const sourceModules: Record<string, string> = {};
    const cards = reconstruction.input.cardVersionIds.map(id => {
      const card = repository.getKnowledgeVersion(id);
      if (!card || card.versionId !== id || card.metadata.projectSnapshotId !== reconstruction.input.parameters.snapshotId
        || typeof card.metadata.cardId !== 'string' || typeof card.metadata.sourceModule !== 'string') throw new Error('PUBLICATION_CARD_BINDING_CHANGED');
      bodies.push(card.bodyRef);
      sourceModules[id] = card.metadata.sourceModule;
      return { cardId: card.metadata.cardId, versionId: id, moduleId: card.moduleId, bodyDigest: card.bodyRef.sha256 };
    });
    const evidence = publicationEvidence({ reconstruction, evaluation, fixedEvaluation, sourceVerification, cards, sourceModules, fixedSuites });
    const trustedSets = (evaluation.result!.summary.modules as Array<Record<string, unknown>>).map(module => {
      const set = this.dependencies.tests.get(String(module.testSetId));
      if (!set || set.testSetId !== module.testSetId) throw new Error('PUBLICATION_TRUSTED_SET_MISSING');
      return structuredClone(set);
    });
    const queue: ArtifactRef[] = []; const seen = new Set<string>(); let bytes = 0;
    const collect = (value: unknown, depth = 0): void => {
      if (depth > 64) throw new Error('PUBLICATION_ARTIFACT_GRAPH_LIMIT');
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) { for (const child of value) collect(child, depth + 1); return; }
      const item = value as Record<string, unknown>;
      if ('artifactId' in item && ('sha256' in item || 'size' in item || 'mediaType' in item)) {
        if (item.artifactId !== `sha256:${item.sha256}` || !/^[a-f0-9]{64}$/.test(String(item.sha256))
          || !Number.isSafeInteger(item.size) || Number(item.size) < 0 || typeof item.mediaType !== 'string') throw new Error('PUBLICATION_ARTIFACT_REF_INVALID');
        const ref = item as unknown as ArtifactRef;
        // 大小和媒体类型也绑定，不能用同摘要的已验证项掩盖伪造引用。
        const key = JSON.stringify([ref.sha256, ref.size, ref.mediaType]);
        if (!seen.has(key)) {
          if (seen.size >= 10000) throw new Error('PUBLICATION_ARTIFACT_GRAPH_LIMIT');
          seen.add(key); queue.push(ref);
        }
        return;
      }
      for (const child of Object.values(item)) collect(child, depth + 1);
    };
    collect([reconstruction.input, reconstruction.result, evaluation.input, evaluation.result,
      fixedEvaluation.input, fixedEvaluation.result, sourceVerification.input, sourceVerification.result, bodies, fixedSuites, trustedSets, project.manifestRef, project.sourceFiles]);
    for (let index = 0; index < queue.length; index++) {
      const ref = queue[index]!;
      bytes += ref.size;
      if (bytes > 128 * 1024 * 1024) throw new Error('PUBLICATION_ARTIFACT_GRAPH_LIMIT');
      if (!await artifacts.verify(ref)) throw new Error('PUBLICATION_ARTIFACT_CORRUPT');
      if (ref.mediaType === 'application/json') collect(JSON.parse(Buffer.from(await artifacts.get(ref)).toString('utf8')));
    }
    const load = async <T>(ref: ArtifactRef): Promise<T> => {
      if (!ref || !await artifacts.verify(ref)) throw new Error('PUBLICATION_ARTIFACT_CORRUPT');
      return JSON.parse(Buffer.from(await artifacts.get(ref)).toString('utf8')) as T;
    };
    assertProjectPublication(project, await load<ProjectPublicationManifest>(project.manifestRef));
    const configurationRef = reconstruction.input.parameters.configurationRef as unknown as ArtifactRef;
    if (!configurationRef || configurationRef.sha256 !== reconstruction.input.configurationDigest) throw new Error('PUBLICATION_CONFIGURATION_CHANGED');
    const frozen = await load<StageModelConfiguration>(configurationRef);
    const testPrompt = frozen.agents.find(agent => agent.agentId === 'test-gen');
    if (!testPrompt) throw new Error('PUBLICATION_TEST_POLICY_MISSING');
    const policyDigest = sha256(canonicalJson({ schemaVersion: 'native-test-policy-v1', prompt: testPrompt.effectivePromptSha256,
      roleExecutionVersion: frozen.roleExecutionVersion, contracts: frozen.contracts, provider: frozen.provider }));
    const nativeContracts = new Map<string, NativeContract>();
    for (const module of reconstruction.result!.summary.modules as Array<Record<string, unknown>>) {
      const selected = project.modules.find(item => item.moduleId === module.moduleId);
      if (!selected || selected.language !== module.language || !['c', 'cpp'].includes(selected.language)) throw new Error('PUBLICATION_INTERFACE_BINDING_CHANGED');
      const api = await load<Awaited<ReturnType<NativeLanguageToolchain['publicInterface']>>>(module.interfaceRef as ArtifactRef);
      const contract: NativeContract = { schemaVersion: 'native-contract-v1', language: selected.language as 'c' | 'cpp', includePath: api.sourcePath,
        entryPaths: selected.sourcePaths.filter(path => /\.(c|cc|cpp|cxx)$/.test(path) && path !== api.sourcePath), declarations: api.declarations, targetFunctions: [] };
      contract.targetFunctions = [...nativeFunctions(contract).keys()];
      nativeContracts.set(String(module.moduleId), contract);
    }
    const parameters = evaluation.input.parameters;
    if (parameters.supplementContract !== undefined && parameters.supplementContract !== NATIVE_SUPPLEMENT_CONTRACT) throw new Error('PUBLICATION_TEST_POLICY_CHANGED');
    const supplement = parameters.supplementContract ? await workbenchSupplementDemand(this.dependencies, String(parameters.sourceVerificationTaskId), reconstruction.taskId) : null;
    if (supplement && canonicalJson(await load(parameters.supplementRef as unknown as ArtifactRef)) !== canonicalJson(supplement)) throw new Error('PUBLICATION_TEST_POLICY_CHANGED');
    if (parameters.supplementTargets !== undefined && (!supplement || canonicalJson(parameters.supplementTargets) !== canonicalJson(nativeSupplementTargets(supplement.demands.map(item => item.sectionId))))) throw new Error('PUBLICATION_TEST_POLICY_CHANGED');
    const suppliedRef = parameters.suppliedCandidatesRef as unknown as ArtifactRef | undefined;
    let supplied: NativeSuppliedCandidates | null = null;
    if (suppliedRef) {
      if (!supplement || !evaluation.result!.artifactRefs.some(ref => canonicalJson(ref) === canonicalJson(suppliedRef))) throw new Error('PUBLICATION_TEST_POLICY_CHANGED');
      const modules = [];
      for (const [moduleId, contract] of nativeContracts) {
        const selected = cards.filter(card => sourceModules[card.versionId] === moduleId);
        if (!selected.some(card => supplement.demands.some(demand => demand.versionId === card.versionId))) continue;
        const sectionIds: string[] = [];
        for (const card of selected) {
          const index = cards.indexOf(card);
          const body = Buffer.from(await artifacts.get(bodies[index]!)).toString('utf8');
          sectionIds.push(...markdownSections(body).map(section => `${card.cardId}#${section.heading}`));
        }
        modules.push({ moduleId, contract, sectionIds });
      }
      supplied = readNativeSuppliedCandidates(await load(suppliedRef), modules);
    }
    for (const module of fixedEvaluation.result!.summary.modules as Array<Record<string, unknown>>) {
      const reportRef = module.reportRef as ArtifactRef;
      if (!fixedEvaluation.result!.artifactRefs.some(ref => ref.sha256 === reportRef?.sha256)) throw new Error('PUBLICATION_FIXED_REPORT_UNBOUND');
      const report = await load<Parameters<typeof assertFixedPublicationObservations>[1] & {
        moduleId: string; reconstructionTaskId: string; snapshotId: string; sourceDigest: string; suiteRef: ArtifactRef;
        manifestRef: ArtifactRef; codeRef: ArtifactRef; fingerprintRef: ArtifactRef; cardVersionIds: string[]; cards: Array<{ cardId: string; versionId: string; bodyRef: ArtifactRef }>;
      }>(reportRef);
      const suiteRef = fixedSuites.find(item => item.moduleId === module.moduleId)!.suiteRef;
      if (report.moduleId !== module.moduleId || report.reconstructionTaskId !== reconstruction.taskId
        || report.snapshotId !== reconstruction.input.parameters.snapshotId || report.sourceDigest !== reconstruction.input.sourceDigest
        || canonicalJson(report.suiteRef) !== canonicalJson(suiteRef) || canonicalJson(report.manifestRef) !== canonicalJson(project.manifestRef)) throw new Error('PUBLICATION_FIXED_REPORT_BINDING_CHANGED');
      const codeModule = (reconstruction.result!.summary.modules as Array<Record<string, unknown>>).find(item => item.moduleId === module.moduleId);
      const fingerprints = fixedEvaluation.input.parameters.fingerprints as Record<string, unknown>;
      const selectedCards = cards.filter(card => sourceModules[card.versionId] === module.moduleId);
      const expectedCards = selectedCards.map(card => ({ cardId: card.cardId, versionId: card.versionId,
        bodyRef: bodies[reconstruction.input.cardVersionIds.indexOf(card.versionId)]! })).sort((a, b) => a.versionId.localeCompare(b.versionId));
      if (!codeModule || !fingerprints || !Array.isArray(report.cards) || !Array.isArray(report.cardVersionIds)
        || canonicalJson(report.codeRef) !== canonicalJson(codeModule.codeRef)
        || canonicalJson(report.fingerprintRef) !== canonicalJson(fingerprints[moduleFingerprintKey(project, String(module.moduleId), String(codeModule.language))])
        || canonicalJson([...report.cardVersionIds].sort()) !== canonicalJson(selectedCards.map(card => card.versionId).sort())
        || canonicalJson([...report.cards].sort((a, b) => a.versionId.localeCompare(b.versionId))) !== canonicalJson(expectedCards)) throw new Error('PUBLICATION_FIXED_IMPLEMENTATION_CHANGED');
      const suite = await load<NativeBehaviorSuite>(suiteRef);
      assertNativeBehaviorSuite(suite, nativeContracts.get(String(module.moduleId))!);
      assertFixedPublicationObservations(suite, report, Number(module.total));
    }
    for (const module of evaluation.result!.summary.modules as Array<Record<string, unknown>>) {
      const set = trustedSets.find(item => item.testSetId === module.testSetId)!;
      const reportRef = module.reportRef as ArtifactRef;
      if (!evaluation.result!.artifactRefs.some(ref => ref.sha256 === reportRef?.sha256)) throw new Error('PUBLICATION_TRUSTED_REPORT_UNBOUND');
      const codeModule = (reconstruction.result!.summary.modules as Array<Record<string, unknown>>).find(item => item.moduleId === module.moduleId)!;
      const expected = cards.filter(card => sourceModules[card.versionId] === module.moduleId).map(card => ({ cardId: card.cardId, bodyDigest: card.bodyDigest })).sort((a, b) => a.cardId.localeCompare(b.cardId));
      const bound = set.binding.cardIds.map((cardId, index) => ({ cardId, bodyDigest: set.binding.knowledgeBodyDigests[index] })).sort((a, b) => a.cardId.localeCompare(b.cardId));
      const fingerprintRef = (fixedEvaluation.input.parameters.fingerprints as Record<string, unknown>)[moduleFingerprintKey(project, String(module.moduleId), String(codeModule.language))] as ArtifactRef;
      const fingerprint = await load<{ digest: string }>(fingerprintRef);
      if (set.projectSnapshotId !== reconstruction.input.parameters.snapshotId || set.sourceRevision !== reconstruction.input.sourceRevision
        || canonicalJson(bound) !== canonicalJson(expected) || set.binding.toolchainDigest !== fingerprint.digest
        || canonicalJson(set.fingerprintRef) !== canonicalJson(fingerprintRef)) throw new Error('PUBLICATION_TRUSTED_BINDING_CHANGED');
      const report = await load<TrustedPublicationReport & { generatedRef: ArtifactRef; generatedDigest: string }>(reportRef);
      if (report.total !== module.total || report.passed !== module.passed) throw new Error('PUBLICATION_TRUSTED_REPORT_BINDING_CHANGED');
      const reference = await load<{ language: string; build: unknown; sanitizers: boolean; files: Array<{ path: string; ref: ArtifactRef }> }>(set.referenceRef);
      const generated = await load<{ language: string; build: unknown; sanitizers: boolean; files: Array<{ path: string; ref: ArtifactRef }> }>(report.generatedRef);
      const code = await load<{ files: Array<{ path: string; content: string }> }>(codeModule.codeRef as ArtifactRef);
      if (sha256(JSON.stringify(reference)) !== set.binding.referenceDigest || sha256(JSON.stringify(generated)) !== report.generatedDigest
        || generated.language !== codeModule.language || !Array.isArray(generated.files) || !Array.isArray(code.files)
        || canonicalJson(generated.files.map(file => ({ path: file.path, sha256: file.ref.sha256 })).sort((a, b) => a.path.localeCompare(b.path)))
          !== canonicalJson(code.files.map(file => ({ path: file.path, sha256: sha256(Buffer.from(file.content)) })).sort((a, b) => a.path.localeCompare(b.path)))) throw new Error('PUBLICATION_TRUSTED_IMPLEMENTATION_CHANGED');
      const sourceFiles = project.sourceFiles.filter(file => file.kind === 'source');
      const fileDigests = (files: Array<{ path: string; ref: ArtifactRef }>) => files.map(file => ({ path: file.path, sha256: file.ref.sha256 })).sort((a, b) => a.path.localeCompare(b.path));
      if (reference.language !== codeModule.language || reference.sanitizers !== true || generated.sanitizers !== true
        || canonicalJson(buildConstraints(reference.build)) !== canonicalJson(moduleBuild(project, String(module.moduleId)))
        || canonicalJson(buildConstraints(generated.build)) !== canonicalJson(moduleBuild(project, String(module.moduleId)))
        || !Array.isArray(reference.files) || canonicalJson(fileDigests(reference.files)) !== canonicalJson(fileDigests(sourceFiles))) throw new Error('PUBLICATION_PROJECT_IMPLEMENTATION_CHANGED');
      const contract = nativeContracts.get(String(module.moduleId))!;
      const demands = supplement?.demands.filter(item => sourceModules[item.versionId] === module.moduleId) ?? [];
      const expectedPolicyDigest = nativeTestPolicyDigest(policyDigest, demands.length ? {
        schemaVersion: 'native-supplement-v1', demandDigest: suppliedRef ? sha256(canonicalJson({ demandDigest: supplement!.demandDigest, suppliedCandidatesDigest: suppliedRef.sha256 })) : supplement!.demandDigest,
        ...(parameters.supplementTargets !== undefined ? { targets: nativeSupplementTargets(demands.map(item => item.sectionId)) } : {}),
      } : undefined);
      if (set.binding.interfaceDigest !== sha256(canonicalJson(contract)) || set.binding.policyDigest !== expectedPolicyDigest) throw new Error('PUBLICATION_TEST_POLICY_CHANGED');
      const suite = await load<NativeBehaviorSuite>(set.suiteRef); assertNativeBehaviorSuite(suite, contract);
      const candidate = supplied?.modules.find(item => item.moduleId === module.moduleId)?.suite;
      if (candidate && nativeTrustedGates([suite, candidate]).digest !== nativeTrustedGates([suite]).digest) throw new Error('PUBLICATION_SUPPLIED_CANDIDATES_MISSING');
      assertTrustedPublicationObservations(set, suite, await load<FixedNativeObservation[]>(set.oracleRef), report);
    }
    await new WorkbenchSourcePublication({ artifacts, contracts: this.dependencies.contracts }).verify(sourceVerification, cards.map((card, index) => ({ ...card, bodyRef: bodies[index]! })), project, sourceModules, (evaluation.result!.summary.modules as Array<Record<string, unknown>>).map(module => ({ moduleId: String(module.moduleId), set: trustedSets.find(set => set.testSetId === module.testSetId)! })));
    const prepared = { schemaVersion: 'workbench-publication-preparation-v8', state: 'PREPARED', evidence, trustedSets, projectSnapshot: project,
      verifiedArtifactRefs: queue.sort((a, b) => a.sha256.localeCompare(b.sha256)), publicationVerified: false };
    const artifactRef = await artifacts.put(Buffer.from(JSON.stringify(prepared)), 'application/json');
    return { ...prepared, artifactRef };
  }
}
