/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义DomainServices的领域数据与确定性业务规则。
 */
/** 统一导出本模块的公共符号，供其他层通过明确入口引用。 */
export {
  FLYWHEEL_GENERATION_CAPABILITIES,
  FlywheelDomainService,
} from './FlywheelDomainService.ts';
/** 统一导出本模块对外使用的类型契约。 */
/** 统一导出本模块的公共符号，供其他层通过明确入口引用。 */
export type { FlywheelGenerationCapability } from './FlywheelDomainService.ts';
/** 统一导出本模块的公共符号，供其他层通过明确入口引用。 */
export {
  EVALUATION_CAPABILITY,
  EvalRunnerDomainService,
} from './EvalRunnerDomainService.ts';
/** 统一导出本模块对外使用的类型契约。 */
/** 统一导出本模块的公共符号，供其他层通过明确入口引用。 */
export type { EvaluationAgent } from './EvalRunnerDomainService.ts';
/** 统一导出本模块的公共符号，供其他层通过明确入口引用。 */
export { AssociationDomainService } from './AssociationDomainService.ts';
/** 统一导出本模块对外使用的类型契约。 */
/** 统一导出本模块的公共符号，供其他层通过明确入口引用。 */
export type {
  AssociationLink,
  AssociationTarget,
  ExternalExtractor,
  ExternalFact,
  ReverseMapper,
} from './AssociationDomainService.ts';
