import { describe, expect, it } from "vitest";
import type { GraphState } from "../src/graph/state.js";
import { createTestRuntime } from "./helpers.js";

async function runAndState(
  input: Parameters<Awaited<ReturnType<typeof createTestRuntime>>["service"]["startRun"]>[0],
) {
  const runtime = await createTestRuntime();
  const handle = await runtime.service.startRun(input);
  const status = await runtime.service.waitForRun(handle.runId);
  const snapshot = await runtime.graph.getState({ configurable: { thread_id: handle.runId } });
  return { runtime, status, state: snapshot.values as GraphState };
}

describe("graph routing", () => {
  it("iterates after business failure and reviews both reports", async () => {
    const { runtime, status } = await runAndState({
      runId: "fail-then-pass",
      scenario: { evaluationSequence: ["fail", "pass"] },
    });
    expect(status.status).toBe("completed");
    expect(status.iteration).toBe(2);
    expect(runtime.fakeRunner.calls.filter((call) => call.kind === "review")).toHaveLength(2);
  });

  it("allows Review to downgrade an Eval pass", async () => {
    const { status } = await runAndState({
      runId: "review-downgrade",
      scenario: {
        evaluationSequence: ["pass", "pass"],
        reviewBlockingIterations: [1],
      },
    });
    expect(status.status).toBe("completed");
    expect(status.iteration).toBe(2);
  });

  it("routes infrastructure errors directly to failed without Review", async () => {
    const { runtime, status } = await runAndState({
      runId: "infra-error",
      scenario: { evaluationSequence: ["infra-error"] },
    });
    expect(status.status).toBe("failed");
    expect(runtime.fakeRunner.calls.some((call) => call.kind === "review")).toBe(false);
  });

  it("stops at maxIterations", async () => {
    const { status } = await runAndState({
      runId: "max-iterations",
      maxIterations: 2,
      scenario: { evaluationSequence: ["fail", "fail"] },
    });
    expect(status.status).toBe("stopped");
    expect(status.iteration).toBe(2);
  });

  it("rolls back critical regression when historical best exists", async () => {
    const { status, state } = await runAndState({
      runId: "rollback",
      historicalBest: true,
      scenario: { evaluationSequence: ["critical-regression", "pass"] },
    });
    expect(status.status).toBe("completed");
    expect(state.events.some((event) => event.node === "rollback")).toBe(true);
  });
});
