import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { MemorySaver } from '@langchain/langgraph';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import type {
  AgentPromptResolver, StartWorkflowCommand, WorkflowEngine, WorkflowExecutionView,
  WorkflowHandle, WorkflowObserver, WorkflowStageExecutor,
} from '../../../application/ports/index.ts';
import { DOMAIN_KNOWLEDGE_AGENT_DEFINITIONS } from './agent-definitions.ts';
import { buildInfrastructureGraph } from './graph.ts';
import type { InfrastructureState } from './state.ts';

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

export interface DomainKnowledgeInfrastructureOptions {
  executor: WorkflowStageExecutor;
  observer: WorkflowObserver;
  prompts: AgentPromptResolver;
  checkpoint?: { kind: 'memory' } | { kind: 'sqlite'; filename: string };
  clock?: () => string;
}

export async function createDomainKnowledgeInfrastructure(options: DomainKnowledgeInfrastructureOptions) {
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
  const graph = buildInfrastructureGraph({
    executor: options.executor,
    observer: options.observer,
    prompts: options.prompts,
    signalFor: (runId) => controllers.get(runId)?.signal,
    clock: options.clock ?? (() => new Date().toISOString()),
  }, checkpointer);

  type Graph = typeof graph;
  class EmbeddedWorkflowEngine implements WorkflowEngine {
    readonly running = new Map<string, Promise<InfrastructureState>>();
    readonly graph: Graph;

    constructor(compiledGraph: Graph) {
      this.graph = compiledGraph;
    }

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
      }, graphConfig(runId, Math.max(100, command.maxIterations * 30), controller.signal)) as Promise<InfrastructureState>;
      this.track(runId, promise);
      return { runId, executionStatus: 'RUNNING' };
    }

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

    async wait(runId: string): Promise<WorkflowExecutionView> {
      await this.running.get(runId);
      return this.status(runId);
    }

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
