/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：提供运行时的基础设施实现与外部系统接入。
 */
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { MemorySaver } from '@langchain/langgraph';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import type {
  AgentPromptResolver, StartWorkflowCommand, WorkflowEngine, WorkflowExecutionView,
  WorkflowHandle, WorkflowObserver, WorkflowStageExecutor,
} from '../../application/ports/ApplicationPorts.ts';
import { DOMAIN_KNOWLEDGE_AGENT_DEFINITIONS } from '../../domain/workflow/AgentDefinitions.ts';
import { buildInfrastructureGraph } from './Graph.ts';
import type { InfrastructureState } from './State.ts';

function graphConfig(runId: string, recursionLimit = 100, signal?: AbortSignal) {
  return {
    configurable: { thread_id: runId }, recursionLimit,
    ...(signal ? { signal } : {}),
  };
}

function retryConfig(
  runId: string,
  checkpointConfig: Record<string, unknown>,
  signal: AbortSignal,
  recursionLimit: number,
) {
  const configurable = checkpointConfig.configurable;
  return {
    ...checkpointConfig,
    configurable: {
      ...(configurable && typeof configurable === 'object' ? configurable : {}),
      thread_id: runId,
    },
    recursionLimit,
    signal,
  };
}

/** 定义Domain知识Infrastructure选项的数据结构与类型约束。 */
export interface DomainKnowledgeInfrastructureOptions {
  /** 提供executor信息，供调用方读取或传入。 */
  executor: WorkflowStageExecutor;
  /** 提供observer信息，供调用方读取或传入。 */
  observer: WorkflowObserver;
  /** 提供prompts信息，供调用方读取或传入。 */
  prompts: AgentPromptResolver;
  /** 提供checkpoint信息，供调用方读取或传入。 */
  checkpoint?: { kind: 'memory' } | { kind: 'sqlite'; filename: string };
  /** 提供 时钟 对应的时钟操作。 */
  clock?: () => string;
}

