/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义代码生成角色的输入输出契约、输出 Schema 与材料校验。
 */
import type { ArtifactRef } from '../../Domain.ts';
import type { RoleInput } from '../AgentExecution.ts';
import { requireMaterials } from '../AgentExecution.ts';

/** 角色业务载荷。 */
export interface Payload {
  /** 提供知识引用信息，供调用方读取或传入。 */
  knowledgeRef: ArtifactRef;
  /** 提供语言标识信息，供调用方读取或传入。 */
  languageId: string;
  /** 提供build契约引用信息，供调用方读取或传入。 */
  projectConfigurationRef: ArtifactRef;
  /** 提供allowedGenerated路径列表信息，供调用方读取或传入。 */
  allowedGeneratedPaths: string[];
}
/** 角色输入。 */
export type Input = RoleInput<Payload>;
/** 角色输出。 */
export interface Output { files: { path: string; content: string }[]; }
/** 对外提供输出Schema，作为调用方使用的统一约定。 */
export const outputSchema: Record<string, unknown> = {
  type: 'object', required: ['files'], additionalProperties: false,
  properties: {
    files: {
      type: 'array', minItems: 1,
      items: {
        type: 'object', required: ['path', 'content'], additionalProperties: false,
        properties: { path: { type: 'string', minLength: 1 }, content: { type: 'string', minLength: 1 } },
      },
    },
  },
};

/** 构造本次角色执行使用的输出 Schema。 */
export function schemaFor(input: Input): Record<string, unknown> {
  if (!input.payload.allowedGeneratedPaths.length) throw new Error('AGENT_COMMAND_INPUT_MISSING: allowedGeneratedPaths');
  return { ...outputSchema, properties: { files: { type: 'array', minItems: 1, maxItems: input.payload.allowedGeneratedPaths.length, items: { type: 'object', required: ['path', 'content'], additionalProperties: false, properties: { path: { enum: input.payload.allowedGeneratedPaths }, content: { type: 'string', minLength: 1 } } } } } };
}

/** 检查本角色必需字段及所引用材料是否完整。 */
export function validateInput(input: Input): void {
  requireMaterials(input.payload, input.materials, ['knowledgeRef', 'languageId', 'projectConfigurationRef', 'allowedGeneratedPaths']);
  if (!['c', 'cpp'].includes(input.payload.languageId)) throw new Error('CODE_LANGUAGE_INVALID');
  const config = input.materials.find(({ ref }) => ref.artifactId === input.payload.projectConfigurationRef.artifactId)?.content as Record<string, unknown>;
  if (!config || Object.keys(config).some((key) => !['languageId', 'standard', 'dependencies', 'constraints', 'allowedGeneratedPaths'].includes(key))
    || config.languageId !== input.payload.languageId || typeof config.standard !== 'string'
    || ![config.dependencies, config.constraints].every((value) => Array.isArray(value) && value.every((item) => typeof item === 'string'))
    || JSON.stringify(config.allowedGeneratedPaths) !== JSON.stringify(input.payload.allowedGeneratedPaths)) throw new Error('CODE_CONFIGURATION_INVALID');
  for (const path of input.payload.allowedGeneratedPaths) {
    if (!/^[a-zA-Z0-9_][a-zA-Z0-9_./-]*\.(c|cc|cpp|cxx|h|hpp)$/.test(path)
      || path.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error('CODE_PATH_INVALID');
  }
}

/** 检查角色输出是否满足业务约束。 */
export function validateOutput(output: Output, input: Input): void {
  // Schema 约束路径范围，语义校验再拒绝同一路径出现多个互相覆盖的实现。
  const seen = new Set<string>();
  for (const file of output.files) {
    if (!input.payload.allowedGeneratedPaths.includes(file.path)) throw new Error(`PROJECT_PATH_DENIED: ${file.path}`);
    if (seen.has(file.path)) throw new Error(`PROJECT_PATH_DUPLICATED: ${file.path}`);
    seen.add(file.path);
  }
}
