import { materialsFor } from '../execution.ts';
import type { Input } from './contract.ts';
import type { ExecutionContext } from '../execution.ts';

export const definition = {
    agentId: 'review', displayName: '复核智能体',
    responsibility: '依据评测和检查证据定位知识问题，并提出可验证的纠正意见。',
    basePrompt: '依据内联的候选知识、结构化评测证据和检查报告做复核。生成代码位于调用方的不可变工件库，由评测器在独立副本中写入文件，不会出现在你的只读公开接口工作区；不得因为当前目录缺少文件而判定失败。结构化评测证据是测试执行的事实依据：当评测通过且检查没有阻塞项时，除非内联证据存在可以明确指出的矛盾，否则应建议通过；需要迭代时必须给出可以复验的知识纠正意见。',
    inputContract: ['候选知识', '评测报告', '检查报告'],
    outputContract: ['结构化复核与纠正意见'], tools: ['read_material'], customizableFields: ['promptAddon'],
  } as const;

export function buildPrompt(input: Input, context: ExecutionContext): string {
  return `${context.effectivePrompt}\n\n受信 AgentCommand：\n${JSON.stringify(context.command)}\n\n命令引用工件（已校验内容摘要）：\n${JSON.stringify(materialsFor(input.payload, input.materials))}`;
}

export function readablePaths(input: Input): string[] { return input.publicInterfacePaths; }
