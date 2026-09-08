/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义测试生成角色的输入输出契约、输出 Schema 与材料校验。
 */
import type { ArtifactRef } from '../../Domain.ts';
import type { RoleInput } from '../AgentExecution.ts';
import { requireMaterials } from '../AgentExecution.ts';

/** 角色业务载荷。 */
export interface Payload {
  /** 提供模块标识信息，供调用方读取或传入。 */
  moduleId: string;
  /** 提供源码快照引用信息，供调用方读取或传入。 */
  sourceSnapshotRef: ArtifactRef;
  /** 提供publicInterface引用列表信息，供调用方读取或传入。 */
  publicInterfaceRefs: ArtifactRef[];
  /** 提供语言标识信息，供调用方读取或传入。 */
  languageId: string;
  /** 提供测试策略引用信息，供调用方读取或传入。 */
  testPolicyRef: ArtifactRef;
}
/** 角色输入。 */
export type Input = RoleInput<Payload>;
/** 角色输出。 */
export interface Output { candidateCommands: Record<string, unknown>[]; oracleRequired: boolean; }
/** 对外提供输出Schema，作为调用方使用的统一约定。 */
export const outputSchema: Record<string, unknown> = {
  type: 'object', required: ['candidateCommands', 'oracleRequired'], additionalProperties: false,
  properties: {
    candidateCommands: { type: 'array', minItems: 1, items: { type: 'object' } },
    oracleRequired: { type: 'boolean' },
  },
};

/** 构造本次角色执行使用的输出 Schema。 */
export function schemaFor(_input: Input): Record<string, unknown> {
  return outputSchema;
}

/** 检查本角色必需字段及所引用材料是否完整。 */
export function validateInput(input: Input): void {
  requireMaterials(input.payload, input.materials, ['moduleId', 'sourceSnapshotRef', 'publicInterfaceRefs', 'languageId', 'testPolicyRef']);
}
