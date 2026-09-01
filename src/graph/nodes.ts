import type {
  AgentKind,
  AgentRunInput,
  ArtifactRef,
  CheckReport,
  ReviewReport,
  RunEvent,
} from "../domain/types.js";
import type { AgentRunnerRegistry } from "../agents/contracts.js";
import type { Evaluator } from "../eval/contracts.js";
import type { ArtifactStore, WorkspaceProvider } from "../platform/contracts.js";
import { decideGate } from "./gate.js";
import type { GraphState, GraphStateUpdate } from "./state.js";
import type { GraphNodeName } from "./topology.js";

export interface GraphDependencies {
  runners: AgentRunnerRegistry;
  evaluator: Evaluator;
  artifactStore: ArtifactStore;
  workspaceProvider: WorkspaceProvider;
}

const permissions: Record<Exclude<AgentKind, "orchestrator">, {
  readableRoots: string[];
  writableRoots: string[];
}> = {
  "doc-gen": { readableRoots: ["source", "headers", "review"], writableRoots: ["knowledge"] },
  "doc-worker": { readableRoots: ["source", "headers"], writableRoots: ["knowledge-fragments"] },
  "test-gen": { readableRoots: ["source", "headers"], writableRoots: ["candidate-tests"] },
  code: { readableRoots: ["knowledge", "headers"], writableRoots: ["code"] },
  check: { readableRoots: ["code", "diff", "criteria"], writableRoots: ["check-report"] },
  review: { readableRoots: ["knowledge", "eval-report", "check-report"], writableRoots: ["review-report"] },
};

function visibleArtifacts(
  kind: Exclude<AgentKind, "orchestrator">,
  artifacts: ArtifactRef[],
): ArtifactRef[] {
  const allowedNodes: Record<typeof kind, string[]> = {
    "doc-gen": ["doc_worker", "review", "rollback"],
    "doc-worker": [],
    "test-gen": [],
    code: ["doc_gen", "candidate_knowledge"],
    check: ["code"],
    review: ["doc_gen", "candidate_knowledge", "eval_runner", "check"],
  };
  return artifacts.filter((artifact) =>
    allowedNodes[kind].some(
      (allowed) => artifact.node === allowed || artifact.node.startsWith(`${allowed}-`),
    ),
  );
}

function attemptFor(state: GraphState, node: string, workerId?: string): number {
  return (
    state.events.filter(
      (event) =>
        event.node === node &&
        event.iteration === state.iteration &&
        event.phase === "started" &&
        event.workerId === workerId,
    ).length + 1
  );
}

