/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义文档生成角色的输入输出契约、输出 Schema 与材料校验。
 */
import type { ArtifactRef } from '../../Domain.ts';
import type { RoleInput } from '../AgentExecution.ts';
import { requireMaterials } from '../AgentExecution.ts';

/** 角色业务载荷。 */
export interface Payload {
  /** 提供模块标识信息，供调用方读取或传入。 */
  moduleId: string;
  /** 提供源码引用列表信息，供调用方读取或传入。 */
  sourceRefs: ArtifactRef[];
  /** 提供publicInterface引用列表信息，供调用方读取或传入。 */
  publicInterfaceRefs: ArtifactRef[];
  /** 提供分块任务Fragment引用列表信息，供调用方读取或传入。 */
  workerFragmentRefs?: ArtifactRef[];
  /** 提供基础知识引用信息，供调用方读取或传入。 */
  baseKnowledgeRef?: ArtifactRef;
  /** 提供corrections信息，供调用方读取或传入。 */
  corrections?: unknown[];
  /** 提供质量反馈信息，供调用方读取或传入。 */
  qualityFeedback?: unknown;
}
/** 角色输入。 */
export type Input = RoleInput<Payload>;
/** 角色输出。 */
export interface Output { body: string; title: string; description: string; }
/** 首次生成先形成可审计概要，正文必须落实同一标题顺序。 */
export interface Outline { title: string; description: string; sections: Array<{ heading: string; purpose: string }>; }
/** 概要阶段不允许提前输出正文或调用其他角色。 */
export const outlineSchema: Record<string, unknown> = {
  type: 'object', required: ['title', 'description', 'sections'], additionalProperties: false,
  properties: {
    title: { type: 'string', minLength: 1 }, description: { type: 'string', minLength: 1 },
    sections: { type: 'array', minItems: 1, maxItems: 20, items: {
      type: 'object', required: ['heading', 'purpose'], additionalProperties: false,
      properties: { heading: { type: 'string', minLength: 1 }, purpose: { type: 'string', minLength: 1 } },
    } },
  },
};
/** 对外提供输出Schema，作为调用方使用的统一约定。 */
export const outputSchema: Record<string, unknown> = {
  type: 'object', required: ['body', 'title', 'description'], additionalProperties: false,
  properties: {
    body: { type: 'string', minLength: 200 }, title: { type: 'string', minLength: 1 },
    description: { type: 'string', minLength: 1 },
  },
};

/** 构造本次角色执行使用的输出 Schema。 */
export function schemaFor(_input: Input): Record<string, unknown> {
  return outputSchema;
}

/** 检查本角色必需字段及所引用材料是否完整。 */
export function validateInput(input: Input): void {
  requireMaterials(input.payload, input.materials, ['moduleId', 'sourceRefs', 'publicInterfaceRefs']);
}
