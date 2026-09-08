/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：维护代码生成角色的基础指令、职责和可读材料范围。
 */
import { materialsFor } from '../AgentExecution.ts';
import type { Input } from './CodeAgentContract.ts';
import type { ExecutionContext } from '../AgentExecution.ts';

/** 对外提供definition，作为调用方使用的统一约定。 */
export const definition = {
    agentId: 'code', displayName: '代码生成智能体',
    responsibility: '由当前智能体提供方启动独立会话，只根据候选知识和公开接口重新生成实现。这里是工作流节点角色，不代表接入了另一套代码生成命令行。',
    basePrompt: '只使用候选知识和公开接口生成一份全新实现。不得查看参考源码或门禁答案。受信上下文中的允许路径是完整输出白名单；只能在这些路径返回实现文件，不得添加测试、文档、夹具或配置文件。',
    inputContract: ['候选知识', '公开接口'],
    outputContract: ['生成的项目文件'], tools: ['read_material'], customizableFields: ['promptAddon'],
  } as const;

/** 组合基础提示词和本角色可见的受信材料。 */
export function buildPrompt(input: Input, context: ExecutionContext): string {
  return `${context.effectivePrompt}\n\n受信 AgentCommand：\n${JSON.stringify(context.command)}\n\n命令引用工件（已校验内容摘要）：\n${JSON.stringify(materialsFor(input.payload, input.materials))}`;
}

/** 确定本角色允许读取的文件路径。 */
export function readablePaths(input: Input): string[] { return input.publicInterfacePaths; }
