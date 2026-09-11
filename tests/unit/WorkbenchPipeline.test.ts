/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证一键流程不能把部分成功或接口失败当作推进依据。
 */
import test from 'node:test';
import { sourceInput, sourceResult } from '../helpers/WorkbenchSourceFixture.ts';
import assert from 'node:assert/strict';
import { createPublication } from '../../src/domain/services/workbench/WorkbenchPublicationRecord.ts';
import { createArtifactRef } from '../../src/domain/Domain.ts';
import { assertPipelinePublication, createPipeline, pipelineFixedFailure, pipelineStageFailure, pipelineStagnant, pipelineSourceFailure, pipelineSourceStagnant } from '../../src/domain/services/workbench/WorkbenchPipeline.ts';
import { createStageTask, type WorkbenchStage, type StageResult } from '../../src/domain/services/workbench/StageTask.ts';
test('pipeline advancement requires successful artifacts and behavior, not just task completion', () => {
  const task = (stage: WorkbenchStage, summary: StageResult['summary']) => ({ ...createStageTask({ projectId: 'p', stage, sourceRevision: 'r', sourceDigest: 's', configurationDigest: 'c', cardVersionIds: [], parameters: {} }, {}, 'now'), status: 'SUCCEEDED' as const, result: { artifactRefs: [], summary } });
  assert.equal(pipelineStageFailure(task('GENERATE', { cards: [] })), 'PIPELINE_CARDS_MISSING');
  assert.equal(pipelineStageFailure(task('INDEX', { failed: 1 })), 'PIPELINE_INDEX_FAILED');
  assert.equal(pipelineStageFailure(task('FLYWHEEL', { modules: [{ interfaceComparison: { compatible: false } }] })), 'PIPELINE_INTERFACE_MISMATCH');
  assert.equal(pipelineStageFailure(task('EVALUATE', { completedModules: 1, requestedModules: 2, modules: [{ status: 'BEHAVIOR_PASSED', interfaceCompatible: true }] })), 'PIPELINE_BEHAVIOR_FAILED');
  assert.equal(pipelineStageFailure(task('EVALUATE', { completedModules: 1, requestedModules: 1, modules: [{ status: 'BEHAVIOR_FAILED', interfaceCompatible: true }] })), 'PIPELINE_BEHAVIOR_FAILED');
  assert.equal(pipelineStageFailure(task('ASSOCIATE', { relations: 0, scope: 'INTERNAL_ONLY' })), null);
});

test('regression and recovery to an old best cannot manufacture new behavior progress', () => {
  const rounds = (failures: string[][]) => failures.map((failed, index) => ({ number: index + 1, versionIds: [`v${index}`], progress: { failed, total: 6, passed: 6 - failed.length } }));
  assert.equal(pipelineStagnant(rounds([['a'], ['a', 'b'], ['a'], ['a', 'b']])), true);
  assert.equal(pipelineStagnant(rounds([['a', 'b', 'c', 'd'], ['a', 'b', 'c'], ['a', 'b'], ['a'], []])), false);
  assert.equal(pipelineStagnant(rounds([['a'], ['b'], ['c'], ['d']])), true);
});

test('source gate rejects missing versions and aggregate claims that contradict card findings', () => {
  const evaluation = createStageTask({ projectId: 'p', stage: 'EVALUATE', sourceRevision: 'r', sourceDigest: 's', configurationDigest: 'c', cardVersionIds: ['v1', 'v2'], parameters: { snapshotId: 's' } }, {}, 'now');
  const input = sourceInput(evaluation);
  const task = { ...createStageTask(input, {}, 'now'), status: 'SUCCEEDED' as const, result: sourceResult(input) };
  assert.equal(pipelineSourceFailure(task), null);
  assert.equal(pipelineSourceFailure({ ...task, result: sourceResult(input, 'SOURCE_MISMATCH') }), 'PIPELINE_SOURCE_MISMATCH');
  const wrong = sourceResult(input, 'UNRESOLVED'); wrong.summary.outcome = 'SOURCE_MATCHED';
  assert.equal(pipelineSourceFailure({ ...task, result: wrong }), 'PIPELINE_SOURCE_RESULT_INVALID');
  task.result.summary.cards = (task.result.summary.cards as unknown[]).slice(1) as never;
  assert.equal(pipelineSourceFailure(task), 'PIPELINE_SOURCE_RESULT_INVALID');
});
test('source progress tracks newly repaired sections, not body hashes or a three-round total', () => {
  const rounds = (paths: string[][]) => paths.map((sourceRepairs, i) => ({ number: i + 1, versionIds: [`changed-${i}`], sourceRepairs }));
  assert.equal(pipelineSourceStagnant(rounds([['A'], ['B'], ['C'], ['D'], ['E'], ['F']])), false);
  assert.equal(pipelineSourceStagnant(rounds([['A'], ['A'], ['A'], ['A']])), true);
  const behavior = [[], [], [], ['regression']].map((failed, i) => ({ number: i + 1, versionIds: [`v${i}`], progress: { failed, passed: 1 - failed.length, total: 1 } }));
  assert.equal(pipelineStagnant(behavior), false, 'completed behavior phases cannot consume the new regression retry allowance');
});

