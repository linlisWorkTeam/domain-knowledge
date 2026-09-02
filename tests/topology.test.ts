import { describe, expect, it } from "vitest";
import { DEFAULT_CODE_AGENT_TIMEOUT_MS } from "../src/agents/codeagent-cli-runner.js";
import { DEFAULT_GRAPH_NODE_TIMEOUT_MS } from "../src/graph/build-graph.js";
import { AGENT_GRAPH_NODES, GRAPH_NODES } from "../src/graph/topology.js";
import { createTestRuntime } from "./helpers.js";

describe("LangGraph topology", () => {
  it("allows CodeAgent to reach its own timeout before the graph aborts the node", () => {
    expect(DEFAULT_GRAPH_NODE_TIMEOUT_MS).toBe(600_000);
    expect(DEFAULT_GRAPH_NODE_TIMEOUT_MS).toBeGreaterThan(DEFAULT_CODE_AGENT_TIMEOUT_MS);
  });

  it("contains every required Agent and deterministic node", async () => {
    const runtime = await createTestRuntime();
    const drawable = await runtime.graph.getGraphAsync();
    const nodeNames = new Set(Object.keys(drawable.nodes));

    for (const node of GRAPH_NODES) expect(nodeNames.has(node), node).toBe(true);
    expect(Object.keys(AGENT_GRAPH_NODES)).toEqual([
      "OrchestratorAgent",
      "DocGenAgent",
      "DocWorkerAgent",
      "TestGenAgent",
      "CodeAgent",
      "CheckAgent",
      "ReviewAgent",
    ]);
  });

  it("contains Send routes, the evaluation join, review, and loop edges", async () => {
    const runtime = await createTestRuntime();
    const drawable = await runtime.graph.getGraphAsync();
    const edges = drawable.edges.map((edge) => `${edge.source}->${edge.target}`);

    expect(edges).toContain("orchestrator->doc_worker");
    expect(edges).toContain("orchestrator->doc_gen");
    expect(edges).toContain("orchestrator->test_gen");
    expect(edges).toContain("doc_worker->doc_gen");
    expect(edges).toContain("check->eval_runner");
    expect(edges).toContain("oracle_validation->eval_runner");
    expect(edges).toContain("eval_runner->review");
    expect(edges).toContain("review->gate");
    expect(edges).toContain("gate->orchestrator");
    expect(edges).toContain("gate->rollback");
    expect(edges).toContain("gate->publish");
  });
});
