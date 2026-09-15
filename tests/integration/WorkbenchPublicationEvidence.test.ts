/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证发布准备重读卡片并拒绝缺失或被篡改的递归工件。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCE_EVIDENCE_POLICY } from '../../src/domain/knowledge/SourceEvidenceBindings.ts';
import { sha256, type ArtifactRef, type KnowledgeVersion } from '../../src/domain/Domain.ts';
import { WorkbenchSourceVerification } from '../../src/application/services/WorkbenchSourceVerification.ts';
import type { WorkbenchEvaluation } from '../../src/application/services/WorkbenchEvaluation.ts';
import type { StageExecutionContext } from '../../src/application/services/WorkbenchStages.ts';
import { WorkbenchPublicationEvidence } from '../../src/application/services/WorkbenchPublicationEvidence.ts';
import { JsonSchemaAgentContractValidator } from '../../src/infrastructure/agentAdapters/contracts/JsonSchemaAgentContractValidator.ts';
import { publicationFixture, publicationBody, publicationConfiguration, publicationApi } from '../helpers/WorkbenchPublicationFixture.ts';
import { buildConstraints, createProjectSnapshot, type WorkbenchProjectSnapshot } from '../../src/domain/workbench/WorkbenchProject.ts';
import { sourceSectionObservations } from '../../src/domain/knowledge/KnowledgeSourceVerification.ts';
import type { NativeBehaviorSuite } from '../../src/domain/evaluation/NativeBehaviorSuite.ts';
import { nativeTestKeys, type NativeTestSet } from '../../src/domain/evaluation/NativeTestCache.ts';
import { canonicalJson, createStageTask } from '../../src/domain/workbench/StageTask.ts';
import { createPublicationPreparationFixture as setup } from '../helpers/PublicationPreparationFixture.ts';

