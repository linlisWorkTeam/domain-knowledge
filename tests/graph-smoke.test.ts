import { describe, expect, it } from "vitest";
import type { GraphState } from "../src/graph/state.js";
import { createTestRuntime } from "./helpers.js";

async function finalState(runtime: Awaited<ReturnType<typeof createTestRuntime>>, runId: string) {
  const snapshot = await runtime.graph.getState({ configurable: { thread_id: runId } });
  return snapshot.values as GraphState;
}

describe("full graph smoke", () => {
  it("runs every Agent, Send fan-out, join, Review, Gate, and publish", async () => {
    const runtime = await createTestRuntime();
    const handle = await runtime.service.startRun({
      runId: "happy-workers",
      workerCount: 2,
      scenario: {
        agentDelayMs: { "doc-worker": 60, "test-gen": 60 },
      },
    });
    const result = await runtime.service.waitForRun(handle.runId);
    const state = await finalState(runtime, handle.runId);

    expect(result.status).toBe("completed");
    expect(result.route).toBe("pass");
    const completedNodes = state.events
      .filter((event) => event.phase === "completed")
      .map((event) => event.node);
    for (const node of [
      "orchestrator",
      "doc_gen",
      "test_gen",
      "code",
      "check",
      "review",
      "candidate_knowledge",
      "oracle_validation",
      "eval_runner",
      "publish",
    ]) {
      expect(completedNodes, node).toContain(node);
    }
    expect(completedNodes.filter((node) => node === "doc_worker")).toHaveLength(2);

    const workers = runtime.fakeRunner.calls.filter((call) => call.kind === "doc-worker");
    expect(workers).toHaveLength(2);
    expect(
      workers[0]!.startedAt < workers[1]!.completedAt &&
        workers[1]!.startedAt < workers[0]!.completedAt,
    ).toBe(true);
  });

  it("keeps the DocWorker node while supporting workerCount=0", async () => {
    const runtime = await createTestRuntime();
    const handle = await runtime.service.startRun({ runId: "no-workers", workerCount: 0 });
    await runtime.service.waitForRun(handle.runId);

    expect(runtime.fakeRunner.calls.some((call) => call.kind === "doc-worker")).toBe(false);
    expect(runtime.fakeRunner.calls.some((call) => call.kind === "doc-gen")).toBe(true);
  });
});
