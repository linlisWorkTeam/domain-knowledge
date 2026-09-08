/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义只读检查角色的输入输出契约、输出 Schema 与材料校验。
 */
import type { ArtifactRef } from '../../Domain.ts';
import type { RoleInput } from '../AgentExecution.ts';
import { requireMaterials } from '../AgentExecution.ts';

/** 角色业务载荷。 */
export interface Payload {
  /** 提供diff引用信息，供调用方读取或传入。 */
  diffRef: ArtifactRef;
  /** 提供criteria引用信息，供调用方读取或传入。 */
  criteriaRef: ArtifactRef;
  /** 提供publicInterface引用列表信息，供调用方读取或传入。 */
  publicInterfaceRefs: ArtifactRef[];
}
/** 角色输入。 */
export type Input = RoleInput<Payload>;
/** 角色输出。 */
export interface Output { blocking: boolean; findings: string[]; scope: string[]; }
/** 对外提供输出Schema，作为调用方使用的统一约定。 */
export const outputSchema: Record<string, unknown> = {
  type: 'object', required: ['blocking', 'findings', 'scope'], additionalProperties: false,
  properties: {
    blocking: { type: 'boolean' }, findings: { type: 'array', items: { type: 'string' } },
    scope: { type: 'array', items: { type: 'string', minLength: 1 } },
  },
};

/** 构造本次角色执行使用的输出 Schema。 */
export function schemaFor(_input: Input): Record<string, unknown> {
  return outputSchema;
}

/** 检查本角色必需字段及所引用材料是否完整。 */
export function validateInput(input: Input): void {
  requireMaterials(input.payload, input.materials, ['diffRef', 'criteriaRef', 'publicInterfaceRefs']);
}
