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
import { buildConstraints, createProjectSnapshot, type WorkbenchProjectSnapshot } from '../../src/domain/services/workbench/WorkbenchProject.ts';
import { sourceSectionObservations } from '../../src/domain/services/knowledge/KnowledgeSourceVerification.ts';
import type { NativeBehaviorSuite } from '../../src/domain/services/evaluation/NativeBehaviorSuite.ts';
import { nativeTestKeys, type NativeTestSet } from '../../src/domain/services/evaluation/NativeTestCache.ts';
import { canonicalJson, createStageTask } from '../../src/domain/services/workbench/StageTask.ts';
import { createPublicationPreparationFixture as setup } from '../helpers/PublicationPreparationFixture.ts';

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
