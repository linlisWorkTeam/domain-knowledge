/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义EvalRunnerDomain服务的领域数据与确定性业务规则。
 */
import {
  decideGate, type EvaluationReport, type FlywheelRun, type GateDecision, type GatePolicy,
} from '../Domain.ts';

/** 对外提供能力，作为调用方使用的统一约定。 */
export const EVALUATION_CAPABILITY = 'evaluation-agent' as const;

/**
 * EvaluationAgent is a domain capability name. The implementation remains
 * deterministic and does not add an eighth generative workflow node.
 */
/** 定义评测角色的数据结构与类型约束。 */
export interface EvaluationAgent {
  /** 提供 decide 对应的decide操作。 */
  decide(
    run: FlywheelRun,
    report: EvaluationReport,
    policy: GatePolicy,
    now: string,
  ): GateDecision;
}

/** 封装EvalRunnerDomain服务的对外操作与协作依赖。 */
export class EvalRunnerDomainService implements EvaluationAgent {
  /** 提供 decide 对应的decide操作。 */
  decide(
    run: FlywheelRun,
    report: EvaluationReport,
    policy: GatePolicy,
    now: string,
  ): GateDecision {
    return decideGate(run, report, policy, now);
  }
}
