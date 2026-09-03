import {
  decideGate, type EvaluationReport, type FlywheelRun, type GateDecision, type GatePolicy,
} from '../index.ts';

export const EVALUATION_CAPABILITY = 'evaluation-agent' as const;

/**
 * EvaluationAgent is a domain capability name. The implementation remains
 * deterministic and does not add an eighth generative workflow node.
 */
export interface EvaluationAgent {
  decide(
    run: FlywheelRun,
    report: EvaluationReport,
    policy: GatePolicy,
    now: string,
  ): GateDecision;
}

export class EvalRunnerDomainService implements EvaluationAgent {
  decide(
    run: FlywheelRun,
    report: EvaluationReport,
    policy: GatePolicy,
    now: string,
  ): GateDecision {
    return decideGate(run, report, policy, now);
  }
}
