/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证发布准备重读卡片并拒绝缺失或被篡改的递归工件。
 */
import { SOURCE_EXECUTION_SCOPE, sourceExecutionScope } from '../../src/domain/services/knowledge/SourceExecutionScope.ts';
import { sourceEvidenceBindings } from '../../src/domain/services/knowledge/SourceEvidenceBindings.ts';
import assert from 'node:assert/strict';
import { sha256, type ArtifactRef, type KnowledgeVersion } from '../../src/domain/Domain.ts';
import { WorkbenchPublicationEvidence } from '../../src/application/services/WorkbenchPublicationEvidence.ts';
import { JsonSchemaAgentContractValidator } from '../../src/infrastructure/agentAdapters/contracts/JsonSchemaAgentContractValidator.ts';
import { publicationFixture, publicationBody, publicationConfiguration, publicationApi } from '../helpers/WorkbenchPublicationFixture.ts';
import { buildConstraints, createProjectSnapshot, type WorkbenchProjectSnapshot } from '../../src/domain/services/workbench/WorkbenchProject.ts';
import { sourceSectionObservations } from '../../src/domain/services/knowledge/KnowledgeSourceVerification.ts';
import type { NativeBehaviorSuite } from '../../src/domain/services/evaluation/NativeBehaviorSuite.ts';
import { nativeTestKeys, type NativeTestSet } from '../../src/domain/services/evaluation/NativeTestCache.ts';
import { canonicalJson, createStageTask } from '../../src/domain/services/workbench/StageTask.ts';
export async function createPublicationPreparationFixture(options: { sourceEvidencePolicy?: string; executionScope?: boolean } = {}) {
  const seed = publicationFixture(); const contents = new Map<string, Buffer>(); let puts = 0;
  const put = async (data: Uint8Array, mediaType: string): Promise<ArtifactRef> => {
    puts++; const buffer = Buffer.from(data); const digest = sha256(buffer); contents.set(digest, buffer);
    return { artifactId: `sha256:${digest}`, sha256: digest, size: buffer.length, mediaType };
  };
  await put(Buffer.from('{"files":[]}'), 'application/json');
  await put(Buffer.from(canonicalJson(publicationConfiguration)), 'application/json');
  await put(Buffer.from(JSON.stringify(publicationApi)), 'application/json');
  let fingerprintRef = await put(Buffer.from(JSON.stringify({ digest: sha256('toolchain') })), 'application/json');
  if (options.executionScope) fingerprintRef = await put(Buffer.from(JSON.stringify({ digest: sha256('toolchain'), schemaVersion: 'native-toolchain-v1', language: 'c', build: buildConstraints(), architecture: 'x64' })), 'application/json');
  const sourceContent = 'int value(void) { return 1; }';
  const sourceRef = await put(Buffer.from(sourceContent), 'text/plain');
  const module = { moduleId: 'module', language: 'c' as const, sourcePaths: ['module.c'], testPaths: [], selectedByDefault: true, reasons: [] };
  const manifestRef = await put(Buffer.from(JSON.stringify({ schemaVersion: 'repository-analysis-v1', repositoryId: 'repository', directory: '/reference', commit: 'commit',
    sourceDigest: seed.reconstruction.input.sourceDigest, modules: [module], files: [{ path: 'module.c', objectId: 'object', size: sourceRef.size, language: 'c', kind: 'source' }] })), 'application/json');
  const project = createProjectSnapshot({ repositoryId: 'repository', directory: '/reference', commit: 'commit', sourceDigest: seed.reconstruction.input.sourceDigest,
    modules: [module], build: buildConstraints(), sourceFiles: [{ path: 'module.c', objectId: 'object', kind: 'source', ref: sourceRef }], manifestRef }, 'now');
  const input = publicationFixture({ projectId: project.projectId, snapshotId: project.snapshotId });
  if (options.executionScope) input.fixedEvaluation.input.parameters.fingerprints = { c: JSON.parse(JSON.stringify(fingerprintRef)) };
  const bodyRef = await put(Buffer.from(publicationBody), 'text/markdown');
  const nestedRef = await put(Buffer.from('audit'), 'text/plain');
  const suite = { schemaVersion: 'native-cases-v1', cases: ['a', 'b'].map(caseId => ({ caseId, description: 'value', sections: ['card#value'], variables: [], calls: [{ function: 'value', arguments: [], result: 'value' }],
    observations: [{ name: 'value', kind: 'integer', read: { variable: 'value' } }], expected: { value: '1' } })) };
  const suiteRef = await put(Buffer.from(JSON.stringify(suite)), 'application/json');
  input.fixedSuites[0]!.suiteRef = suiteRef; input.fixedEvaluation.input.parameters.suiteRefs = { module: { ...suiteRef } };
  const identity = createStageTask(input.fixedEvaluation.input, input.fixedEvaluation.limits, 'now');
  input.fixedEvaluation.taskId = identity.taskId; input.fixedEvaluation.inputDigest = identity.inputDigest;
  const observations = suite.cases.map(test => ({ caseId: test.caseId, status: 'PASSED', actual: { value: '1' },
    report: { build: { exitCode: 0, timedOut: false, outputLimitExceeded: false }, execution: { exitCode: 0, timedOut: false, outputLimitExceeded: false } } }));
  const report = { schemaVersion: 'fixed-native-evaluation-v1', status: 'FIXED_PASSED', moduleId: 'module', reconstructionTaskId: input.reconstruction.taskId,
    snapshotId: project.snapshotId, sourceDigest: input.reconstruction.input.sourceDigest, suiteRef, fingerprintRef, manifestRef,
    codeRef: (input.reconstruction.result!.summary.modules as Array<Record<string, unknown>>)[0]!.codeRef,
    cardVersionIds: ['version'], cards: [{ cardId: 'card', versionId: 'version', bodyRef }], reference: observations, generated: structuredClone(observations), nestedRef };
  const reportRef = await put(Buffer.from(JSON.stringify(report)), 'application/json');
  input.fixedEvaluation.result!.artifactRefs = [reportRef];
  (input.fixedEvaluation.result!.summary.modules as Array<Record<string, unknown>>)[0]!.reportRef = reportRef;
  const referenceRef = await put(Buffer.from(JSON.stringify({ language: 'c', build: project.build, files: [{ path: 'module.c', ref: sourceRef }], sanitizers: true })), 'application/json');
  const oracleRef = await put(Buffer.from(JSON.stringify(observations)), 'application/json');
  const binding = { cardIds: ['card'], knowledgeBodyDigests: [bodyRef.sha256], referenceDigest: referenceRef.sha256,
    interfaceDigest: sha256(canonicalJson({ schemaVersion: 'native-contract-v1', language: 'c', includePath: 'module.c', entryPaths: [], declarations: publicationApi.declarations, targetFunctions: ['value'] })),
    policyDigest: sha256(canonicalJson({ schemaVersion: 'native-test-policy-v1', prompt: publicationConfiguration.agents[0]!.effectivePromptSha256, roleExecutionVersion: publicationConfiguration.roleExecutionVersion, contracts: publicationConfiguration.contracts, provider: publicationConfiguration.provider })), toolchainDigest: sha256('toolchain') };
  const keys = nativeTestKeys(binding);
  const set: NativeTestSet = { ...keys, binding, testSetId: `native-tests-${sha256(`${keys.cacheKey}:${suiteRef.sha256}:${oracleRef.sha256}`)}`,
    parentTestSetId: null, originVersionIds: ['version'], projectSnapshotId: project.snapshotId, sourceRevision: 'commit', status: 'TRUSTED',
    suiteRef, oracleRef, referenceRef, fingerprintRef, sectionBindings: [], createdAt: 'now' };
  const generatedRef = await put(Buffer.from(JSON.stringify({ language: 'c', build: project.build, files: [], sanitizers: true })), 'application/json');
  const trustedReport = { schemaVersion: 'native-evaluation-v1', testSetId: set.testSetId, generatedRef, generatedDigest: generatedRef.sha256,
    total: 2, passed: 2, allPassed: true, cases: observations.map((item, index) => ({ ...item, input: suite.cases[index], expected: suite.cases[index]!.expected })) };
  const trustedReportRef = await put(Buffer.from(JSON.stringify(trustedReport)), 'application/json');
  input.evaluation.result!.artifactRefs = [trustedReportRef];
  Object.assign((input.evaluation.result!.summary.modules as Array<Record<string, unknown>>)[0]!, { testSetId: set.testSetId, reportRef: trustedReportRef });
  input.sourceVerification.input.parameters.evaluationDigest = sha256(canonicalJson(input.evaluation.result));
  if (options.sourceEvidencePolicy) input.sourceVerification.input.parameters.sourceEvidencePolicy = options.sourceEvidencePolicy;
  const executionScope = options.executionScope ? sourceExecutionScope(set, JSON.parse(contents.get(referenceRef.sha256)!.toString()), JSON.parse(contents.get(fingerprintRef.sha256)!.toString()), project.build) : undefined;
  const executionScopesRef = executionScope ? await put(Buffer.from(canonicalJson([{ moduleId: 'module', scope: executionScope }])), 'application/json') : undefined;
  if (executionScopesRef) { input.sourceVerification.input.parameters.sourceExecutionPolicy = SOURCE_EXECUTION_SCOPE; input.sourceVerification.input.parameters.executionScopesRef = JSON.parse(JSON.stringify(executionScopesRef)); }
  const sourceIdentity = createStageTask(input.sourceVerification.input, {}, 'now');
  input.sourceVerification.taskId = sourceIdentity.taskId; input.sourceVerification.inputDigest = sourceIdentity.inputDigest;
  const sourceReferenceRef = await put(Buffer.from(JSON.stringify({ schemaVersion: 'knowledge-source-verification-v4', sourceRevision: 'commit', sourceDigest: project.sourceDigest, files: [{ path: 'module.c', content: sourceContent }] })), 'application/json');
  const sourceObservations = { schemaVersion: 'native-source-review-evidence-v3', sourceRevision: project.commit, sourceDigest: project.sourceDigest, suiteRef, oracleRef,
    ...sourceSectionObservations(suite as NativeBehaviorSuite, observations as Parameters<typeof sourceSectionObservations>[1], 'card', 'Value') };
  const observationsRef = await put(Buffer.from(JSON.stringify(sourceObservations)), 'application/json');
  const criteriaRef = await put(Buffer.from(JSON.stringify({ schemaVersion: 'knowledge-source-verification-v4', phase: 'FINAL_SOURCE_REVIEW', binding: input.cards[0],
    ...(options.sourceEvidencePolicy ? { sourceEvidenceBindings: sourceEvidenceBindings(options.sourceEvidencePolicy, project, 'module') } : {}),
    ...(executionScope ? { executionScope } : {}),
    section: 'Value', verifyPreamble: true, allowedKnowledgePaths: ['knowledge/knowledge-unit.md#Value'] })), 'application/json');
  const rawRef = await put(Buffer.from(JSON.stringify({ recommendation: 'PASS', blocking: false, correction: null })), 'application/json');
  const command = { schemaVersion: '1.0', commandId: 'source-command', runId: input.sourceVerification.taskId, agentType: 'review', generationKey: sha256('source'),
    payload: { knowledgeRef: bodyRef, checkReportRef: sourceReferenceRef, evaluationReportRef: observationsRef, criteriaRef } };
  const commandRef = await put(Buffer.from(JSON.stringify(command)), 'application/json');
  const resultRef = await put(Buffer.from(JSON.stringify({ schemaVersion: '1.0', commandId: command.commandId, commandRef, runId: command.runId, agentType: 'review', status: 'SUCCEEDED',
    rawOutputRef: rawRef, outputRefs: [rawRef], payload: { resultKind: 'attribution', corrections: [], unresolvedRisks: [] } })), 'application/json');
  const sourceSections = [{ ...input.cards[0], section: 'Value', outcome: 'SOURCE_MATCHED', reviewRef: rawRef, reviewResultRef: resultRef,
    referenceRef: sourceReferenceRef, referenceObservationsRef: observationsRef, criteriaRef }];
  (input.sourceVerification.result!.summary.cards as Array<Record<string, unknown>>)[0]!.sections = sourceSections;
  input.sourceVerification.result!.artifactRefs = [rawRef, resultRef, sourceReferenceRef, observationsRef, criteriaRef, ...(executionScopesRef ? [executionScopesRef, referenceRef, fingerprintRef] : [])];
  const records = [input.reconstruction, input.evaluation, input.fixedEvaluation, input.sourceVerification];
  const card = { versionId: 'version', moduleId: 'knowledge-unit', bodyRef, title: 'Value', description: 'Returns a value', tags: ['c'], provenance: [{ path: 'module.c', commit: 'commit' }], metadata: { cardId: 'card', sourceModule: 'module', projectSnapshotId: project.snapshotId } } as unknown as KnowledgeVersion;
  const service = new WorkbenchPublicationEvidence({ contracts: new JsonSchemaAgentContractValidator('docs/specs/schemas'), projects: { get: () => structuredClone(project) }, tests: { get: id => id === set.testSetId ? structuredClone(set) : null }, stages: { get(id) { const task = records.find(task => task.taskId === id); assert.ok(task); return structuredClone(task); } },
    repository: { getKnowledgeVersion: () => structuredClone(card) }, artifacts: {
      put, get: async ref => { const value = contents.get(ref.sha256); assert.ok(value); return value; },
      verify: async ref => { const data = contents.get(ref.sha256); return Boolean(data && data.length === ref.size && sha256(data) === ref.sha256); },
    } });
  puts = 0;
  const ids = { reconstruction: input.reconstruction.taskId, evaluation: input.evaluation.taskId, fixedEvaluation: input.fixedEvaluation.taskId, sourceVerification: input.sourceVerification.taskId };
  return { service, ids, input, contents, nestedRef, card, report, set, trustedReport, project, sourceSections, sourceObservations, command, rawRef, put, puts: () => puts };
}