/** 创建Domain知识Infrastructure。 */
export async function createDomainKnowledgeInfrastructure(options: DomainKnowledgeInfrastructureOptions) {
  const clock = options.clock ?? (() => new Date().toISOString());
  const checkpoint = options.checkpoint ?? {
    kind: 'sqlite' as const,
    filename: resolve('.workpanel/workflow/checkpoints.sqlite'),
  };
  const checkpointer = checkpoint.kind === 'memory'
    ? new MemorySaver()
    : await (async () => {
      await mkdir(dirname(checkpoint.filename), { recursive: true });
      return SqliteSaver.fromConnString(checkpoint.filename);
    })();
  const controllers = new Map<string, AbortController>();
  const resumeReadyAt = new Map<string, string>();
  const readyKey = (runId: string, nodeId: string, iteration: number) => (
    `${runId}\0${nodeId}\0${iteration}`
  );
  const graph = buildInfrastructureGraph({
    executor: options.executor,
    observer: options.observer,
    prompts: options.prompts,
    signalFor: (runId) => controllers.get(runId)?.signal,
    readyAtFor: (runId, nodeId, iteration, fallback) => {
      const key = readyKey(runId, nodeId, iteration);
      const override = resumeReadyAt.get(key);
      if (override) resumeReadyAt.delete(key);
      return override ?? fallback;
    },
    clock,
  }, checkpointer);

  type Graph = typeof graph;
  class EmbeddedWorkflowEngine implements WorkflowEngine {
    readonly running = new Map<string, Promise<InfrastructureState>>();
    readonly graph: Graph;

    /** 注入协作依赖并初始化实例状态。 */
    constructor(compiledGraph: Graph) {
      this.graph = compiledGraph;
    }

    /** 启动请求。 */
    async start(command: StartWorkflowCommand): Promise<WorkflowHandle> {
      const runId = command.runId || randomUUID();
      if (!Number.isSafeInteger(command.maxIterations) || command.maxIterations < 1) {
        throw new Error('WORKFLOW_ARGUMENT_INVALID: maxIterations must be a positive integer');
      }
      if (!Number.isSafeInteger(command.workerCount) || command.workerCount < 0 || command.workerCount > 5) {
        throw new Error('WORKFLOW_ARGUMENT_INVALID: workerCount must be an integer from 0 to 5');
      }
      if (this.running.has(runId)) throw new Error(`WORKFLOW_ALREADY_RUNNING: ${runId}`);
      const controller = new AbortController();
      controllers.set(runId, controller);
      const promise = this.graph.invoke({
        runId,
        executionStatus: 'PENDING',
        iteration: 0,
        maxIterations: command.maxIterations,
        workerCount: command.workerCount,
        context: command.context ?? {},
        readyAt: clock(),
      }, graphConfig(runId, Math.max(100, command.maxIterations * 30), controller.signal)) as Promise<InfrastructureState>;
      this.track(runId, promise);
      return { runId, executionStatus: 'RUNNING' };
    }

    /** 恢复请求。 */
    async resume(runId: string): Promise<WorkflowHandle> {
      if (this.running.has(runId)) return { runId, executionStatus: 'RUNNING' };
      const current = await this.status(runId);
      if (['COMPLETED', 'STOPPED', 'CANCELLED'].includes(current.executionStatus)) return current;
      const controller = new AbortController();
      controllers.set(runId, controller);
      const recursionLimit = Math.max(100, current.maxIterations * 30);
      let config = graphConfig(runId, recursionLimit, controller.signal);
      if (current.executionStatus === 'FAILED' || (current.route === 'FAILED' && current.error)) {
        const failedCheckpoint = await this.failedCheckpoint(runId);
        if (!current.currentNode) throw new Error(`WORKFLOW_NOT_RECOVERABLE: ${runId} has no failed node`);
        // A resumed task is newly eligible when the operator/runtime enqueues
        // the failed checkpoint branch, not when its old predecessor finished.
        resumeReadyAt.set(readyKey(runId, current.currentNode, current.iteration), clock());
        config = retryConfig(
          runId,
          failedCheckpoint as Record<string, unknown>,
          controller.signal,
          recursionLimit,
        );
      }
      const promise = this.graph.invoke(null as never, config) as Promise<InfrastructureState>;
      this.track(runId, promise);
      return { runId, executionStatus: 'RUNNING' };
    }

    /** 取消请求。 */
    async cancel(runId: string): Promise<void> {
      const current = await this.status(runId);
      if (['COMPLETED', 'FAILED', 'STOPPED'].includes(current.executionStatus)) {
        throw new Error(`WORKFLOW_TERMINAL: ${runId} is ${current.executionStatus}`);
      }
      if (current.executionStatus === 'CANCELLED') return;
      const running = this.running.get(runId);
      controllers.get(runId)?.abort();
      try {
        await running;
      } catch {
        // Cancellation can reject the active graph invocation; the explicit state below is authoritative.
      }
      await this.graph.updateState(graphConfig(runId), { executionStatus: 'CANCELLED' });
    }

    /** 等待请求。 */
    async wait(runId: string): Promise<WorkflowExecutionView> {
      await this.running.get(runId);
      return this.status(runId);
    }

    /** 提供 状态 对应的状态操作。 */
    async status(runId: string): Promise<WorkflowExecutionView> {
      const snapshot = await this.graph.getState(graphConfig(runId));
      const state = snapshot.values as InfrastructureState;
      if (!state.runId) throw new Error(`WORKFLOW_NOT_FOUND: ${runId}`);
      const settledFailure = !this.running.has(runId) && state.route === 'FAILED' && Boolean(state.error);
      return {
        runId,
        executionStatus: this.running.has(runId) || state.executionStatus === 'PENDING'
          ? 'RUNNING'
          : settledFailure ? 'FAILED' : state.executionStatus,
        currentNode: state.currentNode,
        iteration: state.iteration,
        maxIterations: state.maxIterations,
        route: state.route,
        error: state.error,
      };
    }

    private track(runId: string, promise: Promise<InfrastructureState>): void {
      const tracked = promise.finally(() => {
        this.running.delete(runId);
        controllers.delete(runId);
        for (const key of resumeReadyAt.keys()) {
          if (key.startsWith(`${runId}\0`)) resumeReadyAt.delete(key);
        }
      });
      this.running.set(runId, tracked);
    }

    private async failedCheckpoint(runId: string): Promise<Record<string, unknown>> {
      for await (const snapshot of this.graph.getStateHistory(graphConfig(runId))) {
        if (snapshot.next.length > 0 && snapshot.tasks.some((task) => task.error != null)) {
          return snapshot.config as Record<string, unknown>;
        }
      }
      throw new Error(`WORKFLOW_NOT_RECOVERABLE: ${runId} has no failed checkpoint`);
    }
  }

  return {
    engine: new EmbeddedWorkflowEngine(graph),
    graph,
    agentDefinitions: DOMAIN_KNOWLEDGE_AGENT_DEFINITIONS,
  };
}
