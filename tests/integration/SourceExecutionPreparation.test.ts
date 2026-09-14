/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证来源任务冻结实际构建证据且旧任务不换身份或重置预算。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkbenchSourceVerification } from '../../src/application/services/WorkbenchSourceVerification.ts';
import type { WorkbenchEvaluation } from '../../src/application/services/WorkbenchEvaluation.ts';
import type { ArtifactRef } from '../../src/domain/Domain.ts';
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
    stages: { get: () => f.input.evaluation, store: { list: () => legacy ? [old] : [] } },
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
