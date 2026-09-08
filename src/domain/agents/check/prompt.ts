import { materialsFor } from '../execution.ts';
import type { Input } from './contract.ts';
import type { ExecutionContext } from '../execution.ts';

export const definition = {
    agentId: 'check', displayName: '检查智能体',
    responsibility: '以只读方式检查生成实现、差异和确定性判据，不能修改代码。',
    basePrompt: '以只读方式检查提示上下文中内联的生成代码工件与确定性判据，不得修改实现。生成代码不会写入你的公开接口工作区，不能把当前目录缺少生成文件当作缺陷。只报告由内联代码或证据直接支持的阻塞项。',
    inputContract: ['生成文件', '代码差异', '判定标准'],
    outputContract: ['结构化检查报告'], tools: ['read_material'], customizableFields: ['promptAddon'],
  } as const;

export function buildPrompt(input: Input, context: ExecutionContext): string {
  return `${context.effectivePrompt}\n\n受信 AgentCommand：\n${JSON.stringify(context.command)}\n\n命令引用工件（已校验内容摘要）：\n${JSON.stringify(materialsFor(input.payload, input.materials))}`;
}

export function readablePaths(input: Input): string[] { return input.publicInterfacePaths; }
