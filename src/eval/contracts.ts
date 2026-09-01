import type { EvaluationInput, EvaluationReport } from "../domain/types.js";

export interface Evaluator {
  evaluate(input: EvaluationInput): Promise<EvaluationReport>;
}
