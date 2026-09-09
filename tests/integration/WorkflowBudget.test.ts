/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证预算超时传递、恢复不重置预算及小服务器模型排队取消。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createDomainKnowledgeInfrastructure } from '../../src/infrastructure/langgraph/Runtime.ts';
import { ModelProcessLane } from '../../src/infrastructure/agentAdapters/ModelProcessLane.ts';

test('workflow deadline aborts active work and cannot be refreshed by resume', async () => {
  let aborted = false;
  let entered!: () => void;
  const ready = new Promise<void>((resolve) => { entered = resolve; });
  const infrastructure = await createDomainKnowledgeInfrastructure({
    checkpoint: { kind: 'memory' }, prompts: { getPromptAddon: () => '' },
    observer: { record: () => {} },
    executor: { execute: async ({ signal }) => {
      entered();
      try { await delay(5_000, undefined, { signal }); }
      catch (error) { aborted = true; throw error; }
      return { detail: 'unreachable' };
    } },
  });
  await infrastructure.engine.start({ runId: 'deadline', maxIterations: 3, workerCount: 0, maxDurationMs: 200 });
  await ready;
  const before = await infrastructure.engine.status('deadline');
  const stopped = await infrastructure.engine.wait('deadline');
  assert.equal(aborted, true);
  assert.equal(stopped.executionStatus, 'STOPPED');
  assert.equal(stopped.error, 'WORKFLOW_BUDGET_EXHAUSTED');
  assert.equal(stopped.budget?.deadlineAt, before.budget?.deadlineAt);
  assert.equal((await infrastructure.engine.resume('deadline')).executionStatus, 'STOPPED');
  assert.equal((await infrastructure.engine.status('deadline')).budget?.remainingMs, 0);
  await assert.rejects(infrastructure.engine.start({ runId: 'oversized', maxIterations: 4, workerCount: 0 }), /WORKFLOW_ARGUMENT_INVALID/);
});

test('resume after failure uses original persisted deadline and stops when spent', async () => {
  const infrastructure = await createDomainKnowledgeInfrastructure({
    checkpoint: { kind: 'memory' }, prompts: { getPromptAddon: () => '' },
    observer: { record: () => {} }, executor: { execute: async () => { throw new Error('controlled'); } },
  });
  await infrastructure.engine.start({ runId: 'failed-budget', maxIterations: 1, workerCount: 0, maxDurationMs: 250 });
  const failed = await infrastructure.engine.wait('failed-budget');
  assert.equal(failed.executionStatus, 'FAILED');
  await delay(275);
  const stopped = await infrastructure.engine.resume('failed-budget');
  assert.equal(stopped.executionStatus, 'STOPPED');
  assert.equal((await infrastructure.engine.status('failed-budget')).budget?.deadlineAt, failed.budget?.deadlineAt);
});

test('one model process at a time and aborted queued work never starts', async () => {
  const lane = new ModelProcessLane();
  const controller = new AbortController();
  let active = 0;
  let peak = 0;
  const work = async () => { active++; peak = Math.max(peak, active); await delay(30); active--; };
  const first = lane.execute(work);
  const cancelled = lane.execute(async () => { assert.fail('cancelled queue entry ran'); }, controller.signal);
  const last = lane.execute(work);
  controller.abort();
  await assert.rejects(cancelled);
  await Promise.all([first, last]);
  assert.equal(peak, 1);
});
