/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证一键流程不能把部分成功或接口失败当作推进依据。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { pipelineStageFailure } from '../../src/domain/services/workbench/WorkbenchPipeline.ts';
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
