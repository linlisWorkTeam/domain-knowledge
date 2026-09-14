/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：执行有界并发任务并传播批次取消。
 */
import type { TaskBatchRunner } from '../../application/ports/ApplicationPorts.ts';

/** 并发上限属于执行配置，业务任务的数量及内容由调用方决定。 */
export class ConcurrentTasks implements TaskBatchRunner {
  readonly concurrency: number;
  constructor(concurrency = 3) {
    if (!Number.isSafeInteger(concurrency) || concurrency < 1) throw new Error('TASK_CONCURRENCY_INVALID');
    this.concurrency = concurrency;
  }
  async run<T>(tasks: Array<(signal: AbortSignal) => Promise<T>>, signal?: AbortSignal): Promise<T[]> {
    if (signal?.aborted) throw new Error('AGENT_CANCELLED');
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    const results: T[] = new Array(tasks.length);
    let next = 0;
    let failure: unknown;
    let failed = false;
    const consume = async () => {
      while (!controller.signal.aborted && next < tasks.length) {
        const index = next++;
        try { results[index] = await tasks[index]!(controller.signal); }
        catch (error) { if (!failed) { failed = true; failure = error; } controller.abort(); }
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(this.concurrency, tasks.length) }, consume));
      if (signal?.aborted) throw new Error('AGENT_CANCELLED');
      if (failed) throw failure;
      return results;
    } finally { signal?.removeEventListener('abort', cancel); }
  }
}
