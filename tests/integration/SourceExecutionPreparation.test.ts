/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证来源任务冻结实际构建证据且旧任务不换身份或重置预算。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkbenchSourceVerification } from '../../src/application/services/WorkbenchSourceVerification.ts';
import type { WorkbenchEvaluation } from '../../src/application/services/WorkbenchEvaluation.ts';
import { WorkbenchSourceFindingHistory } from '../../src/application/services/WorkbenchSourceFindingHistory.ts';
import { sha256, type ArtifactRef } from '../../src/domain/Domain.ts';
import { createPublicationPreparationFixture } from '../helpers/PublicationPreparationFixture.ts';
async function setup(legacy = false) {
  const f = await createPublicationPreparationFixture({ executionScope: true });
  f.input.evaluation.input.parameters.configurationRef = f.input.reconstruction.input.parameters.configurationRef!;
  const old = structuredClone(f.input.sourceVerification);
  delete old.input.parameters.sourceExecutionPolicy; delete old.input.parameters.executionScopesRef;
  old.input.parameters.evaluationTaskId = f.ids.evaluation;
  old.usage.modelCalls = 7;
  const dependencies = {
    artifacts: f.service.dependencies.artifacts,
    stages: { get: () => f.input.evaluation, store: { list: () => legacy ? [old] : [], events: () => [], checkpoints: () => [] } },
    projects: { get: () => f.project },
    evaluation: { dependencies: { store: { get: () => f.set } } },
    configuration: { assertStageCompatible: async () => {} },
  };
  const evaluation = { dependencies, revisionEvidence: async () => ({ modules: [{ moduleId: 'module', testSetId: f.set.testSetId }] }) } as unknown as WorkbenchEvaluation;
  return { f, old, service: new WorkbenchSourceVerification(evaluation) };
}
test('new source task freezes verified build scope and its immutable artifact references', async () => {
  const { f, service } = await setup();
  const input = await service.prepare(f.ids.evaluation);
  assert.equal(input.parameters.sourceExecutionPolicy, 'source-execution-scope-v1');
  assert.equal(input.parameters.sourceAssessmentPolicy, 'source-assessment-v1');
  const ref = input.parameters.executionScopesRef as unknown as ArtifactRef;
  assert.equal(await f.service.dependencies.artifacts.verify(ref), true);
  const scopes = JSON.parse(Buffer.from(await f.service.dependencies.artifacts.get(ref)).toString());
  assert.equal(scopes[0].scope.testSetId, f.set.testSetId);
  assert.deepEqual(scopes[0].scope.build, f.project.build);
  assert.deepEqual(scopes[0].scope.referenceRef, f.set.referenceRef);
  assert.equal(scopes[0].scope.allMacroCombinationsVerified, false);
  assert.deepEqual(await service.prepare(f.ids.evaluation), input);
});
test('existing source task retains legacy input and consumed usage instead of an automatic upgrade', async () => {
  const { f, old, service } = await setup(true);
  assert.deepEqual(await service.prepare(f.ids.evaluation), old.input);
  assert.equal(old.usage.modelCalls, 7);
  assert.equal(old.input.parameters.sourceAssessmentPolicy, undefined);
  assert.equal(old.input.parameters.sourceExecutionPolicy, undefined);
});
test('corrupt toolchain evidence stops preparation before a new source task is created', async () => {
  const { f, service } = await setup();
  f.contents.set(f.set.fingerprintRef.sha256, Buffer.from('corrupt'));
  await assert.rejects(service.prepare(f.ids.evaluation), /STAGE_ARTIFACT_CORRUPT/);
});

test('v5 starts separately from an immutable v4 source task', async () => {
  const { f, old, service } = await setup(true);
  old.input.parameters.verificationContract = 'knowledge-source-verification-v4';
  const before = structuredClone(old);
  const input = await service.prepare(f.ids.evaluation);
  assert.equal(input.parameters.verificationContract, 'knowledge-source-verification-v5');
  assert.ok(input.parameters.pendingConcernsRef);
  assert.deepEqual(old, before);
  assert.equal(old.usage.modelCalls, 7);
});

test('failed review clues bind the original event, immutable card version and wording', async () => {
  const { f } = await setup();
  const source = f.input.sourceVerification;
  const record = { schemaVersion: 'role-stage-v1', stage: 'evidence-attribution', attempt: 1, status: 'FAILED', output: {
    blocking: false, recommendation: 'ITERATE', correction: { correctionId: 'c', knowledgePath: 'knowledge/knowledge-unit.md#Value', criterion: 'Wrong declaration location', risk: 'Reader looks in wrong file', replacementMarkdown: '### Fragment' } } };
  const rawRef = await f.put(Buffer.from(JSON.stringify(record)), 'application/json');
  const event = { sequence: 1, taskId: source.taskId, kind: 'PROGRESS', createdAt: 'now', detail: { phase: 'role-stage-attempt', role: 'review', key: `final-source:version:${sha256('Value').slice(0,24)}`, taskAttempt: 1, stage: record.stage, attempt: 1, status: 'FAILED', artifactRef: rawRef } };
  const history = new WorkbenchSourceFindingHistory({ dependencies: { artifacts: f.service.dependencies.artifacts, repository: f.service.dependencies.repository,
    stages: { get: () => source, store: { list: () => [source], events: () => [event] } } } } as unknown as WorkbenchEvaluation);
  const concerns = await history.collectConcerns(f.input.evaluation);
  assert.equal(concerns.length, 1); assert.equal(concerns[0]!.criterion, 'Wrong declaration location');
  await history.validateConcerns(concerns, f.input.evaluation.input);
  await assert.rejects(history.validateConcerns([{ ...concerns[0]!, criterion: 'Changed wording' }], f.input.evaluation.input), /SOURCE_CONCERN_BINDING_INVALID/);
  await assert.rejects(history.validateConcerns(concerns, { ...f.input.evaluation.input, cardVersionIds: [] }), /SOURCE_CONCERN_BINDING_INVALID/);
  f.contents.set(rawRef.sha256, Buffer.from('corrupted'));
  await assert.rejects(history.validateConcerns(concerns, f.input.evaluation.input), /SOURCE_HISTORY_ARTIFACT_INVALID/);
});
