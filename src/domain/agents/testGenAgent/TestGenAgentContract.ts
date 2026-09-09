/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义测试生成角色的输入输出契约、输出 Schema 与材料校验。
 */
import type { ArtifactRef } from '../../Domain.ts';
import type { RoleInput } from '../AgentExecution.ts';
import { requireMaterials } from '../AgentExecution.ts';
import { assertModuleBehaviorSuite, moduleBehaviorSuiteSchema, type ModuleBehaviorSuite } from './ModuleBehaviorSuite.ts';

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
export interface Output {
  /** 旧记录只保留为未评测候选，不执行模型提供的命令。 */
  candidateCommands?: Record<string, unknown>[];
  suite?: ModuleBehaviorSuite;
  oracleRequired: boolean;
}
/** 对外提供输出Schema，作为调用方使用的统一约定。 */
export const outputSchema: Record<string, unknown> = {
  type: 'object', required: ['oracleRequired'], additionalProperties: false,
  oneOf: [{ required: ['suite'], properties: { suite: {} } },
    { required: ['candidateCommands'], properties: { candidateCommands: {} } }],
  properties: {
    candidateCommands: { type: 'array', minItems: 1, items: { type: 'object' } },
    suite: moduleBehaviorSuiteSchema,
    oracleRequired: { type: 'boolean' },
  },
};

/** 构造本次角色执行使用的输出 Schema。 */
export function schemaFor(_input: Input): Record<string, unknown> {
  return outputSchema;
}

/** 候选数据必须使用授权模块，且绝不能跳过参考实现验证。 */
export function validateOutput(output: Output, input: Input): void {
  if (output.suite) {
    assertModuleBehaviorSuite(output.suite, input.sourcePaths);
    if (output.oracleRequired !== true) throw new Error('TEST_ORACLE_REQUIRED');
  }
}

/** 检查本角色必需字段及所引用材料是否完整。 */
export function validateInput(input: Input): void {
  requireMaterials(input.payload, input.materials, ['moduleId', 'sourceSnapshotRef', 'publicInterfaceRefs', 'languageId', 'testPolicyRef']);
}
