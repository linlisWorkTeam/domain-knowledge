/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义文档生成角色的输入输出契约、输出 Schema 与材料校验。
 */
import type { ArtifactRef } from '../../Domain.ts';
import type { RoleInput, ExecutionContext, Material } from '../AgentExecution.ts';
import { requireMaterials } from '../AgentExecution.ts';

/** 角色业务载荷。 */
export interface Payload {
  /** 提供模块标识信息，供调用方读取或传入。 */
  moduleId: string;
  /** 内部 Worker 数量，默认 1；0 表示直接汇总。 */
  workerCount?: number;
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
/** DocGen 决定任务边界，执行端只负责运行和提交。 */
export interface DocWorkerTask { workerId: string; sourcePaths: string[] }
/** 已提交的 Worker 结果及可供汇总的片段。 */
export interface DocWorkerFragment { workerId: string; resultRef: ArtifactRef; material: Material; unresolvedRisks?: string[] }
/** 技术执行端承接有界任务批次，失败或取消不能返回部分成功。 */
export interface DocWorkerExecutionPort {
  run(tasks: DocWorkerTask[], signal?: AbortSignal): Promise<DocWorkerFragment[]>;
}
/** 只有 DocGen 使用内部 Worker 执行能力。 */
export interface DocGenContext extends ExecutionContext { docWorkers?: DocWorkerExecutionPort }
/** 角色输出。 */
export interface Output { body: string; title: string; description: string; }
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
  const count = input.payload.workerCount ?? 1;
  if (!Number.isSafeInteger(count) || count < 0 || count > 5) throw new Error('DOCGEN_WORKER_COUNT_INVALID');
  requireMaterials(input.payload, input.materials, ['moduleId', 'sourceRefs', 'publicInterfaceRefs']);
}
