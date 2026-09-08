/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：协调EvalRunner应用用例及其依赖的领域规则与端口。
 */
import type { GatePolicy } from '../../domain/Domain.ts';
import type { EvalRunnerUseCase, EvaluationSubmission } from '../ports/ApplicationPorts.ts';
import type { FlywheelApp } from './FlywheelApp.ts';

/** 封装EvalRunner应用的对外操作与协作依赖。 */
export class EvalRunnerApp implements EvalRunnerUseCase {
  /** 提供flywheel信息，供调用方读取或传入。 */
  readonly flywheel: FlywheelApp;

  /** 注入协作依赖并初始化实例状态。 */
  constructor(flywheel: FlywheelApp) {
    this.flywheel = flywheel;
  }

  /** 评估请求。 */
  evaluate(input: EvaluationSubmission, policy: GatePolicy) {
    return this.flywheel.recordEvaluation(input, policy);
  }
}
