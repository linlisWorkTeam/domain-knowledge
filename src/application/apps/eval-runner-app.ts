import type { GatePolicy } from '../../domain/index.ts';
import type { EvaluationInput } from '../services/index.ts';
import type { FlywheelApp } from './flywheel-app.ts';

export class EvalRunnerApp {
  readonly flywheel: FlywheelApp;

  constructor(flywheel: FlywheelApp) {
    this.flywheel = flywheel;
  }

  evaluate(input: EvaluationInput, policy: GatePolicy) {
    return this.flywheel.recordEvaluation(input, policy);
  }
}
