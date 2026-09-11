/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证发布准备重读卡片并拒绝缺失或被篡改的递归工件。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256, type ArtifactRef, type KnowledgeVersion } from '../../src/domain/Domain.ts';
import { WorkbenchPublicationEvidence } from '../../src/application/services/WorkbenchPublicationEvidence.ts';
import { JsonSchemaAgentContractValidator } from '../../src/infrastructure/agentAdapters/contracts/JsonSchemaAgentContractValidator.ts';
import { publicationFixture, publicationBody, publicationConfiguration, publicationApi } from '../helpers/WorkbenchPublicationFixture.ts';
import { buildConstraints, type WorkbenchProjectSnapshot } from '../../src/domain/services/workbench/WorkbenchProject.ts';
import { sourceSectionObservations } from '../../src/domain/services/knowledge/KnowledgeSourceVerification.ts';
import type { NativeBehaviorSuite } from '../../src/domain/services/evaluation/NativeBehaviorSuite.ts';
import { nativeTestKeys, type NativeTestSet } from '../../src/domain/services/evaluation/NativeTestCache.ts';
import { canonicalJson, createStageTask } from '../../src/domain/services/workbench/StageTask.ts';
async function setup() {
  const input = publicationFixture(); const contents = new Map<string, Buffer>(); let puts = 0;
  const put = async (data: Uint8Array, mediaType: string): Promise<ArtifactRef> => {
    puts++; const buffer = Buffer.from(data); const digest = sha256(buffer); contents.set(digest, buffer);
    return { artifactId: `sha256:${digest}`, sha256: digest, size: buffer.length, mediaType };
  };
  await put(Buffer.from('{"files":[]}'), 'application/json');
  await put(Buffer.from(canonicalJson(publicationConfiguration)), 'application/json');
  await put(Buffer.from(JSON.stringify(publicationApi)), 'application/json');
  const fingerprintRef = await put(Buffer.from(JSON.stringify({ digest: sha256('toolchain') })), 'application/json');
  const manifestRef = await put(Buffer.from(JSON.stringify({ sourceDigest: input.reconstruction.input.sourceDigest })), 'application/json');
  const project = { schemaVersion: 'workbench-project-v1', projectId: 'project', snapshotId: 'snapshot', repositoryId: 'repository', directory: '/reference',
    commit: 'commit', sourceDigest: input.reconstruction.input.sourceDigest, modules: [], build: buildConstraints(), sourceFiles: [], manifestRef, createdAt: 'now' } as WorkbenchProjectSnapshot;
  const sourceContent = 'int value = 1;';
  const sourceRef = await put(Buffer.from(sourceContent), 'text/plain');
  project.modules = [{ moduleId: 'module', language: 'c', sourcePaths: ['module.c'], testPaths: [], selectedByDefault: true, reasons: [] }];
  project.sourceFiles = [{ path: 'module.c', objectId: 'object', kind: 'source', ref: sourceRef }];
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
    snapshotId: 'snapshot', sourceDigest: input.reconstruction.input.sourceDigest, suiteRef, fingerprintRef, manifestRef,
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
    parentTestSetId: null, originVersionIds: ['version'], projectSnapshotId: 'snapshot', sourceRevision: 'commit', status: 'TRUSTED',
    suiteRef, oracleRef, referenceRef, fingerprintRef, sectionBindings: [], createdAt: 'now' };
  const generatedRef = await put(Buffer.from(JSON.stringify({ language: 'c', build: project.build, files: [], sanitizers: true })), 'application/json');
  const trustedReport = { schemaVersion: 'native-evaluation-v1', testSetId: set.testSetId, generatedRef, generatedDigest: generatedRef.sha256,
    total: 2, passed: 2, allPassed: true, cases: observations.map((item, index) => ({ ...item, input: suite.cases[index], expected: suite.cases[index]!.expected })) };
  const trustedReportRef = await put(Buffer.from(JSON.stringify(trustedReport)), 'application/json');
  input.evaluation.result!.artifactRefs = [trustedReportRef];
  Object.assign((input.evaluation.result!.summary.modules as Array<Record<string, unknown>>)[0]!, { testSetId: set.testSetId, reportRef: trustedReportRef });
  input.sourceVerification.input.parameters.evaluationDigest = sha256(canonicalJson(input.evaluation.result));
  const sourceIdentity = createStageTask(input.sourceVerification.input, {}, 'now');
  input.sourceVerification.taskId = sourceIdentity.taskId; input.sourceVerification.inputDigest = sourceIdentity.inputDigest;
  const sourceReferenceRef = await put(Buffer.from(JSON.stringify({ schemaVersion: 'knowledge-source-verification-v4', sourceRevision: 'commit', sourceDigest: project.sourceDigest, files: [{ path: 'module.c', content: sourceContent }] })), 'application/json');
  const sourceObservations = { schemaVersion: 'native-source-review-evidence-v3', sourceRevision: project.commit, sourceDigest: project.sourceDigest, suiteRef, oracleRef,
    ...sourceSectionObservations(suite as NativeBehaviorSuite, observations as Parameters<typeof sourceSectionObservations>[1], 'card', 'Value') };
  const observationsRef = await put(Buffer.from(JSON.stringify(sourceObservations)), 'application/json');
  const criteriaRef = await put(Buffer.from(JSON.stringify({ schemaVersion: 'knowledge-source-verification-v4', phase: 'FINAL_SOURCE_REVIEW', binding: input.cards[0],
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
  input.sourceVerification.result!.artifactRefs = [rawRef, resultRef, sourceReferenceRef, observationsRef, criteriaRef];
  const records = [input.reconstruction, input.evaluation, input.fixedEvaluation, input.sourceVerification];
  const card = { versionId: 'version', moduleId: 'knowledge-unit', bodyRef, metadata: { cardId: 'card', sourceModule: 'module', projectSnapshotId: 'snapshot' } } as unknown as KnowledgeVersion;
  const service = new WorkbenchPublicationEvidence({ contracts: new JsonSchemaAgentContractValidator('docs/specs/schemas'), projects: { get: () => structuredClone(project) }, tests: { get: id => id === set.testSetId ? structuredClone(set) : null }, stages: { get(id) { const task = records.find(task => task.taskId === id); assert.ok(task); return structuredClone(task); } },
    repository: { getKnowledgeVersion: () => structuredClone(card) }, artifacts: {
      put, get: async ref => { const value = contents.get(ref.sha256); assert.ok(value); return value; },
      verify: async ref => { const data = contents.get(ref.sha256); return Boolean(data && data.length === ref.size && sha256(data) === ref.sha256); },
    } });
  puts = 0;
  const ids = { reconstruction: input.reconstruction.taskId, evaluation: input.evaluation.taskId, fixedEvaluation: input.fixedEvaluation.taskId, sourceVerification: input.sourceVerification.taskId };
  return { service, ids, input, contents, nestedRef, card, report, set, trustedReport, project, sourceSections, sourceObservations, command, rawRef, put, puts: () => puts };
}
test('preparation checks recursive CAS graph, binds body and is content-idempotent', async () => {
  const f = await setup(); const prepared = await f.service.prepare(f.ids, f.input.fixedSuites);
  assert.equal(prepared.state, 'PREPARED'); assert.equal(prepared.publicationVerified, false);
  assert.equal(prepared.verifiedArtifactRefs.length, 20);
  assert.equal((await f.service.prepare(f.ids, f.input.fixedSuites)).artifactRef.sha256, prepared.artifactRef.sha256);
});
test('corrupt nested artifact and changed persistent body reject before writing preparation', async () => {
  const f = await setup(); f.contents.set(f.nestedRef.sha256, Buffer.from('wrong'));
  await assert.rejects(f.service.prepare(f.ids, f.input.fixedSuites), /PUBLICATION_ARTIFACT_CORRUPT/); assert.equal(f.puts(), 0);
  const g = await setup(); g.card.bodyRef.sha256 = sha256('changed');
  await assert.rejects(g.service.prepare(g.ids, g.input.fixedSuites)); assert.equal(g.puts(), 0);
});

test('a correctly hashed report cannot hide wrong generated observations behind FIXED_PASSED', async () => {
  const f = await setup(); f.report.generated[0]!.actual.value = '9';
  const ref = await f.put(Buffer.from(JSON.stringify(f.report)), 'application/json');
  f.input.fixedEvaluation.result!.artifactRefs = [ref];
  (f.input.fixedEvaluation.result!.summary.modules as Array<Record<string, unknown>>)[0]!.reportRef = ref;
  const before = f.puts();
  await assert.rejects(f.service.prepare(f.ids, f.input.fixedSuites), /PUBLICATION_FIXED_OBSERVATIONS_REJECTED/);
  assert.equal(f.puts(), before);
});

test('report code, card and toolchain bindings cannot be replaced while preserving task identity', async () => {
  for (const field of ['codeRef', 'fingerprintRef', 'cards', 'cardVersionIds'] as const) {
    const f = await setup();
    if (field === 'cards') f.report.cards[0]!.cardId = 'other';
    else if (field === 'cardVersionIds') f.report.cardVersionIds = ['other'];
    else f.report[field] = f.nestedRef;
    const ref = await f.put(Buffer.from(JSON.stringify(f.report)), 'application/json');
    f.input.fixedEvaluation.result!.artifactRefs = [ref];
    (f.input.fixedEvaluation.result!.summary.modules as Array<Record<string, unknown>>)[0]!.reportRef = ref;
    await assert.rejects(f.service.prepare(f.ids, f.input.fixedSuites), /PUBLICATION_FIXED_IMPLEMENTATION_CHANGED/);
  }
});

test('preparation rejects trusted sets bound to another body or toolchain', async () => {
  for (const field of ['knowledgeBodyDigests', 'toolchainDigest'] as const) {
    const f = await setup();
    if (field === 'knowledgeBodyDigests') f.set.binding.knowledgeBodyDigests = [sha256('changed')];
    else f.set.binding.toolchainDigest = sha256('changed');
    await assert.rejects(f.service.prepare(f.ids, f.input.fixedSuites), /PUBLICATION_TRUSTED_BINDING_CHANGED/);
    assert.equal(f.puts(), 0);
  }
});

test('a new valid manifest digest cannot substitute another generated implementation', async () => {
  const f = await setup();
  const generatedRef = await f.put(Buffer.from(JSON.stringify({ language: 'cpp', files: [] })), 'application/json');
  f.trustedReport.generatedRef = generatedRef; f.trustedReport.generatedDigest = generatedRef.sha256;
  const reportRef = await f.put(Buffer.from(JSON.stringify(f.trustedReport)), 'application/json');
  f.input.evaluation.result!.artifactRefs = [reportRef];
  (f.input.evaluation.result!.summary.modules as Array<Record<string, unknown>>)[0]!.reportRef = reportRef;
  f.input.sourceVerification.input.parameters.evaluationDigest = sha256(canonicalJson(f.input.evaluation.result));
  const identity = createStageTask(f.input.sourceVerification.input, {}, 'now');
  f.input.sourceVerification.taskId = identity.taskId; f.input.sourceVerification.inputDigest = identity.inputDigest;
  f.ids.sourceVerification = identity.taskId;
  const before = f.puts();
  await assert.rejects(f.service.prepare(f.ids, f.input.fixedSuites), /PUBLICATION_TRUSTED_IMPLEMENTATION_CHANGED/);
  assert.equal(f.puts(), before);
});

test('publication preparation rejects changed project build parameters and snapshot source', async () => {
  const f = await setup(); f.project.build.definitions = ['DIFFERENT=1'];
  await assert.rejects(f.service.prepare(f.ids, f.input.fixedSuites), /PUBLICATION_PROJECT_IMPLEMENTATION_CHANGED/);
  assert.equal(f.puts(), 0);
  const g = await setup(); g.project.sourceDigest = sha256('other source');
  await assert.rejects(g.service.prepare(g.ids, g.input.fixedSuites), /PUBLICATION_PROJECT_BINDING_CHANGED/);
  assert.equal(g.puts(), 0);
});

test('source summary PASS cannot conceal missing chapters or a risky original Review', async () => {
  const f = await setup(); f.sourceSections.splice(0);
  await assert.rejects(f.service.prepare(f.ids, f.input.fixedSuites), /SOURCE_VERIFICATION_SECTION_INVALID|PUBLICATION_SOURCE_COVERAGE_INVALID/);
  assert.equal(f.puts(), 0);
  const g = await setup();
  const ref = await g.put(Buffer.from(JSON.stringify({ recommendation: 'PASS', blocking: false, correction: null, unresolvedRisks: ['risk'] })), 'application/json');
  g.sourceSections[0]!.reviewRef = ref;
  g.input.sourceVerification.result!.artifactRefs.push(ref);
  const before = g.puts();
  await assert.rejects(g.service.prepare(g.ids, g.input.fixedSuites), /PUBLICATION_SOURCE_REVIEW_REJECTED/);
  assert.equal(g.puts(), before);
});

test('source observation projection must match the trusted oracle, even with a valid new artifact', async () => {
  const f = await setup(); f.sourceObservations.relatedObservations[0]!.actual = { value: '9' };
  const ref = await f.put(Buffer.from(JSON.stringify(f.sourceObservations)), 'application/json');
  f.sourceSections[0]!.referenceObservationsRef = ref;
  f.input.sourceVerification.result!.artifactRefs.push(ref);
  const before = f.puts();
  await assert.rejects(f.service.prepare(f.ids, f.input.fixedSuites), /PUBLICATION_SOURCE_OBSERVATIONS_CHANGED/);
  assert.equal(f.puts(), before);
});

test('trusted interface and policy digests must match frozen interface and model configuration', async () => {
  for (const field of ['interfaceDigest', 'policyDigest'] as const) {
    const f = await setup(); f.set.binding[field] = sha256('changed');
    await assert.rejects(f.service.prepare(f.ids, f.input.fixedSuites), /PUBLICATION_TEST_POLICY_CHANGED/);
    assert.equal(f.puts(), 0);
  }
});

test('fixed cases must exercise the declared API rather than contain only expected values', async () => {
  const f = await setup();
  const suite = JSON.parse(f.contents.get(f.input.fixedSuites[0]!.suiteRef.sha256)!.toString('utf8'));
  for (const sample of suite.cases) sample.calls = [];
  const suiteRef = await f.put(Buffer.from(JSON.stringify(suite)), 'application/json');
  f.input.fixedSuites[0]!.suiteRef = suiteRef;
  f.input.fixedEvaluation.input.parameters.suiteRefs = { module: { ...suiteRef } };
  const identity = createStageTask(f.input.fixedEvaluation.input, {}, 'now');
  f.input.fixedEvaluation.taskId = identity.taskId; f.input.fixedEvaluation.inputDigest = identity.inputDigest; f.ids.fixedEvaluation = identity.taskId;
  f.report.suiteRef = suiteRef;
  const reportRef = await f.put(Buffer.from(JSON.stringify(f.report)), 'application/json');
  f.input.fixedEvaluation.result!.artifactRefs = [reportRef];
  (f.input.fixedEvaluation.result!.summary.modules as Array<Record<string, unknown>>)[0]!.reportRef = reportRef;
  const before = f.puts();
  await assert.rejects(f.service.prepare(f.ids, f.input.fixedSuites), /NATIVE_BEHAVIOR_SUITE_INVALID/);
  assert.equal(f.puts(), before);
});
