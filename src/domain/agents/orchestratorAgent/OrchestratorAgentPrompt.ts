/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：维护业务计划角色的基础指令、职责和可读材料范围。
 */
import { materialsFor } from '../AgentExecution.ts';
import { taskMaterials, type Input } from './OrchestratorAgentContract.ts';
import type { ExecutionContext } from '../AgentExecution.ts';

/** 对外提供definition，作为调用方使用的统一约定。 */
export const definition = {
    agentId: 'orchestrator', displayName: '编排智能体',
    responsibility: '读取固化策略和执行摘要，形成当前轮的确定性任务计划。',
    basePrompt: '规划当前一轮知识飞轮。根据业务目标、模块概况、项目配置和进度，从明确授权的 modules 概览中依据目标和进度选择本批次最应处理的一个模块，为它输出 tasks 和说明选择依据的 strategy；后续轮次只能继续已选择模块。五类外层角色各一次，每项包含 agentType、moduleId 和 materials 材料槽位。只使用授权槽位，不安排 DocWorker，不改变固定拓扑，不决定 Gate 结果。',
    inputContract: ['运行策略', '当前轮次', '上次路由摘要'],
    outputContract: ['计划摘要'], tools: [], customizableFields: ['promptAddon'],
  } as const;

/** 组合基础提示词和本角色可见的受信材料。 */
export function buildPrompt(input: Input, context: ExecutionContext): string {
  return `${context.effectivePrompt}\n\n授权任务材料：${JSON.stringify(taskMaterials)}\n\n受信 AgentCommand：\n${JSON.stringify(context.command)}\n\n命令引用工件（已校验内容摘要）：\n${JSON.stringify(materialsFor(input.payload, input.materials))}`;
}

/** 确定本角色允许读取的文件路径。 */
export function readablePaths(input: Input): string[] { return []; }
