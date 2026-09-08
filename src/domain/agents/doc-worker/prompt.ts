import { materialsFor } from '../execution.ts';
import type { Input } from './contract.ts';
import type { ExecutionContext } from '../execution.ts';

export const definition = {
    agentId: 'doc-worker', displayName: '文档分块智能体',
    responsibility: '按固定分块任务并行提取知识片段，不能发布或决定门禁。',
    basePrompt: '从可见的源码证据中提取指定知识片段，并保留来源记录。',
    inputContract: ['源码分块', '公开接口'],
    outputContract: ['知识片段'], tools: ['read_material'], customizableFields: ['promptAddon'],
  } as const;

export function buildPrompt(input: Input, context: ExecutionContext): string {
  return `${context.effectivePrompt}\n\n受信 AgentCommand：\n${JSON.stringify(context.command)}\n\n命令引用工件（已校验内容摘要）：\n${JSON.stringify(materialsFor(input.payload, input.materials))}`;
}

export function readablePaths(input: Input): string[] { return [...(input.payload.assignedSourcePaths ?? input.sourcePaths), ...input.publicInterfacePaths]; }
