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
/** 固定业务依赖只用于计划校验；角色不能据此改写工作流图。 */
export const taskDependencies = {
  'doc-worker': [], 'doc-gen': ['doc-worker'], 'test-gen': [],
  code: ['doc-gen'], check: ['code'], review: ['check'],
} as const;
/** 模型在授权模块范围内填写任务目的与读源范围。 */
export interface PlannedTask {
  /** 固定图中的业务角色。 */
  role: keyof typeof taskDependencies;
  /** 本轮应完成且可审计的任务目的。 */
  objective: string;
  /** 计划授权的源码路径，不能超过输入范围。 */
  sourcePaths: string[];
  /** 必须与固定业务依赖一致。 */
  dependsOn: Array<keyof typeof taskDependencies>;
}
/** 保留计划摘要字段，并明确模型实际规划的六项业务任务。 */
export interface Output { strategy: string; iteration: number; parallel: string[]; tasks: PlannedTask[]; }
/** 对外提供输出Schema，作为调用方使用的统一约定。 */
export const outputSchema: Record<string, unknown> = {
  type: 'object', required: ['strategy', 'iteration', 'parallel', 'tasks'], additionalProperties: false,
  properties: {
    strategy: { type: 'string', minLength: 1 }, iteration: { type: 'integer', minimum: 0 },
    parallel: { type: 'array', minItems: 1, uniqueItems: true, items: { enum: ['documentation', 'test-generation'] } },
    tasks: { type: 'array', minItems: 6, maxItems: 6, items: {
      type: 'object', required: ['role', 'objective', 'sourcePaths', 'dependsOn'], additionalProperties: false,
      properties: {
        role: { enum: Object.keys(taskDependencies) }, objective: { type: 'string', minLength: 1 },
        sourcePaths: { type: 'array', uniqueItems: true, items: { type: 'string', minLength: 1 } },
        dependsOn: { type: 'array', uniqueItems: true, items: { enum: Object.keys(taskDependencies) } },
      },
    } },
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

/** 防止模型漏任务、添加依赖、越权读源码，或把其他轮次的计划混入本轮。 */
export function validatePlan(output: Output, input: Input, iteration: number): void {
  if (output.iteration !== iteration) throw new Error('ORCHESTRATOR_ITERATION_MISMATCH');
  const seen = new Set<string>();
  for (const task of output.tasks) {
    if (seen.has(task.role)) throw new Error('ORCHESTRATOR_TASK_DUPLICATE');
    seen.add(task.role);
    const expected: readonly string[] = taskDependencies[task.role];
    if (!expected || expected.length !== task.dependsOn.length
      || expected.some((role) => !task.dependsOn.includes(role as PlannedTask['role']))) {
      throw new Error('ORCHESTRATOR_DEPENDENCY_INVALID');
    }
    const canReadSource = ['doc-worker', 'doc-gen', 'test-gen'].includes(task.role);
    if (task.sourcePaths.some((path) => !canReadSource || !input.sourcePaths.includes(path))) {
      throw new Error('ORCHESTRATOR_SOURCE_SCOPE_DENIED');
    }
    if (canReadSource && input.sourcePaths.some((path) => !task.sourcePaths.includes(path))) {
      throw new Error('ORCHESTRATOR_SOURCE_SCOPE_INCOMPLETE');
    }
  }
  if (seen.size !== Object.keys(taskDependencies).length) throw new Error('ORCHESTRATOR_PLAN_INCOMPLETE');
}
