/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证业务阶段保留时执行失败、预算和恢复权限的只读投影。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { presentRunExecution, stageRecoveryBlock } from '../../src/application/services/RunExecutionPresentation.ts';
import { createEvent } from '../../src/domain/Domain.ts';
import type { WorkflowExecutionView } from '../../src/application/ports/ApplicationPorts.ts';

const failed: WorkflowExecutionView = {
  runId: 'run-failed', executionStatus: 'FAILED', currentNode: 'doc_worker', iteration: 0, maxIterations: 3,
  route: 'FAILED', error: 'DOC_WORKER_SOURCE_EVIDENCE_INVALID: secret-provider-response',
  budget: { startedAt: '2026-09-09T00:00:00.000Z', deadlineAt: '2026-09-09T00:30:00.000Z', maxDurationMs: 1_800_000, remainingMs: 900_000 },
};

test('stage attempts and deadlines prevent a misleading resume action while accepted attempts remain reusable', () => {
  const event = (attempt: number, status: string, deadlineAt = 200) => createEvent('run-failed', 'ArtifactCommitted', {
    kind: 'role-stage-attempt', generationKey: 'worker', stage: 'extract', attempt, status, deadlineAt,
  }, '2026-09-09T00:00:00.000Z');
  const rejected = [event(1, 'REJECTED'), event(2, 'REJECTED')];
  assert.equal(stageRecoveryBlock(rejected, 100), 'STAGE_ATTEMPTS_EXHAUSTED');
  assert.equal(presentRunExecution('GENERATING', failed, true, stageRecoveryBlock(rejected, 100)).recovery.canResume, false);
  assert.equal(stageRecoveryBlock([event(1, 'FAILED', 90)], 100), 'STAGE_BUDGET_EXHAUSTED');
  assert.equal(stageRecoveryBlock([event(1, 'STARTED'), event(1, 'PASSED')], 300), undefined);
});

test('recoverable execution failure remains distinct from business GENERATING and leaks no raw error', () => {
  const input = structuredClone(failed);
  const projected = presentRunExecution('GENERATING', input, true);
  assert.equal(projected.executionStatus, 'FAILED');
  assert.equal(projected.isActive, false);
  assert.equal(projected.canCancel, false);
  assert.deepEqual(projected.recovery, { canResume: true, reasonCode: 'RECOVERABLE' });
  assert.deepEqual(projected.executionFailure, { code: 'DOC_WORKER_SOURCE_EVIDENCE_INVALID', nodeId: 'doc_worker' });
  assert.equal(JSON.stringify(projected).includes('secret-provider-response'), false);
  assert.deepEqual(input, failed);
});

test('resume availability honors the original budget, configuration and failed node', () => {
  assert.deepEqual(presentRunExecution('GENERATING', failed, false).recovery,
    { canResume: false, reasonCode: 'RUN_CONFIGURATION_INCOMPATIBLE' });
  assert.equal(presentRunExecution('GENERATING', { ...failed, budget: { ...failed.budget!, remainingMs: 0 } }, true).recovery.reasonCode, 'BUDGET_EXHAUSTED');
  assert.equal(presentRunExecution('GENERATING', { ...failed, budget: undefined }, true).recovery.reasonCode, 'BUDGET_UNAVAILABLE');
  assert.equal(presentRunExecution('GENERATING', { ...failed, currentNode: null }, true).recovery.reasonCode, 'FAILED_NODE_UNAVAILABLE');
  assert.equal(presentRunExecution('CANCELLED', failed, true).recovery.reasonCode, 'BUSINESS_TERMINAL');
});

test('only an active execution can be counted or cancelled; historical nodes are irrelevant', () => {
  const active = presentRunExecution('GENERATING', { ...failed, executionStatus: 'RUNNING', error: null, route: null }, true);
  assert.equal(active.isActive, true); assert.equal(active.canCancel, true); assert.equal(active.recovery.canResume, false);
  for (const executionStatus of ['FAILED', 'COMPLETED', 'STOPPED', 'CANCELLED'] as const) {
    const projected = presentRunExecution('GENERATING', { ...failed, executionStatus }, true);
    assert.equal(projected.isActive, false); assert.equal(projected.canCancel, false);
  }
  for (const status of ['NOT_TRACKED', 'UNAVAILABLE'] as const) {
    const projected = presentRunExecution('GENERATING', status);
    assert.equal(projected.isActive, false); assert.equal(projected.canCancel, false); assert.equal(projected.recovery.canResume, false);
  }
});

test('unstructured failures and untrusted node identifiers are not echoed into read projections', () => {
  const result = presentRunExecution('GENERATING', { ...failed, error: 'https://private.example/?apiKey=secret', currentNode: 'bad<script>' }, true);
  assert.deepEqual(result.executionFailure, { code: 'WORKFLOW_EXECUTION_FAILED', nodeId: null });
  assert.equal(result.recovery.reasonCode, 'FAILED_NODE_UNAVAILABLE');
});