test('preparation checks recursive CAS graph, binds body and is content-idempotent', async () => {
  const f = await setup(); const prepared = await f.service.prepare(f.ids, f.input.fixedSuites);
  assert.equal(prepared.state, 'PREPARED'); assert.equal(prepared.publicationVerified, false);
  assert.equal(prepared.verifiedArtifactRefs.length, 21);
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
  await assert.rejects(f.service.prepare(f.ids, f.input.fixedSuites), /PUBLICATION_PROJECT_IDENTITY_CHANGED/);
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

test('explicit source digest bindings remain required even when replacement criteria have valid CAS hashes', async () => {
  const f = await setup({ sourceEvidencePolicy: SOURCE_EVIDENCE_POLICY });
  assert.equal((await f.service.prepare(f.ids, f.input.fixedSuites)).state, 'PREPARED');
  const section = f.sourceSections[0]!; const oldCriteria = section.criteriaRef, oldResult = section.reviewResultRef;
  const criteria = JSON.parse(f.contents.get(oldCriteria.sha256)!.toString('utf8'));
  criteria.sourceEvidenceBindings.sourceFiles[0].artifactRef = f.nestedRef;
  section.criteriaRef = await f.put(Buffer.from(JSON.stringify(criteria)), 'application/json');
  f.command.payload.criteriaRef = section.criteriaRef;
  const commandRef = await f.put(Buffer.from(JSON.stringify(f.command)), 'application/json');
  const envelope = JSON.parse(f.contents.get(oldResult.sha256)!.toString('utf8')); envelope.commandRef = commandRef;
  section.reviewResultRef = await f.put(Buffer.from(JSON.stringify(envelope)), 'application/json');
  f.input.sourceVerification.result!.artifactRefs = f.input.sourceVerification.result!.artifactRefs.map(ref => ref.sha256 === oldCriteria.sha256 ? section.criteriaRef : ref.sha256 === oldResult.sha256 ? section.reviewResultRef : ref);
  await assert.rejects(f.service.prepare(f.ids, f.input.fixedSuites), /PUBLICATION_SOURCE_DIGEST_BINDING_CHANGED/);
});


test('publication rechecks frozen execution scope against the actual trusted reference and Review', async () => {
  const f = await setup({ executionScope: true });
  const prepared = await f.service.prepare(f.ids, f.input.fixedSuites);
  assert.equal(prepared.state, 'PREPARED');
  const section = f.sourceSections[0]!;
  const criteria = JSON.parse(f.contents.get(section.criteriaRef.sha256)!.toString());
  assert.equal(criteria.executionScope.configurationCoverage, 'SINGLE_FROZEN_BUILD');
  criteria.executionScope.build.definitions = ['UNTESTED_MACRO'];
  section.criteriaRef = await f.put(Buffer.from(JSON.stringify(criteria)), 'application/json');
  f.input.sourceVerification.result!.artifactRefs.push(section.criteriaRef);
  await assert.rejects(f.service.prepare(f.ids, f.input.fixedSuites), /PUBLICATION_SOURCE_EXECUTION_CHANGED/);
});

test('publication rejects a cached PASS that discarded a prior format-failed correction across task attempts', async () => {
  const f = await setup();
  const preparedBeforeAudit = await f.service.prepare(f.ids, f.input.fixedSuites);
  const baselinePuts = f.puts();
  const failed = { schemaVersion: 'role-stage-v1', stage: 'evidence-attribution', attempt: 1,
    startedAt: 0, deadlineAt: 1000, status: 'FAILED', output: { blocking: false, recommendation: 'ITERATE', unresolvedRisks: [],
      correction: { correctionId: 'correction', knowledgePath: 'knowledge/module.md#Purpose', criterion: 'Declaration differs', risk: 'Wrong implementation location', replacementMarkdown: '### Detail\nOnly a fragment' } } };
  const passed = { ...failed, status: 'PASSED', output: { blocking: false, recommendation: 'PASS', unresolvedRisks: [], correction: null } };
  const events = [failed, passed].map((record, i) => {
    const bytes = Buffer.from(JSON.stringify(record)); const digest = sha256(bytes); f.contents.set(digest, bytes);
    return { sequence: i + 1, taskId: f.ids.sourceVerification, kind: 'PROGRESS', createdAt: '2026-09-14T00:00:00Z',
      detail: { phase: 'role-stage-attempt', role: 'review', key: 'final-source:version:section', taskAttempt: i + 1,
        stage: record.stage, attempt: record.attempt, status: record.status,
        artifactRef: { artifactId: `sha256:${digest}`, sha256: digest, mediaType: 'application/json', size: bytes.length } } };
  });
  f.service.dependencies.stages.store.events = () => events;
  await assert.rejects(f.service.prepare(f.ids, f.input.fixedSuites), /REVIEW_REPAIR_FACTS_CHANGED/);
  assert.equal(f.puts(), baselinePuts);
  await assert.rejects(f.service.verifyResume(preparedBeforeAudit.artifactRef), /REVIEW_REPAIR_FACTS_CHANGED/);
  const source = new WorkbenchSourceVerification({ dependencies: { artifacts: f.service.dependencies.artifacts,
    stages: f.service.dependencies.stages } } as unknown as WorkbenchEvaluation);
  let cachedReads = 0;
  await assert.rejects(source.verify({ task: f.input.sourceVerification, step: async () => { cachedReads++; throw new Error('must not reuse cached card'); } } as unknown as StageExecutionContext), /REVIEW_REPAIR_FACTS_CHANGED/);
  assert.equal(cachedReads, 0);
  const before = events.map(e => e.detail.artifactRef.sha256);
  await assert.rejects(f.service.prepare(f.ids, f.input.fixedSuites), /REVIEW_REPAIR_FACTS_CHANGED/);
  assert.deepEqual(events.map(e => e.detail.artifactRef.sha256), before);
});

test('source audit retains rejected fact changes but never promotes them to accepted history', async () => {
  const { assertSourceReviewHistory } = await import('../../src/application/services/WorkbenchSourceFindingHistory.ts');
  const f = await setup();
  const output = { blocking: false, recommendation: 'ITERATE', unresolvedRisks: ['Still unknown'],
    correction: { correctionId: 'original', knowledgePath: 'knowledge/module.md#Purpose', criterion: 'Wrong location', risk: 'Wrong source', replacementMarkdown: '### Fragment' } };
  const records = [
    { status: 'REJECTED', output, issue: { code: 'REVIEW_CORRECTION_RANGE_INVALID', field: 'correction.replacementMarkdown', hint: 'Complete the section' } },
    { status: 'REJECTED', output: { blocking: false, recommendation: 'PASS', correction: null, unresolvedRisks: [] }, issue: { code: 'REVIEW_REPAIR_FACTS_CHANGED', field: 'correction.replacementMarkdown', hint: 'Keep original facts' } },
    { status: 'PASSED', output: { ...output, correction: { ...output.correction, replacementMarkdown: '## Purpose\nComplete' } }, issue: undefined },
  ];
  const events = await Promise.all(records.map(async (record, index) => ({ sequence: index + 1, taskId: f.ids.sourceVerification, kind: 'PROGRESS', createdAt: 'now',
    detail: { phase: 'role-stage-attempt', role: 'review', key: 'final-source:version:section', taskAttempt: index + 1,
      stage: 'evidence-attribution', attempt: 1, status: record.status, issueCode: record.issue?.code ?? null,
      artifactRef: { ...await f.put(Buffer.from(JSON.stringify({ ...record, schemaVersion: 'role-stage-v1', stage: 'evidence-attribution', attempt: 1, startedAt: 0, deadlineAt: 1 })), 'application/json') } } })));
  const before = structuredClone(events);
  await assertSourceReviewHistory(f.service.dependencies.artifacts, events);
  assert.deepEqual(events, before);
  events[1]!.detail.issueCode = null;
  await assert.rejects(assertSourceReviewHistory(f.service.dependencies.artifacts, events), /REVIEW_REPAIR_FACTS_CHANGED/);
  events[1]!.detail.issueCode = 'REVIEW_REPAIR_FACTS_CHANGED';
  const record = { ...records[1], status: 'PASSED', schemaVersion: 'role-stage-v1', stage: 'evidence-attribution', attempt: 1, startedAt: 0, deadlineAt: 1 };
  events[1]!.detail.status = 'PASSED';
  events[1]!.detail.artifactRef = await f.put(Buffer.from(JSON.stringify(record)), 'application/json');
  await assert.rejects(assertSourceReviewHistory(f.service.dependencies.artifacts, events), /REVIEW_REPAIR_FACTS_CHANGED/);
});


async function supplementalPublicationFixture(supplied: boolean, missing = false) {
  const f = await setup();
  const { workbenchSupplementDemand } = await import('../../src/application/services/WorkbenchEvaluation.ts');
  const { nativeTestKeys, nativeTestPolicyDigest } = await import('../../src/domain/evaluation/NativeTestCache.ts');
  const { nativeSupplementTargets } = await import('../../src/domain/evaluation/NativeSupplementTargets.ts');
  const previousEvaluation = structuredClone(f.input.evaluation), previousSource = structuredClone(f.input.sourceVerification);
  previousSource.taskId = 'prior-source';
  const finding = (previousSource.result!.summary.cards as any[])[0];
  finding.outcome = 'UNRESOLVED'; finding.sections[0].outcome = 'UNRESOLVED'; finding.sections[0].unresolved = ['Boundary evidence needed'];
  const get = f.service.dependencies.stages.get;
  f.service.dependencies.stages.get = id => id === previousSource.taskId ? previousSource : id === previousEvaluation.taskId ? previousEvaluation : get(id);
  const demand = await workbenchSupplementDemand(f.service.dependencies, previousSource.taskId, f.ids.reconstruction);
  const demandRef = await f.put(Buffer.from(canonicalJson(demand)), 'application/json');
  const targets = nativeSupplementTargets(demand.demands.map(item => item.sectionId));
  const params = f.input.evaluation.input.parameters;
  Object.assign(params, { supplementContract: 'knowledge-test-supplement-v1', sourceVerificationTaskId: previousSource.taskId, supplementRef: demandRef, supplementTargets: targets });
  let candidateRef: any;
  if (supplied) {
    const suite = JSON.parse(Buffer.from(await f.service.dependencies.artifacts.get(f.set.suiteRef)).toString());
    suite.cases.forEach((item: any) => { item.sections = ['card#Value']; });
    f.set.suiteRef = await f.put(Buffer.from(JSON.stringify(suite)), 'application/json');
    f.trustedReport.cases.forEach((item: any, index: number) => { item.input = suite.cases[index]; });
    const { sourceSectionObservations } = await import('../../src/domain/knowledge/KnowledgeSourceVerification.ts');
    const oracle = JSON.parse(Buffer.from(await f.service.dependencies.artifacts.get(f.set.oracleRef)).toString());
    const observations = { ...f.sourceObservations, suiteRef: f.set.suiteRef, ...sourceSectionObservations(suite, oracle, 'card', 'Value') };
    const observationsRef = await f.put(Buffer.from(JSON.stringify(observations)), 'application/json');
    const oldObservationsRef = f.sourceSections[0]!.referenceObservationsRef;
    f.sourceSections[0]!.referenceObservationsRef = observationsRef;
    f.command.payload.evaluationReportRef = observationsRef;
    f.input.sourceVerification.result!.artifactRefs = f.input.sourceVerification.result!.artifactRefs.map(ref => ref.sha256 === oldObservationsRef.sha256 ? observationsRef : ref);
    if (missing) suite.cases[0].description = 'A supplied case absent from the accepted suite';
    candidateRef = await f.put(Buffer.from(canonicalJson({ schemaVersion: 'native-supplied-candidates-v1', modules: [{ moduleId: 'module', suite }] })), 'application/json');
    params.suppliedCandidatesRef = candidateRef;
    f.input.evaluation.result!.artifactRefs.push(candidateRef);
  }
  const originalPolicy = f.set.binding.policyDigest;
  f.set.binding.policyDigest = nativeTestPolicyDigest(originalPolicy, { schemaVersion: 'native-supplement-v1', targets,
    demandDigest: candidateRef ? sha256(canonicalJson({ demandDigest: demand.demandDigest, suppliedCandidatesDigest: candidateRef.sha256 })) : demand.demandDigest });
  Object.assign(f.set, nativeTestKeys(f.set.binding));
  f.set.testSetId = `native-tests-${sha256(`${f.set.cacheKey}:${f.set.suiteRef.sha256}:${f.set.oracleRef.sha256}`)}`;
  f.trustedReport.testSetId = f.set.testSetId;
  const reportRef = await f.put(Buffer.from(JSON.stringify(f.trustedReport)), 'application/json');
  f.input.evaluation.result!.artifactRefs = [reportRef, ...(candidateRef ? [candidateRef] : [])];
  Object.assign((f.input.evaluation.result!.summary.modules as any[])[0], { testSetId: f.set.testSetId, reportRef });
  const evaluationIdentity = createStageTask(f.input.evaluation.input, {}, 'now');
  Object.assign(f.input.evaluation, { taskId: evaluationIdentity.taskId, inputDigest: evaluationIdentity.inputDigest });
  f.ids.evaluation = evaluationIdentity.taskId;
  Object.assign(f.input.sourceVerification.input.parameters, { evaluationTaskId: f.ids.evaluation, evaluationDigest: sha256(canonicalJson(f.input.evaluation.result)) });
  f.input.sourceVerification.result!.summary.evaluationTaskId = f.ids.evaluation;
  const sourceIdentity = createStageTask(f.input.sourceVerification.input, {}, 'now');
  Object.assign(f.input.sourceVerification, { taskId: sourceIdentity.taskId, inputDigest: sourceIdentity.inputDigest }); f.ids.sourceVerification = sourceIdentity.taskId;
  f.command.runId = sourceIdentity.taskId;
  const commandRef = await f.put(Buffer.from(JSON.stringify(f.command)), 'application/json');
  const oldRef = f.sourceSections[0]!.reviewResultRef;
  const envelope = JSON.parse(Buffer.from(await f.service.dependencies.artifacts.get(oldRef)).toString());
  envelope.runId = sourceIdentity.taskId; envelope.commandRef = commandRef;
  const resultRef = await f.put(Buffer.from(JSON.stringify(envelope)), 'application/json');
  f.sourceSections[0]!.reviewResultRef = resultRef;
  f.input.sourceVerification.result!.artifactRefs = f.input.sourceVerification.result!.artifactRefs.map(ref => ref.sha256 === oldRef.sha256 ? resultRef : ref);
  return { f, previousSource, originalPolicy };
}
for (const supplied of [false, true]) test(`publication retains reference-validated supplement policy (supplied=${supplied})`, async () => {
  const { f, previousSource, originalPolicy } = await supplementalPublicationFixture(supplied);
  assert.equal((await f.service.prepare(f.ids, f.input.fixedSuites)).state, 'PREPARED');
  f.set.binding.policyDigest = originalPolicy;
  await assert.rejects(f.service.prepare(f.ids, f.input.fixedSuites), /PUBLICATION_TEST_POLICY_CHANGED/);
  previousSource.result!.summary.cards = [];
  await assert.rejects(f.service.prepare(f.ids, f.input.fixedSuites), /NATIVE_SUPPLEMENT|SOURCE_VERIFICATION|PUBLICATION_TEST_POLICY/);
});

test('publication refuses a supplied candidate absent from the accepted trusted suite', async () => {
  const { f } = await supplementalPublicationFixture(true, true);
  await assert.rejects(f.service.prepare(f.ids, f.input.fixedSuites), /PUBLICATION_SUPPLIED_CANDIDATES_MISSING/);
});


test('explicit historical reassessment publishes only with a bound rebuttal and rechecks original evidence on resume', async () => {
  const f = await setup();
  const { historicalReviewConcern } = await import('../../src/domain/knowledge/SourceReviewPolicy.ts');
  const original = structuredClone(f.input.sourceVerification);
  const section = f.sourceSections[0]!;
  const load = async (ref: any) => JSON.parse(Buffer.from(await f.service.dependencies.artifacts.get(ref)).toString());
  const correction = { correctionId: 'COR-0001', knowledgePath: 'knowledge/knowledge-unit.md#Value', criterion: 'The reference does not define value.', risk: 'Wrong interface claim.' };
  const oldRaw = { recommendation: 'ITERATE', blocking: true, correction, unresolvedRisks: [] };
  const oldRawRef = await f.put(Buffer.from(JSON.stringify(oldRaw)), 'application/json');
  const oldEnvelope = await load(section.reviewResultRef);
  oldEnvelope.rawOutputRef = oldRawRef; oldEnvelope.outputRefs = [oldRawRef];
  oldEnvelope.payload.corrections = [{ ...correction, evidenceRefs: [section.referenceRef] }];
  const oldResultRef = await f.put(Buffer.from(JSON.stringify(oldEnvelope)), 'application/json');
  const finding: any = { ...section, outcome: 'SOURCE_MISMATCH', reviewRef: oldRawRef, reviewResultRef: oldResultRef };
  const checkpoint = { key: `source-section:version:${sha256('Value').slice(0,24)}`, result: {
    artifactRefs: [f.card.bodyRef, oldRawRef, oldResultRef, section.referenceRef, section.referenceObservationsRef, section.criteriaRef], summary: finding,
  } };
  const proof = { taskId: original.taskId, checkpointKey: checkpoint.key, checkpointDigest: sha256(canonicalJson(checkpoint.result)) };
  const proofRef = await f.put(Buffer.from(JSON.stringify([proof])), 'application/json');
  const concern = historicalReviewConcern(proof, finding, oldRaw as any);
  const { versionId: _version, heading: _heading, ...promptConcern } = concern;
  const criteria = await load(section.criteriaRef); criteria.pendingReviewConcerns = [promptConcern];
  section.criteriaRef = await f.put(Buffer.from(JSON.stringify(criteria)), 'application/json');
  const raw = { recommendation: 'PASS', blocking: false, correction: null, concernResolutions: [{ concernId: concern.concernId, disposition: 'DISPROVED', reason: 'The fixed source defines the function explicitly.', sourceQuotes: [{ path: 'module.c', quote: 'int value(void) { return 1; }' }] }] };
  section.reviewRef = await f.put(Buffer.from(JSON.stringify(raw)), 'application/json');
  Object.assign(f.input.sourceVerification.input.parameters, { historicalReviewPolicy: 'source-historical-review-v1', priorFindingsRef: proofRef });
  const identity = createStageTask(f.input.sourceVerification.input, {}, 'now');
  Object.assign(f.input.sourceVerification, { taskId: identity.taskId, inputDigest: identity.inputDigest }); f.ids.sourceVerification = identity.taskId;
  f.command.runId = identity.taskId; f.command.payload.criteriaRef = section.criteriaRef;
  const commandRef = await f.put(Buffer.from(JSON.stringify(f.command)), 'application/json');
  const envelope = await load(section.reviewResultRef);
  Object.assign(envelope, { runId: identity.taskId, commandRef, rawOutputRef: section.reviewRef, outputRefs: [section.reviewRef] });
  section.reviewResultRef = await f.put(Buffer.from(JSON.stringify(envelope)), 'application/json');
  f.input.sourceVerification.result!.artifactRefs.push(proofRef, section.criteriaRef, section.reviewRef, section.reviewResultRef);
  const get = f.service.dependencies.stages.get;
  f.service.dependencies.stages.get = id => id === original.taskId ? original : get(id);
  f.service.dependencies.stages.store.checkpoints = () => [checkpoint] as any;
  const prepared = await f.service.prepare(f.ids, f.input.fixedSuites);
  assert.equal(prepared.state, 'PREPARED');
  await f.service.verifyResume(prepared.artifactRef);
  checkpoint.result.summary.bodyDigest = sha256('changed');
  await assert.rejects(f.service.verifyResume(prepared.artifactRef), /SOURCE_HISTORY_BINDING_INVALID/);
  await assert.rejects(f.service.prepare(f.ids, f.input.fixedSuites), /SOURCE_HISTORY_BINDING_INVALID/);
});
