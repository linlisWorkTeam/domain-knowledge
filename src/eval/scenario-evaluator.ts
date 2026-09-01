import type { EvaluationInput, EvaluationReport } from "../domain/types.js";
import type { Evaluator } from "./contracts.js";
import { FakeEvaluator } from "./fake-evaluator.js";

export class ScenarioEvaluator implements Evaluator {
  public async evaluate(input: EvaluationInput): Promise<EvaluationReport> {
    return new FakeEvaluator(input.scenario?.evaluationSequence ?? ["pass"]).evaluate(input);
  }
}
