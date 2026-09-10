/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：维护证据复核角色的基础指令、职责和可读材料范围。
 */
import { materialsFor } from '../AgentExecution.ts';
import type { Input } from './ReviewAgentContract.ts';
import type { ExecutionContext } from '../AgentExecution.ts';

/** 对外提供definition，作为调用方使用的统一约定。 */
export const definition = {
    agentId: 'review', displayName: '复核智能体',
    responsibility: '依据评测和检查证据定位知识问题，并提出可验证的纠正意见。',
    basePrompt: '依据本轮知识、真实测评结果 evaluationReportRef 和比较报告 comparisonReportRef 提出 corrections 修订意见列表。每项包含 correctionId、knowledgePath（正文中现有段落标题或原文）、problem、suggestion 和 evidence（comparison/evaluation 选择，可同时选择）。没有需要修订的问题返回空数组。只从显式提供的历史意见总结重复尝试，不读取其他历史或原始源码。blocking 表示证据支持的阻塞；最终通过由 Gate 判定。',
    inputContract: ['候选知识', '评测报告', '检查报告'],
    outputContract: ['结构化复核与纠正意见'], tools: ['read_material'], customizableFields: ['promptAddon'],
  } as const;

/** 组合基础提示词和本角色可见的受信材料。 */
export function buildPrompt(input: Input, context: ExecutionContext): string {
  return `${context.effectivePrompt}\n\n受信 AgentCommand：\n${JSON.stringify(context.command)}\n\n命令引用工件（已校验内容摘要）：\n${JSON.stringify(materialsFor(input.payload, input.materials))}`;
}

/** 确定本角色允许读取的文件路径。 */
export function readablePaths(input: Input): string[] { return []; }
