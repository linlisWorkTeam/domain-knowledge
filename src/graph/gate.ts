import type { CheckReport, EvaluationReport, GateRoute, ReviewReport } from "../domain/types.js";

export interface GateInput {
  iteration: number;
  maxIterations: number;
  historicalBest: boolean;
  evaluation: EvaluationReport;
  check?: CheckReport;
  review?: ReviewReport;
}

export function decideGate(input: GateInput): GateRoute {
  if (input.evaluation.infrastructureError) {
    return "failed";
  }
  if (input.evaluation.criticalRegression && input.historicalBest) {
    return "rollback";
  }

  const hasBlockingIssue = Boolean(input.check?.blocking || input.review?.blocking);
  if (input.evaluation.outcome === "pass" && !hasBlockingIssue) {
    return "pass";
  }
  if (input.iteration < input.maxIterations) {
    return "iterate";
  }
  return "stopped";
}
