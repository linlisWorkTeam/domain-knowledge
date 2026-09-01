import { describe, expect, it } from "vitest";
import type { EvaluationReport } from "../src/domain/types.js";
import { decideGate } from "../src/graph/gate.js";

function evaluation(
  outcome: EvaluationReport["outcome"],
): EvaluationReport {
  return {
    outcome,
    summary: outcome,
    evidence: [],
    infrastructureError: outcome === "infra-error",
    criticalRegression: outcome === "critical-regression",
  };
}

describe("deterministic Gate", () => {
  it.each([
    ["infra error", evaluation("infra-error"), false, false, 1, 5, false, "failed"],
    ["clean pass", evaluation("pass"), false, false, 1, 5, false, "pass"],
    ["check downgrade", evaluation("pass"), true, false, 1, 5, false, "iterate"],
    ["review downgrade", evaluation("pass"), false, true, 1, 5, false, "iterate"],
    ["eval fail cannot upgrade", evaluation("fail"), false, false, 1, 5, false, "iterate"],
    ["critical rollback", evaluation("critical-regression"), false, false, 1, 5, true, "rollback"],
    ["iteration exhausted", evaluation("fail"), false, false, 5, 5, false, "stopped"],
  ])(
    "%s",
    (_name, report, checkBlocking, reviewBlocking, iteration, maxIterations, historicalBest, route) => {
      expect(
        decideGate({
          iteration,
          maxIterations,
          historicalBest,
          evaluation: report,
          check: { blocking: checkBlocking, findings: [], artifactIds: [] },
          review: {
            blocking: reviewBlocking,
            recommendation: reviewBlocking ? "iterate" : "pass",
            findings: [],
            corrections: [],
          },
        }),
      ).toBe(route);
    },
  );
});
