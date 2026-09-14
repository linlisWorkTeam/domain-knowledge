/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：维护文档分块角色的基础指令、职责和可读材料范围。
 */
import { materialsFor } from '../../../AgentExecution.ts';
import type { Input } from './DocWorkerAgentContract.ts';
import type { ExecutionContext } from '../../../AgentExecution.ts';

/** 对外提供definition，作为调用方使用的统一约定。 */
export const definition = {
    agentId: 'doc-worker', parentAgentId: 'doc-gen', displayName: '文档分块智能体',
    responsibility: '按固定分块任务并行提取知识片段，不能发布或决定门禁。',
    basePrompt: '只分析分配的源码，输出 analysisScope（模块、文件、符号）、fragment（业务规则、接口、流程和边界）、sourceEvidence（结论与路径及可选符号）、unresolvedQuestions。必须覆盖每个分配文件并提供依据；缺失依赖或无法确定的行为明确列入问题，不猜测。provenance 只填写授权路径。',
    inputContract: ['源码分块', '公开接口'],
    outputContract: ['知识片段'], tools: ['read_material'], customizableFields: ['promptAddon'],
  } as const;

/** 组合基础提示词和本角色可见的受信材料。 */
export function buildPrompt(input: Input, context: ExecutionContext): string {
  return `${context.effectivePrompt}\n\n受信 AgentCommand：\n${JSON.stringify(context.command)}\n\n命令引用工件（已校验内容摘要）：\n${JSON.stringify(materialsFor(input.payload, input.materials))}`;
}

/** 确定本角色允许读取的文件路径。 */
export function readablePaths(input: Input): string[] { return [...(input.payload.assignedSourcePaths ?? input.sourcePaths), ...input.publicInterfacePaths]; }
