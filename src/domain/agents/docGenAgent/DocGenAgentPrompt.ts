/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：维护文档生成角色的基础指令、职责和可读材料范围。
 */
import { materialsFor } from '../AgentExecution.ts';
import type { Input } from './DocGenAgentContract.ts';
import type { ExecutionContext } from '../AgentExecution.ts';

/** 对外提供definition，作为调用方使用的统一约定。 */
export const definition = {
    agentId: 'doc-gen', displayName: '文档生成智能体',
    responsibility: '组织内部 DocWorker 提取源码知识，汇总生成正文并根据纠正意见修订。',
    basePrompt: '根据允许使用的源码证据与 Worker 片段生成或修订知识文档。核对片段覆盖与相互矛盾的结论，证据不足时明确说明；所有结论都要具体、可追溯。',
    inputContract: ['源码快照', '分块知识片段', '上一版知识与纠正意见'],
    outputContract: ['符合结构约束的知识文档'], tools: ['read_material'], customizableFields: ['promptAddon'],
  } as const;

/** 组合基础提示词和本角色可见的受信材料。 */
export function buildPrompt(input: Input, context: ExecutionContext): string {
  return `${context.effectivePrompt}\n\n受信 AgentCommand：\n${JSON.stringify(context.command)}\n\nDocGen 内部汇总载荷：\n${JSON.stringify(input.payload)}\n\n汇总材料：\n${JSON.stringify(materialsFor(input.payload, input.materials))}`;
}

/** 确定本角色允许读取的文件路径。 */
export function readablePaths(input: Input): string[] { return [...input.sourcePaths, ...input.publicInterfacePaths]; }
