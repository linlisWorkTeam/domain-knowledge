import { randomUUID } from "node:crypto";
import type { GraphState } from "../graph/state.js";
import type {
  ArtifactRef,
  RunHandle,
  RunStartInput,
  RunStatusView,
} from "../domain/types.js";
import { mergeFakeScenario } from "../domain/types.js";
import type { buildKnowledgeGraph } from "../graph/build-graph.js";

type KnowledgeGraph = ReturnType<typeof buildKnowledgeGraph>;

function configFor(runId: string, recursionLimit = 100, signal?: AbortSignal) {
  return {
    configurable: { thread_id: runId },
    recursionLimit,
    ...(signal ? { signal } : {}),
  };
}

export class RunService {
  private readonly running = new Map<string, Promise<GraphState>>();
  private readonly controllers = new Map<string, AbortController>();

  public constructor(private readonly graph: KnowledgeGraph) {}

  public async startRun(input: RunStartInput = {}): Promise<RunHandle> {
    const runId = input.runId ?? randomUUID();
    if (this.running.has(runId)) {
      throw new Error(`Run ${runId} is already active`);
    }
    const controller = new AbortController();
    this.controllers.set(runId, controller);
    const maxIterations = input.maxIterations ?? 5;
    const promise = this.graph.invoke(
      {
        runId,
        status: "pending",
        iteration: 1,
        maxIterations,
        workerCount: input.workerCount ?? 0,
        historicalBest: input.historicalBest ?? false,
        scenario: mergeFakeScenario(input.scenario),
      },
      configFor(runId, Math.max(100, maxIterations * 30), controller.signal),
    ) as Promise<GraphState>;
    this.track(runId, promise);
    return { runId, status: "running" };
  }

  public async resumeRun(runId: string): Promise<RunHandle> {
    if (this.running.has(runId)) {
      return { runId, status: "running" };
    }
    const current = await this.getRunStatus(runId);
    if (current.status === "completed") {
      return { runId, status: current.status };
    }
    const controller = new AbortController();
    this.controllers.set(runId, controller);
    const promise = this.graph.invoke(
      null as never,
      configFor(runId, Math.max(100, current.iteration * 30), controller.signal),
    ) as Promise<GraphState>;
    this.track(runId, promise);
    return { runId, status: "running" };
  }

  public async waitForRun(runId: string): Promise<RunStatusView> {
    const promise = this.running.get(runId);
    if (promise) {
      await promise;
    }
    return this.getRunStatus(runId);
  }

  public async getRunStatus(runId: string): Promise<RunStatusView> {
    const snapshot = await this.graph.getState(configFor(runId));
    const state = snapshot.values as GraphState;
    if (!state.runId) {
      throw new Error(`Run ${runId} was not found`);
    }
    return {
      runId,
      status: this.running.has(runId) ? "running" : state.status,
      ...(state.currentNode ? { currentNode: state.currentNode } : {}),
      iteration: state.iteration,
      ...(state.route ? { route: state.route } : {}),
      errors: state.errors,
    };
  }

  public async cancelRun(runId: string): Promise<void> {
    this.controllers.get(runId)?.abort();
    await this.graph.updateState(configFor(runId), { status: "cancelled" });
  }

  public async getRunArtifacts(runId: string): Promise<ArtifactRef[]> {
    const snapshot = await this.graph.getState(configFor(runId));
    const state = snapshot.values as GraphState;
    if (!state.runId) {
      throw new Error(`Run ${runId} was not found`);
    }
    return state.artifacts;
  }

  public getGraph(): KnowledgeGraph {
    return this.graph;
  }

  private track(runId: string, promise: Promise<GraphState>): void {
    const tracked = promise.finally(() => {
      this.running.delete(runId);
      this.controllers.delete(runId);
    });
    this.running.set(runId, tracked);
  }
}
