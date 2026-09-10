/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：通过同一应用用例调度五阶段任务，保留检查点、取消与累计预算。
 */
import {
  STAGE_CONTRACT, createStageTask, assertStageBudget,
  type JsonValue, type StageInput, type StageLimits, type StageResult, type StageTask, type StageUsage, type WorkbenchStage,
} from '../../domain/services/workbench/StageTask.ts';
import type { StageTaskStore } from '../ports/StageTaskPorts.ts';

/** 外部副作用必须使用给定的幂等键；检查点不宣称能使模型请求恰好执行一次。 */
export interface StageExecutionContext {
  task: StageTask;
  signal: AbortSignal;
  step(key: string, work: (idempotencyKey: string) => Promise<StageResult>): Promise<StageResult>;
  inheritUsage(sourceTaskId: string): void;
  account(operationId: string, delta: Partial<StageUsage>): void;
  progress(detail: { [key: string]: JsonValue }): void;
}
export type StageHandler = (context: StageExecutionContext) => Promise<StageResult>;

function safeCode(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  return /^([A-Z][A-Z0-9_]{1,79})(?::|$)/.exec(message)?.[1] ?? 'STAGE_EXECUTION_FAILED';
}
const paused = (code: string) => ['NATIVE_TRUSTED_REFERENCE_FAILED', 'NATIVE_TRUSTED_INTERFACE_CHANGED', 'NATIVE_TRUSTED_GATE_LIMIT'].includes(code) || code === 'STAGE_SHUTDOWN' || code === 'STAGE_BUDGET_EXHAUSTED'
  || code === 'STAGE_HANDLER_UNAVAILABLE' || code.startsWith('PROVIDER_QUOTA_')
  || code === 'PROVIDER_PAYMENT_REQUIRED' || code.startsWith('WORKBENCH_RESOURCE_') || code.startsWith('TOOLCHAIN_MISSING')
  || ['DSH_CONFIGURATION_UNAVAILABLE', 'DSH_CONFIGURATION_CHANGED', 'RUN_CONFIGURATION_INCOMPATIBLE',
    'MODULE_ISOLATION_REQUIRED', 'PROJECT_RESOURCE_ISOLATION_UNAVAILABLE'].includes(code);

