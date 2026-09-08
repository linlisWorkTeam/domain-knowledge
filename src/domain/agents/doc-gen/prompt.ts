import { materialsFor } from '../execution.ts';
import type { Input } from './contract.ts';
import type { ExecutionContext } from '../execution.ts';

export const definition = {
    agentId: 'doc-gen', displayName: '文档生成智能体',
    responsibility: '生成知识正文，或根据纠正意见增量修订，是知识正文的唯一自动执笔者。',
    basePrompt: '根据允许使用的源码证据生成或修订知识文档。所有结论都要具体、可追溯。',
    inputContract: ['源码快照', '分块知识片段', '上一版知识与纠正意见'],
    outputContract: ['符合结构约束的知识文档'], tools: ['read_material'], customizableFields: ['promptAddon'],
  } as const;

export function buildPrompt(input: Input, context: ExecutionContext): string {
  return `${context.effectivePrompt}\n\n受信 AgentCommand：\n${JSON.stringify(context.command)}\n\n命令引用工件（已校验内容摘要）：\n${JSON.stringify(materialsFor(input.payload, input.materials))}`;
}

export function readablePaths(input: Input): string[] { return [...input.sourcePaths, ...input.publicInterfacePaths]; }
