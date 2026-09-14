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