/** 所有启动入口共享持久化单执行槽；旧执行仅可读取，不自动跨版本恢复。 */
export class WorkbenchStages {
  readonly store: StageTaskStore;
  private readonly accepts: (input: StageInput) => boolean;
  private readonly handlers: Partial<Record<WorkbenchStage, StageHandler>>;
  private readonly pending = new Map<string, Promise<void>>();
  private readonly controllers = new Map<string, AbortController>();
  private closing = false;
  private readonly executionErrors = new Map<string, unknown>();
  constructor(store: StageTaskStore, handlers: Partial<Record<WorkbenchStage, StageHandler>>, accepts: (input: StageInput) => boolean = () => true) {
    this.accepts = accepts;
    this.store = store;
    this.handlers = handlers;
  }
  /** 服务恢复只接续尚未开始的任务；中断阶段停在 PAUSED，等待显式同输入恢复。 */
  recover(): void {
    this.store.recoverOrphans();
    for (const task of this.store.list().reverse()) if (task.contractVersion === STAGE_CONTRACT && this.accepts(task.input) && task.status === 'PENDING') this.schedule(task.taskId);
  }
  start(input: StageInput, limits: StageLimits = {}): StageTask {
    if (this.closing) throw new Error('STAGE_SHUTDOWN');
    if (!this.accepts(input)) throw new Error('STAGE_CONTRACT_INCOMPATIBLE');
    const task = this.store.insert(createStageTask(input, limits, new Date().toISOString()));
    if (task.status === 'PENDING') this.schedule(task.taskId);
    return task;
  }
  get(taskId: string): StageTask {
    const task = this.store.get(taskId);
    if (!task) throw new Error('STAGE_TASK_NOT_FOUND');
    return task;
  }
  resume(taskId: string, expectedInputDigest: string): StageTask {
    if (this.closing) throw new Error('STAGE_SHUTDOWN');
    if (!this.accepts(this.get(taskId).input)) throw new Error('STAGE_CONTRACT_INCOMPATIBLE');
    const task = this.store.resume(taskId, expectedInputDigest);
    this.schedule(taskId);
    return task;
  }
  cancel(taskId: string): StageTask {
    if (!this.accepts(this.get(taskId).input)) throw new Error('STAGE_CONTRACT_INCOMPATIBLE');
    const task = this.store.cancel(taskId);
    this.controllers.get(taskId)?.abort(new Error('STAGE_CANCELLED'));
    return task;
  }
  /** 供应用链路等待相同单阶段用例；成功结果直接复用，停在失败阶段而不撤销前序结果。 */
  async wait(taskId: string, signal?: AbortSignal): Promise<StageTask> {
    for (;;) {
      signal?.throwIfAborted();
      if (this.executionErrors.has(taskId)) throw this.executionErrors.get(taskId);
      const task = this.get(taskId);
      if (!['PENDING', 'RUNNING'].includes(task.status)) return task;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  private schedule(taskId: string): void {
    if (this.pending.has(taskId) || this.closing) return;
    const execution = this.run(taskId).finally(() => { this.pending.delete(taskId); });
    this.pending.set(taskId, execution);
    // 数据库故障不能伪装为仍在工作：等待方收到错误，持久化事实不被猜测覆盖。
    void execution.catch((error) => { this.executionErrors.set(taskId, error); });
  }
  private async run(taskId: string): Promise<void> {
    let lease: ReturnType<StageTaskStore['claim']> = null;
    while (!this.closing) {
      const task = this.get(taskId);
      if (task.status !== 'PENDING') return;
      try { lease = this.store.claim(taskId); }
      catch (error) { this.store.pausePending(taskId, safeCode(error)); return; }
      if (lease) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!lease) return;
    const { leaseId, task } = lease;
    const controller = new AbortController();
    this.controllers.set(taskId, controller);
    let lastTick = performance.now();
    const accountElapsed = () => {
      const now = performance.now();
      const delta = Math.max(0, Math.floor(now - lastTick));
      if (!delta) return this.get(taskId);
      lastTick += delta;
      return this.store.elapsed(taskId, leaseId, delta);
    };
    const timer = setInterval(() => {
      try {
        const current = accountElapsed();
        if (current.cancelRequested) controller.abort(new Error('STAGE_CANCELLED'));
        if (current.limits.elapsedMs !== undefined && current.usage.elapsedMs >= current.limits.elapsedMs) {
          controller.abort(new Error('STAGE_BUDGET_EXHAUSTED'));
        }
      } catch (error) { controller.abort(error); }
    }, 100);
    try {
      const handler = this.handlers[task.input.stage];
      if (!handler) throw new Error('STAGE_HANDLER_UNAVAILABLE');
      const result = await handler({
        task: structuredClone(task), signal: controller.signal,
        step: async (key, work) => {
          controller.signal.throwIfAborted();
          if (!key || key.length > 256) throw new Error('STAGE_STEP_INVALID');
          const previous = this.store.checkpoints(taskId).find((checkpoint) => checkpoint.key === key);
          if (previous) return previous.result;
          const result = await work(`${taskId}:${key}`);
          controller.signal.throwIfAborted();
          return this.store.checkpoint(taskId, leaseId, key, result).result;
        },
        inheritUsage: (sourceTaskId) => {
          controller.signal.throwIfAborted();
          const source = this.get(sourceTaskId);
          if (source.status !== 'SUCCEEDED' || sourceTaskId === taskId) throw new Error('STAGE_USAGE_SOURCE_INVALID');
          this.store.addUsage(taskId, leaseId, `inherited:${sourceTaskId}`, source.usage);
        },
        account: (operationId, delta) => {
          if ((delta.modelCalls ?? 0) > 0 || (delta.reservedTokens ?? 0) > 0) {
            controller.signal.throwIfAborted(); assertStageBudget(this.get(taskId), {});
          }
          this.store.addUsage(taskId, leaseId, `${task.attempt}:${operationId}`, delta);
        },
        progress: (detail) => { this.store.event(taskId, leaseId, 'PROGRESS', detail); },
      });
      controller.signal.throwIfAborted();
      const current = accountElapsed();
      if (current.limits.elapsedMs !== undefined && current.usage.elapsedMs >= current.limits.elapsedMs) throw new Error('STAGE_BUDGET_EXHAUSTED');
      this.store.finish(taskId, leaseId, 'SUCCEEDED', result, null);
    } catch (error) {
      accountElapsed();
      const code = safeCode(controller.signal.aborted ? controller.signal.reason : error);
      this.store.finish(taskId, leaseId, code === 'STAGE_CANCELLED' ? 'CANCELLED' : paused(code) ? 'PAUSED' : 'FAILED', null, code);
    } finally { clearInterval(timer); this.controllers.delete(taskId); }
  }
  get idle(): boolean { return this.pending.size === 0; }
  /** 不在子进程退出前释放执行槽；所有 handler 必须把 signal 传到整个进程树。 */
  async shutdown(): Promise<void> {
    this.closing = true;
    for (const controller of this.controllers.values()) controller.abort(new Error('STAGE_SHUTDOWN'));
    await Promise.allSettled(this.pending.values());
  }
}
