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
    basePrompt: '根据允许使用的源码证据与 Worker 片段生成或修订知识文档。核对片段覆盖与相互矛盾的结论，证据不足时明确说明；所有结论都要具体、可追溯。默认汇总为一份完整知识文档，不输出多份文档或自行拆分。修订时仅在 baseKnowledgeRef 对应文档上按纠正意见定向修改，保留未涉及的正确内容。提供与正文一致的 title、description 和非空 keywords；body 不含 YAML 头，框架负责写入。无法消解的矛盾与证据缺口列入 unresolvedRisks；修订意见指定章节时只修改该章节，其他正文逐字保留（整体质量反馈除外）。若内容规模使你建议拆分，返回 splitProposal，说明规模与困难并列出建议文档，等待用户答复，不同时输出正文。documentDecision.action=keep-single 表示用户已明确要求合成一份，应遵循该选择。',
    inputContract: ['源码快照', '分块知识片段', '上一版知识与纠正意见'],
    outputContract: ['符合结构约束的知识文档'], tools: ['read_material'], customizableFields: ['promptAddon'],
  } as const;

/** 组合基础提示词和本角色可见的受信材料。 */
export function buildPrompt(input: Input, context: ExecutionContext): string {
  return `${context.effectivePrompt}\n\n受信 AgentCommand：\n${JSON.stringify(context.command)}\n\nDocGen 内部汇总载荷：\n${JSON.stringify(input.payload)}\n\n汇总材料：\n${JSON.stringify(materialsFor(input.payload, input.materials))}`;
}

/** 确定本角色允许读取的文件路径。 */
export function readablePaths(input: Input): string[] { return [...input.sourcePaths, ...input.publicInterfacePaths]; }
