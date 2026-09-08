import { materialsFor } from '../execution.ts';
import type { Input } from './contract.ts';
import type { ExecutionContext } from '../execution.ts';

export const definition = {
    agentId: 'orchestrator', displayName: '编排智能体',
    responsibility: '读取固化策略和执行摘要，形成当前轮的确定性任务计划。',
    basePrompt: '规划当前一轮知识飞轮。保持固定拓扑，只分派当前节点职责范围内的任务。',
    inputContract: ['运行策略', '当前轮次', '上次路由摘要'],
    outputContract: ['计划摘要'], tools: [], customizableFields: ['promptAddon'],
  } as const;

export function buildPrompt(input: Input, context: ExecutionContext): string {
  return `${context.effectivePrompt}\n\n受信 AgentCommand：\n${JSON.stringify(context.command)}\n\n命令引用工件（已校验内容摘要）：\n${JSON.stringify(materialsFor(input.payload, input.materials))}`;
}

export function readablePaths(input: Input): string[] { return []; }
