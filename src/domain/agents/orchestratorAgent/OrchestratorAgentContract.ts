/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义业务计划角色的输入输出契约、输出 Schema 与材料校验。
 */
import type { ArtifactRef } from '../../Domain.ts';
import type { RoleInput } from '../AgentExecution.ts';
import { requireMaterials } from '../AgentExecution.ts';

/** 角色业务载荷。 */
export interface Payload {
  /** 提供策略引用信息，供调用方读取或传入。 */
  policyRef: ArtifactRef;
  /** 提供模块引用列表信息，供调用方读取或传入。 */
  moduleRefs: ArtifactRef[];
  /** 提供latest报告引用信息，供调用方读取或传入。 */
  latestReportRef?: ArtifactRef;
}
/** 角色输入。 */
export type Input = RoleInput<Payload>;
/** 角色输出。 */
export interface Output { strategy: string; iteration: number; parallel: string[]; }
/** 对外提供输出Schema，作为调用方使用的统一约定。 */
export const outputSchema: Record<string, unknown> = {
  type: 'object', required: ['strategy', 'iteration', 'parallel'], additionalProperties: false,
  properties: {
    strategy: { type: 'string', minLength: 1 }, iteration: { type: 'integer', minimum: 0 },
    parallel: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
  },
};

/** 构造本次角色执行使用的输出 Schema。 */
export function schemaFor(_input: Input): Record<string, unknown> {
  return outputSchema;
}

/** 检查本角色必需字段及所引用材料是否完整。 */
export function validateInput(input: Input): void {
  requireMaterials(input.payload, input.materials, ['policyRef', 'moduleRefs']);
}
