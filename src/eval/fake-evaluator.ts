import type {
  EvaluationInput,
  EvaluationOutcome,
  EvaluationReport,
} from "../domain/types.js";
import type { Evaluator } from "./contracts.js";

export class FakeEvaluator implements Evaluator {
  public constructor(private readonly outcomes: EvaluationOutcome[] = ["pass"]) {}

  public async evaluate(input: EvaluationInput): Promise<EvaluationReport> {
    const index = Math.min(input.iteration - 1, this.outcomes.length - 1);
    const outcome = this.outcomes[index] ?? "pass";
    return {
      outcome,
      summary: `Fake evaluation produced ${outcome} at iteration ${input.iteration}`,
      evidence: input.artifacts.map((artifact) => artifact.id),
      infrastructureError: outcome === "infra-error",
      criticalRegression: outcome === "critical-regression",
    };
  }
}
