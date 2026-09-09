/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：维护测试生成角色的基础指令、职责和可读材料范围。
 */
import { materialsFor } from '../AgentExecution.ts';
import type { Input } from './TestGenAgentContract.ts';
import type { ExecutionContext } from '../AgentExecution.ts';

/** 对外提供definition，作为调用方使用的统一约定。 */
export const definition = {
    agentId: 'test-gen', displayName: '测试生成智能体',
    responsibility: '从源码和公开接口提出候选行为测试，不读取候选知识。',
    basePrompt: '只根据源码和公开接口生成候选行为测试，不得读取生成后的知识或生成实现。独立模块必须输出 suite（module-cases-v1），逐案填写唯一 caseId、description、args 与精确 expected JSON 值，modulePath 取授权源码路径，exportName 取公开函数名。不得提供 shell 命令、测试脚本或自报通过数；oracleRequired 必须为 true。预期行为需要从源码确认，不确定的行为不能猜测为断言。候选将先在参考实现验证，全案通过后才会进入生成实现评测。',
    inputContract: ['源码快照', '公开接口'],
    outputContract: ['候选测试方案'], tools: ['read_material'], customizableFields: ['promptAddon'],
  } as const;

/** 组合基础提示词和本角色可见的受信材料。 */
export function buildPrompt(input: Input, context: ExecutionContext): string {
  return `${context.effectivePrompt}\n\n受信 AgentCommand：\n${JSON.stringify(context.command)}\n\n命令引用工件（已校验内容摘要）：\n${JSON.stringify(materialsFor(input.payload, input.materials))}`;
}

/** 确定本角色允许读取的文件路径。 */
export function readablePaths(input: Input): string[] { return [...input.sourcePaths, ...input.publicInterfacePaths]; }
