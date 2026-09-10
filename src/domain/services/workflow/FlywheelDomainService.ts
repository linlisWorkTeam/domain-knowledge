/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义FlywheelDomain服务的领域数据与确定性业务规则。
 */
import {
  createRun, transitionRun, type FlywheelRun, type RunState,
} from '../../Domain.ts';

/** 对外提供能力集合，作为调用方使用的统一约定。 */
export const FLYWHEEL_GENERATION_CAPABILITIES = [
  'doc-gen', 'test-gen', 'code',
] as const;

/** 定义Flywheel生成能力的数据结构与类型约束。 */
export type FlywheelGenerationCapability = typeof FLYWHEEL_GENERATION_CAPABILITIES[number];

/**
 * Owns the pure lifecycle rules used by the Flywheel application use case.
 * Agent runtimes implement capabilities outside the domain and never enter here.
 */
/** 封装FlywheelDomain服务的对外操作与协作依赖。 */
export class FlywheelDomainService {
  /** 创建运行。 */
  createRun(moduleId: string, policyId: string, now: string): FlywheelRun {
    return createRun(moduleId, policyId, now);
  }

  /** 迁移请求。 */
  transition(run: FlywheelRun, next: RunState, now: string): FlywheelRun {
    return transitionRun(run, next, now);
  }

  /** 提供 生成能力集合 对应的生成能力集合操作。 */
  generationCapabilities(): readonly FlywheelGenerationCapability[] {
    return FLYWHEEL_GENERATION_CAPABILITIES;
  }
}
