/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：交接原生候选、参考验证及生成评测，持久化不可变可信测试集。
 */
import { sha256, type ArtifactRef } from '../../domain/Domain.ts';
import { canonicalJson } from '../../domain/services/workbench/StageTask.ts';
import { buildConstraints } from '../../domain/services/workbench/WorkbenchProject.ts';
import { markdownSections } from '../../domain/services/knowledge/KnowledgeSections.ts';
import { assertNativeBehaviorSuite, type NativeBehaviorSuite, type NativeContract } from '../../domain/services/evaluation/NativeBehaviorSuite.ts';
import { nativeTrustedGates } from '../../domain/services/evaluation/NativeTrustedGates.ts';
import { nativeTestKeys, nativeOracleTrusted, type NativeTestSet } from '../../domain/services/evaluation/NativeTestCache.ts';
import type { ArtifactStore } from '../ports/ApplicationPorts.ts';
import type { NativeCaseRunner, NativeSnapshotter, NativeTestStore, NativeCaseObservation } from '../ports/NativeEvaluationPorts.ts';
import type { NativeToolchainInput } from '../ports/LanguageToolchainPorts.ts';
import type { StageExecutionContext } from './WorkbenchStages.ts';
type Context = Partial<Pick<StageExecutionContext, 'signal' | 'step' | 'progress'>>;
export class NativeSuiteEvaluation {
  readonly dependencies: { artifacts: ArtifactStore; runner: NativeCaseRunner; snapshot: NativeSnapshotter; store: NativeTestStore };
  constructor(dependencies: NativeSuiteEvaluation['dependencies']) { this.dependencies = dependencies; }
  private async put(value: unknown) { return this.dependencies.artifacts.put(Buffer.from(JSON.stringify(value)), 'application/json'); }
  private async manifest(input: NativeToolchainInput) {
    const files = [];
    for (const file of [...input.files].sort((a, b) => a.path.localeCompare(b.path))) files.push({ path: file.path,
      ref: await this.dependencies.artifacts.put(Buffer.from(file.content), 'text/plain; charset=utf-8') });
    return { language: input.language, build: buildConstraints(input.build), files, sanitizers: true };
  }
  private async load<T>(ref: ArtifactRef): Promise<T> {
    if (!await this.dependencies.artifacts.verify(ref)) throw new Error('NATIVE_TEST_ARTIFACT_CORRUPT');
    return JSON.parse(Buffer.from(await this.dependencies.artifacts.get(ref)).toString()) as T;
  }
  private async verifiedSuite(set: NativeTestSet, contract: NativeContract): Promise<NativeBehaviorSuite> {
    const keys = nativeTestKeys(set.binding);
    if (keys.cacheKey !== set.cacheKey || keys.referenceKey !== set.referenceKey) throw new Error('NATIVE_TEST_CACHE_CORRUPT');
    if (set.status !== 'TRUSTED' || set.binding.interfaceDigest !== sha256(canonicalJson(contract))) throw new Error('NATIVE_TEST_NOT_TRUSTED');
    const suite = await this.load<NativeBehaviorSuite>(set.suiteRef); assertNativeBehaviorSuite(suite, contract);
    const oracle = await this.load<NativeCaseObservation[]>(set.oracleRef);
    if (!nativeOracleTrusted(suite, oracle)) throw new Error('NATIVE_TEST_NOT_TRUSTED');
    for (const ref of [set.referenceRef, set.fingerprintRef]) if (!await this.dependencies.artifacts.verify(ref)) throw new Error('NATIVE_TEST_ARTIFACT_CORRUPT');
    return suite;
  }
  private async cases(phase: 'reference' | 'generated', key: string, input: NativeToolchainInput, contract: NativeContract, suite: NativeBehaviorSuite, context: Context) {
    const results: NativeCaseObservation[] = [];
    for (const test of suite.cases) {
      context.signal?.throwIfAborted();
      const work = async () => {
        const result = await this.dependencies.runner.execute(input, contract, test, context.signal);
        const ref = await this.put(result);
        return { artifactRefs: [ref], summary: { phase, caseId: test.caseId, status: result.status, reasonCode: result.reasonCode } };
      };
      const result = context.step ? await context.step(`native:${phase}:${sha256(`${key}:${test.caseId}`)}`, work) : await work();
      const observation = await this.load<NativeCaseObservation>(result.artifactRefs[0]!); results.push(observation);
      context.progress?.({ phase, caseId: test.caseId, completed: results.length, total: suite.cases.length, status: observation.status, reportRef: JSON.parse(JSON.stringify(result.artifactRefs[0])) });
    }
    return results;
  }
  async prepare(input: {
    projectSnapshotId: string; sourceRevision: string; cardIds: string[]; versionIds: string[]; bodyRefs: ArtifactRef[];
    reference: NativeToolchainInput; contract: NativeContract; policyDigest: string;
    propose: () => Promise<NativeBehaviorSuite>; expectedToolchainDigest?: string;
  }, context: Context = {}) {
    const { artifacts, snapshot, store } = this.dependencies;
    if (!input.versionIds.length || input.versionIds.length !== input.bodyRefs.length || input.cardIds.length !== input.bodyRefs.length || new Set(input.versionIds).size !== input.versionIds.length) throw new Error('NATIVE_TEST_BINDING_INVALID');
    for (const ref of input.bodyRefs) if (!await artifacts.verify(ref)) throw new Error('NATIVE_TEST_ARTIFACT_CORRUPT');
    const fingerprint = await snapshot(input.reference.language, input.reference.build, context.signal);
    if (input.expectedToolchainDigest && input.expectedToolchainDigest !== fingerprint.digest) throw new Error('NATIVE_TEST_TOOLCHAIN_CHANGED');
    const reference = await this.manifest(input.reference);
    const binding = { cardIds: [...input.cardIds], knowledgeBodyDigests: input.bodyRefs.map((ref) => ref.sha256), referenceDigest: sha256(JSON.stringify(reference)),
      interfaceDigest: sha256(canonicalJson(input.contract)), policyDigest: input.policyDigest, toolchainDigest: fingerprint.digest };
    const inherited = store.lineage(input.cardIds);
    const historicalSuites: NativeBehaviorSuite[] = [];
    for (const set of inherited) {
      if (set.binding.interfaceDigest !== binding.interfaceDigest) throw new Error('NATIVE_TRUSTED_INTERFACE_CHANGED');
      historicalSuites.push(await this.verifiedSuite(set, input.contract));
    }
    const proposedSuite = inherited.length ? null : await input.propose();
    if (proposedSuite) assertNativeBehaviorSuite(proposedSuite, input.contract);
    const gates = nativeTrustedGates(proposedSuite ? [proposedSuite] : historicalSuites);
    const bound = { ...binding, gateDigest: gates.digest };
    const keys = nativeTestKeys(bound); const cached = store.trusted(keys.cacheKey);
    if (cached) { if (cached.cacheKey !== keys.cacheKey) throw new Error('NATIVE_TEST_CACHE_CORRUPT');
      const suite = await this.verifiedSuite(cached, input.contract); return { set: cached, reused: suite.cases.length, proposed: 0, revalidated: false }; }
    const parent = store.head(keys.referenceKey);
    if (parent && parent.referenceKey !== keys.referenceKey) throw new Error('NATIVE_TEST_CACHE_CORRUPT');
    // 输入变化只令缓存失效；所有历史可信输入和预期原样再次验证，不交给模型重写。
    const suite = proposedSuite ?? gates.suite;
    assertNativeBehaviorSuite(suite, input.contract);
    const available = new Map<string, string>();
    for (let index = 0; index < input.bodyRefs.length; index++) {
      const body = Buffer.from(await artifacts.get(input.bodyRefs[index]!)).toString('utf8');
      for (const section of markdownSections(body)) {
        const sectionId = `${input.cardIds[index]}#${section.heading}`;
        if (available.has(sectionId)) throw new Error('NATIVE_TEST_SECTION_AMBIGUOUS');
        available.set(sectionId, input.versionIds[index]!);
      }
    }
    const sectionBindings = [...new Set(suite.cases.flatMap((test) => test.sections))].map((sectionId) => {
      const current = available.get(sectionId); const historical = parent?.sectionBindings.find((item) => item.sectionId === sectionId)
        ?? [...inherited].reverse().flatMap((set) => set.sectionBindings).find((item) => item.sectionId === sectionId);
      if (!current && !historical) throw new Error('NATIVE_TEST_SECTION_INVALID');
      return { sectionId, versionId: current ?? historical!.versionId, matchesInput: Boolean(current) };
    });
    const suiteRef = await this.put(suite);
    const observations = await this.cases('reference', `${keys.cacheKey}:${suiteRef.sha256}`, input.reference, input.contract, suite, context);
    if ((await snapshot(input.reference.language, input.reference.build, context.signal)).digest !== fingerprint.digest) throw new Error('NATIVE_TEST_TOOLCHAIN_CHANGED');
    const oracleRef = await this.put(observations); const referenceRef = await this.put(reference); const fingerprintRef = await this.put(fingerprint);
    const set = store.save({ testSetId: `native-tests-${sha256(`${keys.cacheKey}:${suiteRef.sha256}:${oracleRef.sha256}`)}`, ...keys,
      parentTestSetId: parent?.testSetId ?? null, originVersionIds: [...input.versionIds], projectSnapshotId: input.projectSnapshotId, sourceRevision: input.sourceRevision,
      binding: bound, inheritedTestSetIds: inherited.map((item) => item.testSetId), sectionBindings, status: nativeOracleTrusted(suite, observations) ? 'TRUSTED' : 'REJECTED', suiteRef, oracleRef, referenceRef, fingerprintRef, createdAt: new Date().toISOString() });
    return { set, reused: inherited.length ? suite.cases.length : 0, proposed: inherited.length ? 0 : suite.cases.length, revalidated: Boolean(inherited.length) };
  }
  async evaluate(testSetId: string, generated: NativeToolchainInput, contract: NativeContract, context: Context = {}) {
    const { snapshot, store } = this.dependencies;
    const set = store.get(testSetId); if (!set) throw new Error('NATIVE_TEST_SET_NOT_FOUND');
    const suite = await this.verifiedSuite(set, contract);
    if ((await snapshot(generated.language, generated.build, context.signal)).digest !== set.binding.toolchainDigest) throw new Error('NATIVE_TEST_TOOLCHAIN_CHANGED');
    const generatedManifest = await this.manifest(generated);
    const generatedDigest = sha256(JSON.stringify(generatedManifest)); const generatedRef = await this.put(generatedManifest);
    const generatedContract = { ...contract, entryPaths: contract.entryPaths.filter((path) => generated.files.some((file) => file.path === path)) };
    const results = await this.cases('generated', `${set.testSetId}:${generatedDigest}`, generated, generatedContract, suite, context);
    if ((await snapshot(generated.language, generated.build, context.signal)).digest !== set.binding.toolchainDigest) throw new Error('NATIVE_TEST_TOOLCHAIN_CHANGED');
    const report = { schemaVersion: 'native-evaluation-v1', testSetId, generatedDigest, generatedRef, total: suite.cases.length,
      passed: results.filter((result, index) => nativeOracleTrusted({ schemaVersion: 'native-cases-v1', cases: [suite.cases[index]!] }, [result])).length,
      allPassed: nativeOracleTrusted(suite, results), publicationVerified: false,
      cases: results.map((result, index) => ({ ...result, input: suite.cases[index]!, sections: suite.cases[index]!.sections,
        sectionBindings: set.sectionBindings.filter((binding) => suite.cases[index]!.sections.includes(binding.sectionId)), expected: suite.cases[index]!.expected })) };
    return { report, reportRef: await this.put(report) };
  }
}
