/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证子任务并发上限、失败取消与等待语义。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { ConcurrentTasks } from '../../src/infrastructure/agentAdapters/ConcurrentTasks.ts';

test('task batch limits concurrency and preserves task ordering', async () => {
  let active = 0; let maximum = 0;
  const runner = new ConcurrentTasks(2);
  const results = await runner.run(Array.from({ length: 5 }, (_, index) => async () => {
    active++; maximum = Math.max(maximum, active);
    await new Promise<void>((resolve) => setImmediate(resolve));
    active--; return index;
  }));
  assert.equal(maximum, 2);
  assert.deepEqual(results, [0, 1, 2, 3, 4]);
});

test('a worker failure cancels in-flight peers and leaves queued tasks unstarted', async () => {
  let peerFinished = false; let queuedStarted = false;
  const error = new Error('extraction failed');
  await assert.rejects(new ConcurrentTasks(2).run([
    async () => { await new Promise<void>((resolve) => setImmediate(resolve)); throw error; },
    async (signal) => {
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
      await new Promise<void>((resolve) => setImmediate(resolve));
      peerFinished = true; return 'late output';
    },
    async () => { queuedStarted = true; return 'unreachable'; },
  ]), (received) => received === error);
  assert.equal(peerFinished, true);
  assert.equal(queuedStarted, false);
});

test('external cancellation wins over late successful outputs', async () => {
  const controller = new AbortController();
  await assert.rejects(new ConcurrentTasks().run([async () => {
    controller.abort(); return 'late success';
  }], controller.signal), /AGENT_CANCELLED/);
});
