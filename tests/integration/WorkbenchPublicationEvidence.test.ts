/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证发布准备重读卡片并拒绝缺失或被篡改的递归工件。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256, type ArtifactRef, type KnowledgeVersion } from '../../src/domain/Domain.ts';
import { WorkbenchPublicationEvidence } from '../../src/application/services/WorkbenchPublicationEvidence.ts';
import { publicationFixture } from '../helpers/WorkbenchPublicationFixture.ts';
import { nativeTestKeys, type NativeTestSet } from '../../src/domain/services/evaluation/NativeTestCache.ts';
import { canonicalJson, createStageTask } from '../../src/domain/services/workbench/StageTask.ts';
async function setup() {
  const input = publicationFixture(); const contents = new Map<string, Buffer>(); let puts = 0;
  const put = async (data: Uint8Array, mediaType: string): Promise<ArtifactRef> => {
    puts++; const buffer = Buffer.from(data); const digest = sha256(buffer); contents.set(digest, buffer);
    return { artifactId: `sha256:${digest}`, sha256: digest, size: buffer.length, mediaType };
  };
  await put(Buffer.from('{"files":[]}'), 'application/json');
  const fingerprintRef = await put(Buffer.from(JSON.stringify({ digest: sha256('toolchain') })), 'application/json');
  const bodyRef = await put(Buffer.from('body'), 'text/markdown');
  const nestedRef = await put(Buffer.from('audit'), 'text/plain');
  const suite = { schemaVersion: 'native-cases-v1', cases: ['a', 'b'].map(caseId => ({ caseId, description: 'value', sections: ['card#value'], variables: [], calls: [],
    observations: [{ name: 'value', kind: 'integer', read: { variable: 'value' } }], expected: { value: '1' } })) };
  const suiteRef = await put(Buffer.from(JSON.stringify(suite)), 'application/json');
  input.fixedSuites[0]!.suiteRef = suiteRef; input.fixedEvaluation.input.parameters.suiteRefs = { module: { ...suiteRef } };
  const identity = createStageTask(input.fixedEvaluation.input, input.fixedEvaluation.limits, 'now');
  input.fixedEvaluation.taskId = identity.taskId; input.fixedEvaluation.inputDigest = identity.inputDigest;
  const observations = suite.cases.map(test => ({ caseId: test.caseId, status: 'PASSED', actual: { value: '1' },
    report: { build: { exitCode: 0, timedOut: false, outputLimitExceeded: false }, execution: { exitCode: 0, timedOut: false, outputLimitExceeded: false } } }));
  const report = { schemaVersion: 'fixed-native-evaluation-v1', status: 'FIXED_PASSED', moduleId: 'module', reconstructionTaskId: input.reconstruction.taskId,
    snapshotId: 'snapshot', sourceDigest: input.reconstruction.input.sourceDigest, suiteRef, fingerprintRef,
    codeRef: (input.reconstruction.result!.summary.modules as Array<Record<string, unknown>>)[0]!.codeRef,
    cardVersionIds: ['version'], cards: [{ cardId: 'card', versionId: 'version', bodyRef }], reference: observations, generated: structuredClone(observations), nestedRef };
  const reportRef = await put(Buffer.from(JSON.stringify(report)), 'application/json');
  input.fixedEvaluation.result!.artifactRefs = [reportRef];
  (input.fixedEvaluation.result!.summary.modules as Array<Record<string, unknown>>)[0]!.reportRef = reportRef;
  const referenceRef = await put(Buffer.from('{"files":[]}'), 'application/json');
  const oracleRef = await put(Buffer.from(JSON.stringify(observations)), 'application/json');
  const binding = { cardIds: ['card'], knowledgeBodyDigests: [bodyRef.sha256], referenceDigest: referenceRef.sha256,
    interfaceDigest: sha256('interface'), policyDigest: sha256('policy'), toolchainDigest: sha256('toolchain') };
  const keys = nativeTestKeys(binding);
  const set: NativeTestSet = { ...keys, binding, testSetId: `native-tests-${sha256(`${keys.cacheKey}:${suiteRef.sha256}:${oracleRef.sha256}`)}`,
    parentTestSetId: null, originVersionIds: ['version'], projectSnapshotId: 'snapshot', sourceRevision: 'commit', status: 'TRUSTED',
    suiteRef, oracleRef, referenceRef, fingerprintRef, sectionBindings: [], createdAt: 'now' };
  const generatedRef = await put(Buffer.from(JSON.stringify({ language: 'c', files: [] })), 'application/json');
  const trustedReport = { schemaVersion: 'native-evaluation-v1', testSetId: set.testSetId, generatedRef, generatedDigest: generatedRef.sha256,
    total: 2, passed: 2, allPassed: true, cases: observations.map((item, index) => ({ ...item, input: suite.cases[index], expected: suite.cases[index]!.expected })) };
  const trustedReportRef = await put(Buffer.from(JSON.stringify(trustedReport)), 'application/json');
  input.evaluation.result!.artifactRefs = [trustedReportRef];
  Object.assign((input.evaluation.result!.summary.modules as Array<Record<string, unknown>>)[0]!, { testSetId: set.testSetId, reportRef: trustedReportRef });
  input.sourceVerification.input.parameters.evaluationDigest = sha256(canonicalJson(input.evaluation.result));
  const sourceIdentity = createStageTask(input.sourceVerification.input, {}, 'now');
  input.sourceVerification.taskId = sourceIdentity.taskId; input.sourceVerification.inputDigest = sourceIdentity.inputDigest;
  const records = [input.reconstruction, input.evaluation, input.fixedEvaluation, input.sourceVerification];
  const card = { versionId: 'version', bodyRef, metadata: { cardId: 'card', sourceModule: 'module', projectSnapshotId: 'snapshot' } } as unknown as KnowledgeVersion;
  const service = new WorkbenchPublicationEvidence({ tests: { get: id => id === set.testSetId ? structuredClone(set) : null }, stages: { get(id) { const task = records.find(task => task.taskId === id); assert.ok(task); return structuredClone(task); } },
    repository: { getKnowledgeVersion: () => structuredClone(card) }, artifacts: {
      put, get: async ref => { const value = contents.get(ref.sha256); assert.ok(value); return value; },
      verify: async ref => { const data = contents.get(ref.sha256); return Boolean(data && data.length === ref.size && sha256(data) === ref.sha256); },
    } });
  puts = 0;
  const ids = { reconstruction: input.reconstruction.taskId, evaluation: input.evaluation.taskId, fixedEvaluation: input.fixedEvaluation.taskId, sourceVerification: input.sourceVerification.taskId };
  return { service, ids, input, contents, nestedRef, card, report, set, trustedReport, put, puts: () => puts };
}
test('preparation checks recursive CAS graph, binds body and is content-idempotent', async () => {
  const f = await setup(); const prepared = await f.service.prepare(f.ids, f.input.fixedSuites);
  assert.equal(prepared.state, 'PREPARED'); assert.equal(prepared.publicationVerified, false);
  assert.equal(prepared.verifiedArtifactRefs.length, 9);
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
