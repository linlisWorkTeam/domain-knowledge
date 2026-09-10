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
    basePrompt: '只读比较原始源码和内联生成代码，严格使用 comparisonRulesRef 的规则。每条 findings 包含 ruleId、sourcePath（原始文件）、path（生成文件）、original 原文片段、generated 原文片段、message 和 severity。scope 列全生成文件。blocking 必须等于是否存在 BLOCKER。无差异返回空 findings；不得虚构相似度算法、评分或阈值。',
    inputContract: ['生成文件', '代码差异', '判定标准'],
    outputContract: ['结构化检查报告'], tools: ['read_material'], customizableFields: ['promptAddon'],
  } as const;

/** 组合基础提示词和本角色可见的受信材料。 */
export function buildPrompt(input: Input, context: ExecutionContext): string {
  return `${context.effectivePrompt}\n\n受信 AgentCommand：\n${JSON.stringify(context.command)}\n\n命令引用工件（已校验内容摘要）：\n${JSON.stringify(materialsFor(input.payload, input.materials))}`;
}

/** 确定本角色允许读取的文件路径。 */
export function readablePaths(input: Input): string[] { return [...new Set([...input.sourcePaths, ...input.publicInterfacePaths])]; }
