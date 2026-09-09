/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：限制 ECS 同时运行的模型进程，并让排队也响应取消和预算。
 */

/** 同一服务内所有飞轮共享一个模型执行槽，避免 DSH 并行耗尽小内存服务器。 */
export class ModelProcessLane {
  private tail: Promise<void> = Promise.resolve();

  /** 等待前序进程完全退出再启动；取消的排队请求不得调用模型。 */
  async execute<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    const previous = this.tail;
    let release!: () => void;
    const completed = new Promise<void>((resolve) => { release = resolve; });
    this.tail = previous.then(() => completed);
    let onAbort: (() => void) | undefined;
    try {
      await Promise.race([previous, new Promise<never>((_, reject) => {
        onAbort = () => reject(signal?.reason ?? new Error('AGENT_CANCELLED'));
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted) onAbort();
      })]);
      signal?.throwIfAborted();
      return await work();
    } finally {
      if (onAbort) signal?.removeEventListener('abort', onAbort);
      release();
    }
  }
}

/** 模型串行只限制外部进程，文档与测试的业务依赖仍由图调度。 */
export const modelProcessLane = new ModelProcessLane();
