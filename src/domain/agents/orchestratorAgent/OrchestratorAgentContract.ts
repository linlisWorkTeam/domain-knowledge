/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义业务计划角色的输入输出契约、输出 Schema 与材料校验。
 */
import type { ArtifactRef } from '../../Domain.ts';
import type { RoleInput } from '../AgentExecution.ts';
import { requireMaterials } from '../AgentExecution.ts';
export interface Payload { policyRef: ArtifactRef; moduleRefs: ArtifactRef[]; businessGoalRef: ArtifactRef; projectConfigurationRef: ArtifactRef; progressRef: ArtifactRef }
export type Input = RoleInput<Payload>;
/** 尚未生成的工件以业务材料槽位描述，实际引用由工作流在上游完成后绑定。 */
export const taskMaterials = {
  'doc-gen': ['source', 'interfaces'], 'test-gen': ['source', 'interfaces', 'testPolicy'],
  code: ['knowledge', 'projectConfiguration'], check: ['source', 'generatedCode', 'comparisonRules'],
  review: ['knowledge', 'evaluation', 'comparison'],
} as const;
export interface Task { agentType: keyof typeof taskMaterials; moduleId: string; materials: string[] }
export interface Output { strategy: string; iteration: number; tasks: Task[] }
const text = { type: 'string', pattern: '\\S' };
export const outputSchema: Record<string, unknown> = {
  type: 'object', required: ['strategy', 'iteration', 'tasks'], additionalProperties: false,
  properties: { strategy: text, iteration: { type: 'integer', minimum: 0 }, tasks: {
    type: 'array', minItems: 5, maxItems: 5, items: { type: 'object', additionalProperties: false,
      required: ['agentType', 'moduleId', 'materials'], properties: { agentType: { enum: Object.keys(taskMaterials) }, moduleId: text,
        materials: { type: 'array', minItems: 1, uniqueItems: true, items: text } } },
  } },
};
export function schemaFor(_input: Input): Record<string, unknown> { return outputSchema; }
export function validateInput(input: Input): void {
  requireMaterials(input.payload, input.materials, ['policyRef', 'moduleRefs', 'businessGoalRef', 'projectConfigurationRef', 'progressRef']);
}
export function validateOutput(output: Output, input: Input, iteration: number): void {
  if (output.iteration !== iteration || new Set(output.tasks.map((task) => task.agentType)).size !== 5) throw new Error('ORCHESTRATOR_PLAN_INVALID');
  for (const task of output.tasks) {
    const allowed: readonly string[] = taskMaterials[task.agentType];
    if (task.moduleId !== input.moduleId || task.materials.length !== allowed.length || task.materials.some((key) => !allowed.includes(key))) throw new Error('ORCHESTRATOR_TASK_SCOPE_INVALID');
  }
}
