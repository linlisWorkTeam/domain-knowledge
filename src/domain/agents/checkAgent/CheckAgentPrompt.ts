/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：维护只读检查角色的基础指令、职责和可读材料范围。
 */
import { materialsFor } from '../AgentExecution.ts';
import type { Input } from './CheckAgentContract.ts';
import type { ExecutionContext } from '../AgentExecution.ts';

/** 对外提供definition，作为调用方使用的统一约定。 */
export const definition = {
    agentId: 'check', displayName: '检查智能体',
    responsibility: '以只读方式检查生成实现、差异和确定性判据，不能修改代码。',
    basePrompt: '以只读方式检查提示上下文中内联的生成代码工件与确定性判据，不得修改实现。生成代码不会写入你的公开接口工作区，不能把当前目录缺少生成文件当作缺陷。只报告由内联代码或证据直接支持的阻塞项。',
    inputContract: ['生成文件', '代码差异', '判定标准'],
    outputContract: ['结构化检查报告'], tools: ['read_material'], customizableFields: ['promptAddon'],
  } as const;

/** 组合基础提示词和本角色可见的受信材料。 */
export function buildPrompt(input: Input, context: ExecutionContext): string {
  return `${context.effectivePrompt}\n\n受信 AgentCommand：\n${JSON.stringify(context.command)}\n\n命令引用工件（已校验内容摘要）：\n${JSON.stringify(materialsFor(input.payload, input.materials))}`;
}

/** 确定本角色允许读取的文件路径。 */
export function readablePaths(input: Input): string[] { return input.publicInterfacePaths; }