test('fixed pipeline gate checks full module counts, oracle success and reconstruction identity', () => {
  const task = { ...createStageTask({ projectId: 'p', stage: 'EVALUATE', sourceRevision: 'r', sourceDigest: 's', configurationDigest: 'c', cardVersionIds: ['v1'],
    parameters: { operation: 'FIXED_NATIVE_EVALUATION', fixedEvaluationContract: 'fixed-native-evaluation-v1', reconstructionTaskId: 'code', suiteRefs: { module: {} } } }, {}, 'now'),
    status: 'SUCCEEDED' as const, result: { artifactRefs: [], summary: { reconstructionTaskId: 'code', publicationVerified: false,
      modules: [{ moduleId: 'module', status: 'FIXED_PASSED', referencePassed: true, interfaceCompatible: true, passed: 2, total: 2 }] } } };
  assert.equal(pipelineFixedFailure(task, 'code'), null);
  assert.equal(pipelineFixedFailure(task, 'other-code'), 'PIPELINE_FIXED_RESULT_INVALID');
  task.result.summary.modules[0]!.passed = 1;
  assert.equal(pipelineFixedFailure(task, 'code'), 'PIPELINE_FIXED_FAILED');
  task.result.summary.modules[0]!.passed = 2; task.result.summary.modules[0]!.referencePassed = false;
  assert.equal(pipelineFixedFailure(task, 'code'), 'PIPELINE_FIXED_FAILED');
  task.result.summary.modules = [];
  assert.equal(pipelineFixedFailure(task, 'code'), 'PIPELINE_FIXED_RESULT_INVALID');
});

test('publication projection rejects uncommitted, other-version and old-contract records', () => {
  const ref = createArtifactRef(Buffer.from('evidence'), 'application/json');
  const input = { projectId: 'project', stage: 'GENERATE' as const, sourceRevision: 'r', sourceDigest: 's', configurationDigest: 'c', cardVersionIds: [], parameters: {} };
  const pipeline = createPipeline(input, 'now', 'environment', [], undefined, [{ moduleId: 'module', suiteRef: ref }]);
  const task = createStageTask({ ...input, cardVersionIds: ['v1'] }, {}, 'now');
  pipeline.iterations = [{ number: 1, versionIds: ['v1'], reconstruction: task, evaluation: task, fixedEvaluation: task, sourceVerification: task }];
  const record = createPublication({ projectId: 'project', versionIds: ['v1'], preparationRef: ref, files: [{ path: 'manifest.json', ref }] }, 'now');
  assert.throws(() => assertPipelinePublication(pipeline, record), /PIPELINE_PUBLICATION_BINDING_INVALID/);
  const committed = { ...record, status: 'COMMITTED' as const };
  assert.doesNotThrow(() => assertPipelinePublication(pipeline, committed));
  assert.throws(() => assertPipelinePublication({ ...pipeline, contractVersion: 'knowledge-pipeline-v14' }, committed), /PIPELINE_PUBLICATION_BINDING_INVALID/);
  assert.throws(() => assertPipelinePublication({ ...pipeline, publicationId: 'different' }, committed), /PIPELINE_PUBLICATION_BINDING_INVALID/);
  assert.throws(() => assertPipelinePublication({ ...pipeline, fixedSuites: [] }, committed), /PIPELINE_PUBLICATION_BINDING_INVALID/);
  const other = { ...createPublication({ projectId: 'project', versionIds: ['v2'], preparationRef: ref, files: [{ path: 'manifest.json', ref }] }, 'now'), status: 'COMMITTED' as const };
  assert.throws(() => assertPipelinePublication(pipeline, other), /PIPELINE_PUBLICATION_BINDING_INVALID/);
});
