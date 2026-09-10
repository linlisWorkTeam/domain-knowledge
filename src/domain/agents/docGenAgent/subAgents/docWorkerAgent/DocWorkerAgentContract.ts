/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义文档分块角色的输入输出契约、输出 Schema 与材料校验。
 */
import type { ArtifactRef } from '../../../../Domain.ts';
import type { RoleInput } from '../../../AgentExecution.ts';
import { requireMaterials } from '../../../AgentExecution.ts';

/** 角色业务载荷。 */
export interface Payload {
  /** 提供模块标识信息，供调用方读取或传入。 */
  moduleId: string;
  /** 提供源码引用列表信息，供调用方读取或传入。 */
  sourceRefs: ArtifactRef[];
  /** 提供publicInterface引用列表信息，供调用方读取或传入。 */
  publicInterfaceRefs: ArtifactRef[];
  /** 提供assigned源码路径列表信息，供调用方读取或传入。 */
  assignedSourcePaths?: string[];
  /** 提供dependency引用列表信息，供调用方读取或传入。 */
  dependencyRefs?: ArtifactRef[];
}
/** 角色输入。 */
export type Input = RoleInput<Payload>;
/** 角色输出。 */
export interface Output {
  workerId: string; fragment: string; provenance: string[];
  analysisScope: { moduleId: string; files: string[]; symbols: string[] };
  sourceEvidence: { claim: string; path: string; symbol?: string }[];
  unresolvedQuestions: string[];
}
/** 对外提供输出Schema，作为调用方使用的统一约定。 */
export const outputSchema: Record<string, unknown> = {
  type: 'object', required: ['workerId', 'fragment', 'provenance', 'analysisScope', 'sourceEvidence', 'unresolvedQuestions'], additionalProperties: false,
  properties: {
    analysisScope: {
      type: 'object', required: ['moduleId', 'files', 'symbols'], additionalProperties: false,
      properties: { moduleId: { type: 'string', minLength: 1 },
        files: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', minLength: 1 } },
        symbols: { type: 'array', uniqueItems: true, items: { type: 'string', minLength: 1 } } },
    },
    sourceEvidence: { type: 'array', minItems: 1, items: {
      type: 'object', required: ['claim', 'path'], additionalProperties: false,
      properties: { claim: { type: 'string', pattern: '\\S' }, path: { type: 'string', minLength: 1 },
        symbol: { type: 'string', minLength: 1 } },
    } },
    unresolvedQuestions: { type: 'array', uniqueItems: true, items: { type: 'string', pattern: '\\S' } },
    workerId: { type: 'string', minLength: 1 }, fragment: { type: 'string', minLength: 20 },
    provenance: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
  },
};

/** 构造本次角色执行使用的输出 Schema。 */
export function schemaFor(_input: Input): Record<string, unknown> {
  return outputSchema;
}

/** 检查本角色必需字段及所引用材料是否完整。 */
export function validateInput(input: Input): void {
  if (input.payload.assignedSourcePaths?.some((path) => !input.sourcePaths.includes(path))
    || input.payload.assignedSourcePaths?.length === 0) throw new Error('DOCWORKER_ASSIGNMENT_INVALID');
  requireMaterials(input.payload, input.materials, ['moduleId', 'sourceRefs', 'publicInterfaceRefs']);
}

/** 核对覆盖与证据授权；不能用模型自报 provenance 扩大来源范围。 */
export function validateOutput(input: Input, output: Output): void {
  const assigned = new Set(input.payload.assignedSourcePaths ?? input.sourcePaths);
  const allowed = new Set([...assigned, ...input.publicInterfacePaths]);
  if (output.analysisScope.moduleId !== input.moduleId
    || output.analysisScope.files.length !== assigned.size
    || output.analysisScope.files.some((path) => !assigned.has(path))) throw new Error('DOCWORKER_COVERAGE_INVALID');
  if (output.sourceEvidence.some((item) => !allowed.has(item.path))
    || output.provenance.some((path) => !allowed.has(path))) throw new Error('DOCWORKER_EVIDENCE_OUT_OF_SCOPE');
  if ([...assigned].some((path) => !output.sourceEvidence.some((item) => item.path === path))) {
    throw new Error('DOCWORKER_EVIDENCE_MISSING');
  }
}
