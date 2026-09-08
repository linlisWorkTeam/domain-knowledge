import { materialsFor } from '../execution.ts';
import type { Input } from './contract.ts';
import type { ExecutionContext } from '../execution.ts';

export const definition = {
    agentId: 'test-gen', displayName: '测试生成智能体',
    responsibility: '从源码和公开接口提出候选行为测试，不读取候选知识。',
    basePrompt: '只根据源码和公开接口生成候选行为测试，不得读取生成后的知识。',
    inputContract: ['源码快照', '公开接口'],
    outputContract: ['候选测试方案'], tools: ['read_material'], customizableFields: ['promptAddon'],
  } as const;

export function buildPrompt(input: Input, context: ExecutionContext): string {
  return `${context.effectivePrompt}\n\n受信 AgentCommand：\n${JSON.stringify(context.command)}\n\n命令引用工件（已校验内容摘要）：\n${JSON.stringify(materialsFor(input.payload, input.materials))}`;
}

export function readablePaths(input: Input): string[] { return [...input.sourcePaths, ...input.publicInterfacePaths]; }
