/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义跨角色业务流程、文档任务拆分及质量判定后的流转规则。
 */
import type { AgentId } from '../agents/AgentContracts.ts';
import { NODE_BY_AGENT } from './AgentDefinitions.ts';

/** 业务阶段绑定的角色；非角色阶段不调用模型。 */
export const AGENT_BY_NODE: Readonly<Record<string, AgentId>> = Object.fromEntries(
  Object.entries(NODE_BY_AGENT).filter(([agentId]) => agentId !== 'doc-worker').map(([agentId, nodeId]) => [nodeId, agentId as AgentId]),
);

/** 固定业务节点集合，角色返回的计划不能修改此集合。 */
export const WORKFLOW_NODES = [
  'orchestrator', 'doc_gen', 'test_gen', 'candidate_knowledge',
  'oracle_validation', 'code', 'check', 'evaluation', 'review', 'workflow_router',
  'publication', 'failed', 'stopped',
] as const;

/** 跨角色流转使用的业务判定结果。 */
export type WorkflowRoute = 'PASS' | 'ITERATE' | 'STOPPED' | 'FAILED';

/** 固定顺序及汇合关系；数组起点表示等待全部上游完成。 */
export const WORKFLOW_EDGES = [
  ['start', 'orchestrator'], ['doc_gen', 'candidate_knowledge'],
  ['code', 'check'], ['test_gen', 'oracle_validation'],
  [['check', 'oracle_validation'], 'evaluation'], ['review', 'workflow_router'],
  ['publication', 'end'], ['failed', 'end'], ['stopped', 'end'],
] as const;

/** 外层仅调度知识生成和测试生成；DocGen 自己组织内部 Worker。 */
export function orchestratorTasks(): Array<{ nodeId: 'test_gen' | 'doc_gen' }> {
  return [{ nodeId: 'test_gen' }, { nodeId: 'doc_gen' }];
}

/** 候选质量未达标时回到业务路由，其他候选进入代码阶段。 */
export function candidateDestination(route: WorkflowRoute | null) {
  return route === 'ITERATE' || route === 'STOPPED' ? 'workflow_router' : 'code';
}

/** 评测故障直接失败，停止信号交由路由处理，其余结果进入审查。 */
export function evaluationDestination(route: WorkflowRoute | null) {
  if (route === 'FAILED') return 'failed';
  if (route === 'STOPPED') return 'workflow_router';
  return 'review';
}

/** 将最终业务判定映射为发布、下一轮、失败或停止。 */
export function workflowDestination(route: WorkflowRoute | null) {
  if (route === 'PASS') return 'publication';
  if (route === 'ITERATE') return 'orchestrator';
  if (route === 'FAILED') return 'failed';
  return 'stopped';
}

/** 只有业务明确要求继续迭代时才增加轮次。 */
export function nextIteration(iteration: number, route: WorkflowRoute | null | undefined): number {
  return route === 'ITERATE' ? iteration + 1 : iteration;
}
