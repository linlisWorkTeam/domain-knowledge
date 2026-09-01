import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentRunner } from "../src/agents/contracts.js";
import type { AgentRunInput } from "../src/domain/types.js";
import { createTestRuntime } from "./helpers.js";

describe("failure handling and adapter seams", () => {
  it("routes a node exception to failed with structured error evidence", async () => {
    const runtime = await createTestRuntime();
    const handle = await runtime.service.startRun({
      runId: "agent-failure",
      scenario: { failAgent: "code" },
    });
    const status = await runtime.service.waitForRun(handle.runId);

    expect(status.status).toBe("failed");
    expect(status.errors).toHaveLength(1);
    expect(status.errors[0]?.node).toBe("code");
    expect(runtime.fakeRunner.calls.some((call) => call.kind === "review")).toBe(false);
  });

  it("replaces an AgentRunner without changing the graph", async () => {
    const runtime = await createTestRuntime();
    const before = await runtime.graph.getGraphAsync();
    let calls = 0;
    const replacement: AgentRunner = {
      async run(input: AgentRunInput) {
        calls += 1;
        return {
          finalResponse: "replacement",
          files: [{ relativePath: "replacement.md", content: input.kind }],
        };
      },
    };
    runtime.runners.register("doc-gen", replacement);
    const handle = await runtime.service.startRun({ runId: "runner-replacement" });
    expect((await runtime.service.waitForRun(handle.runId)).status).toBe("completed");
    const after = await runtime.graph.getGraphAsync();

    expect(calls).toBe(1);
    expect(Object.keys(after.nodes)).toEqual(Object.keys(before.nodes));
    expect(after.edges.map((edge) => `${edge.source}->${edge.target}`)).toEqual(
      before.edges.map((edge) => `${edge.source}->${edge.target}`),
    );
  });

  it("injects an external provider before the graph is compiled", async () => {
    let calls = 0;
    const runtime = await createTestRuntime({
      configureRunners(registry) {
        registry.register("doc-gen", {
          async run() {
            calls += 1;
            return { finalResponse: "injected", files: [] };
          },
        });
      },
    });
    const handle = await runtime.service.startRun({ runId: "provider-injection" });

    expect((await runtime.service.waitForRun(handle.runId)).status).toBe("completed");
    expect(calls).toBe(1);
  });

  it("materializes different workspace policies for Code and TestGen", async () => {
    const runtime = await createTestRuntime();
    const handle = await runtime.service.startRun({ runId: "workspace-policy" });
    await runtime.service.waitForRun(handle.runId);
    const codePolicy = JSON.parse(
      await readFile(
        path.join(
          runtime.artifactStore.root,
          handle.runId,
          "workspaces/code/iteration-1/attempt-1/.workspace-policy.json",
        ),
        "utf8",
      ),
    ) as { readableRoots: string[] };
    const testPolicy = JSON.parse(
      await readFile(
        path.join(
          runtime.artifactStore.root,
          handle.runId,
          "workspaces/test_gen/iteration-1/attempt-1/.workspace-policy.json",
        ),
        "utf8",
      ),
    ) as { readableRoots: string[] };

    expect(codePolicy.readableRoots).toEqual(["knowledge", "headers"]);
    expect(codePolicy.readableRoots).not.toContain("source");
    expect(testPolicy.readableRoots).toEqual(["source", "headers"]);
    expect(testPolicy.readableRoots).not.toContain("knowledge");
  });
});