function event(
  state: GraphState,
  node: string,
  phase: RunEvent["phase"],
  attempt: number,
  extra: Partial<RunEvent> = {},
): RunEvent {
  return {
    node,
    phase,
    iteration: state.iteration,
    attempt,
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

async function persistJson(
  deps: GraphDependencies,
  state: GraphState,
  node: GraphNodeName,
  relativePath: string,
  value: unknown,
  attempt = 1,
): Promise<ArtifactRef> {
  const artifact = await deps.artifactStore.put({
    runId: state.runId,
    node,
    relativePath,
    content: `${JSON.stringify(value, null, 2)}\n`,
    mediaType: "application/json",
    iteration: state.iteration,
    attempt,
  });
  await deps.artifactStore.commitNode({
    runId: state.runId,
    node,
    iteration: state.iteration,
    attempt,
    artifacts: [artifact],
  });
  return artifact;
}

async function executeAgent(
  deps: GraphDependencies,
  state: GraphState,
  kind: Exclude<AgentKind, "orchestrator">,
  node: GraphNodeName,
  prompt: string,
): Promise<{ resultArtifacts: ArtifactRef[]; threadId?: string; attempt: number; events: RunEvent[] }> {
  const workerId = kind === "doc-worker" ? state.workerTask?.id : undefined;
  const attempt = attemptFor(state, node, workerId);
  const policy = permissions[kind];
  const inputArtifacts = visibleArtifacts(kind, state.artifacts);
  for (const artifact of inputArtifacts) {
    if (!(await deps.artifactStore.verify(artifact))) {
      throw new Error(`Artifact integrity check failed: ${artifact.id}`);
    }
  }
  const workspace = await deps.workspaceProvider.prepare({
    runId: state.runId,
    node,
    iteration: state.iteration,
    attempt,
    ...(workerId ? { workerId } : {}),
    visibleArtifacts: inputArtifacts,
    readableRoots: policy.readableRoots,
    writableRoots: policy.writableRoots,
  });
  const existingThreadId = kind === "doc-gen" ? state.agentThreadIds[kind] : undefined;
  const input: AgentRunInput = {
    runId: state.runId,
    kind,
    node,
    iteration: state.iteration,
    attempt,
    prompt,
    workspace,
    artifacts: inputArtifacts,
    scenario: state.scenario,
    ...(existingThreadId ? { existingThreadId } : {}),
    ...(workerId ? { workerId } : {}),
  };
  const runner = deps.runners.get(kind);
  const result = existingThreadId && runner.resume
    ? await runner.resume({ ...input, existingThreadId })
    : await runner.run(input);

  const artifactNode = workerId ? `${node}-${workerId}` : node;
  const resultArtifacts: ArtifactRef[] = [];
  for (const file of result.files) {
    resultArtifacts.push(
      await deps.artifactStore.put({
        runId: state.runId,
        node: artifactNode,
        relativePath: file.relativePath,
        content: file.content,
        ...(file.mediaType ? { mediaType: file.mediaType } : {}),
        iteration: state.iteration,
        attempt,
      }),
    );
  }
  if (resultArtifacts.length === 0) {
    resultArtifacts.push(
      await deps.artifactStore.put({
        runId: state.runId,
        node: artifactNode,
        relativePath: "final-response.md",
        content: result.finalResponse,
        mediaType: "text/markdown",
        iteration: state.iteration,
        attempt,
      }),
    );
  }
  await deps.artifactStore.commitNode({
    runId: state.runId,
    node: artifactNode,
    iteration: state.iteration,
    attempt,
    artifacts: resultArtifacts,
  });

  return {
    resultArtifacts,
    ...(result.threadId ? { threadId: result.threadId } : {}),
    attempt,
    events: [
      event(state, node, "started", attempt, {
        agentKind: kind,
        ...(workerId ? { workerId } : {}),
      }),
      event(state, node, "completed", attempt, {
        agentKind: kind,
        ...(workerId ? { workerId } : {}),
        detail: result.finalResponse,
      }),
    ],
  };
}

export function createGraphNodes(deps: GraphDependencies) {
  return {
    orchestrator: async (state: GraphState): Promise<GraphStateUpdate> => {
      const attempt = attemptFor(state, "orchestrator");
      const artifact = await persistJson(deps, state, "orchestrator", "plan.json", {
        iteration: state.iteration,
        workerCount: state.workerCount,
        strategy: "deterministic-v1",
      }, attempt);
      return {
        status: "running",
        currentNode: "orchestrator",
        route: undefined,
        artifacts: [artifact],
        events: [
          event(state, "orchestrator", "started", attempt, { agentKind: "orchestrator" }),
          event(state, "orchestrator", "completed", attempt, { agentKind: "orchestrator" }),
        ],
      };
    },

    docWorker: async (state: GraphState): Promise<GraphStateUpdate> => {
      const task = state.workerTask;
      if (!task) throw new Error("DocWorkerAgent requires workerTask");
      const execution = await executeAgent(
        deps,
        state,
        "doc-worker",
        "doc_worker",
        `Generate knowledge fragment ${task.index}: ${task.topic}`,
      );
      return {
        currentNode: "doc_worker",
        artifacts: execution.resultArtifacts,
        workerOutputs: [
          {
            workerId: task.id,
            iteration: state.iteration,
            artifactIds: execution.resultArtifacts.map((artifact) => artifact.id),
          },
        ],
        events: execution.events,
      };
    },

    docGen: async (state: GraphState): Promise<GraphStateUpdate> => {
      const workerOutputs = state.workerOutputs.filter(
        (output) => output.iteration === state.iteration,
      );
      const execution = await executeAgent(
        deps,
        state,
        "doc-gen",
        "doc_gen",
        `Generate or revise the knowledge document. Merge ${workerOutputs.length} worker outputs.`,
      );
      return {
        currentNode: "doc_gen",
        artifacts: execution.resultArtifacts,
        ...(execution.threadId
          ? { agentThreadIds: { "doc-gen": execution.threadId } }
          : {}),
        events: execution.events,
      };
    },

    testGen: async (state: GraphState): Promise<GraphStateUpdate> => {
      const execution = await executeAgent(
        deps,
        state,
        "test-gen",
        "test_gen",
        "Generate candidate tests from source and public headers without reading knowledge artifacts.",
      );
      return {
        currentNode: "test_gen",
        artifacts: execution.resultArtifacts,
        events: execution.events,
      };
    },

    candidateKnowledge: async (state: GraphState): Promise<GraphStateUpdate> => {
      const attempt = attemptFor(state, "candidate_knowledge");
      const knowledgeArtifacts = state.artifacts.filter(
        (artifact) => artifact.node === "doc_gen" && artifact.iteration === state.iteration,
      );
      const artifact = await persistJson(
        deps,
        state,
        "candidate_knowledge",
        "candidate.json",
        { status: "candidate", artifactIds: knowledgeArtifacts.map((item) => item.id) },
        attempt,
      );
      return {
        currentNode: "candidate_knowledge",
        artifacts: [artifact],
        events: [
          event(state, "candidate_knowledge", "started", attempt),
          event(state, "candidate_knowledge", "completed", attempt),
        ],
      };
    },

    oracleValidation: async (state: GraphState): Promise<GraphStateUpdate> => {
      const attempt = attemptFor(state, "oracle_validation");
      const artifact = await persistJson(
        deps,
        state,
        "oracle_validation",
        "oracle-report.json",
        { valid: true, mode: "fake-v1", iteration: state.iteration },
        attempt,
      );
      return {
        currentNode: "oracle_validation",
        artifacts: [artifact],
        events: [
          event(state, "oracle_validation", "started", attempt),
          event(state, "oracle_validation", "completed", attempt),
        ],
      };
    },

    code: async (state: GraphState): Promise<GraphStateUpdate> => {
      const execution = await executeAgent(
        deps,
        state,
        "code",
        "code",
        "Generate implementation using only knowledge artifacts and public headers.",
      );
      return {
        currentNode: "code",
        artifacts: execution.resultArtifacts,
        events: execution.events,
      };
    },

    check: async (state: GraphState): Promise<GraphStateUpdate> => {
      const execution = await executeAgent(
        deps,
        state,
        "check",
        "check",
        "Inspect generated code, diff, and deterministic criteria.",
      );
      const blocking = state.scenario.checkBlockingIterations.includes(state.iteration);
      const report: CheckReport = {
        blocking,
        findings: blocking ? ["Injected blocking check finding"] : [],
        artifactIds: execution.resultArtifacts.map((artifact) => artifact.id),
      };
      return {
        currentNode: "check",
        artifacts: execution.resultArtifacts,
        checkReport: report,
        events: execution.events,
      };
    },

    evalRunner: async (state: GraphState): Promise<GraphStateUpdate> => {
      const attempt = attemptFor(state, "eval_runner");
      const evaluation = await deps.evaluator.evaluate({
        runId: state.runId,
        iteration: state.iteration,
        artifacts: state.artifacts,
        scenario: state.scenario,
      });
      const artifact = await persistJson(
        deps,
        state,
        "eval_runner",
        "evaluation-report.json",
        evaluation,
        attempt,
      );
      return {
        currentNode: "eval_runner",
        evaluation,
        artifacts: [artifact],
        events: [
          event(state, "eval_runner", "started", attempt),
          event(state, "eval_runner", "completed", attempt, { detail: evaluation.outcome }),
        ],
      };
    },

    review: async (state: GraphState): Promise<GraphStateUpdate> => {
      if (!state.evaluation) throw new Error("ReviewAgent requires an EvaluationReport");
      const execution = await executeAgent(
        deps,
        state,
        "review",
        "review",
        `Review evaluation outcome ${state.evaluation.outcome}, evidence, and Check findings.`,
      );
      const blocking = state.scenario.reviewBlockingIterations.includes(state.iteration);
      const report: ReviewReport = {
        blocking,
        recommendation: blocking || state.evaluation.outcome !== "pass" ? "iterate" : "pass",
        findings: blocking ? ["Injected blocking review finding"] : [],
        corrections: state.evaluation.outcome === "pass" ? [] : ["Revise affected knowledge"],
      };
      return {
        currentNode: "review",
        reviewReport: report,
        artifacts: execution.resultArtifacts,
        ...(execution.threadId
          ? { agentThreadIds: { [`review-${state.iteration}`]: execution.threadId } }
          : {}),
        events: execution.events,
      };
    },

    gate: async (state: GraphState): Promise<GraphStateUpdate> => {
      if (!state.evaluation) throw new Error("Gate requires an EvaluationReport");
      const attempt = attemptFor(state, "gate");
      const route = decideGate({
        iteration: state.iteration,
        maxIterations: state.maxIterations,
        historicalBest: state.historicalBest,
        evaluation: state.evaluation,
        ...(state.checkReport ? { check: state.checkReport } : {}),
        ...(state.reviewReport ? { review: state.reviewReport } : {}),
      });
      const artifact = await persistJson(deps, state, "gate", "decision.json", {
        route,
        iteration: state.iteration,
        maxIterations: state.maxIterations,
      }, attempt);
      return {
        currentNode: "gate",
        route,
        artifacts: [artifact],
        ...(route === "iterate" || route === "rollback"
          ? { iteration: state.iteration + 1 }
          : {}),
        events: [event(state, "gate", "routed", attempt, { detail: route })],
      };
    },

    rollback: async (state: GraphState): Promise<GraphStateUpdate> => {
      const attempt = attemptFor(state, "rollback");
      const artifact = await persistJson(deps, state, "rollback", "rollback.json", {
        restoredHistoricalBest: true,
        nextIteration: state.iteration,
      }, attempt);
      return {
        currentNode: "rollback",
        artifacts: [artifact],
        events: [
          event(state, "rollback", "started", attempt),
          event(state, "rollback", "completed", attempt),
        ],
      };
    },

    publish: async (state: GraphState): Promise<GraphStateUpdate> => {
      const attempt = attemptFor(state, "publish");
      const artifact = await persistJson(deps, state, "publish", "verified.json", {
        status: "verified",
        iteration: state.iteration,
      }, attempt);
      return {
        status: "completed",
        currentNode: "publish",
        historicalBest: true,
        artifacts: [artifact],
        events: [
          event(state, "publish", "started", attempt),
          event(state, "publish", "completed", attempt),
        ],
      };
    },

    failed: async (state: GraphState): Promise<GraphStateUpdate> => ({
      status: "failed",
      currentNode: "failed",
      route: "failed",
      events: [event(state, "failed", "completed", attemptFor(state, "failed"))],
    }),

    stopped: async (state: GraphState): Promise<GraphStateUpdate> => ({
      status: "stopped",
      currentNode: "stopped",
      route: "stopped",
      events: [event(state, "stopped", "completed", attemptFor(state, "stopped"))],
    }),
  };
}
