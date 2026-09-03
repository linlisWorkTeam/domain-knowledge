import type { GatePolicy } from '../../domain/index.ts';
import type { EvalRunnerUseCase, EvaluationSubmission } from '../ports/index.ts';
import type { FlywheelApp } from './flywheel-app.ts';

export class EvalRunnerApp implements EvalRunnerUseCase {
  readonly flywheel: FlywheelApp;

  constructor(flywheel: FlywheelApp) {
    this.flywheel = flywheel;
  }

  evaluate(input: EvaluationSubmission, policy: GatePolicy) {
    return this.flywheel.recordEvaluation(input, policy);
  }
}
