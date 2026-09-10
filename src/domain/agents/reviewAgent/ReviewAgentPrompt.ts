/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：维护证据复核角色的基础指令、职责和可读材料范围。
 */
import { markdownSections } from '../docGenAgent/DocGenRevision.ts';
import { materialsFor } from '../AgentExecution.ts';
import type { Input } from './ReviewAgentContract.ts';
import type { ExecutionContext } from '../AgentExecution.ts';

/** 对外提供definition，作为调用方使用的统一约定。 */
export const definition = {
    agentId: 'review', displayName: '复核智能体',
    responsibility: '依据评测和检查证据定位知识问题，并提出可验证的纠正意见。',
    basePrompt: '依据内联的候选知识、结构化评测证据和检查报告做复核。生成代码位于调用方的不可变工件库，由评测器在独立副本中写入文件，不会出现在你的只读公开接口工作区；不得因为当前目录缺少文件而判定失败。结构化评测证据是测试执行的事实依据：当评测通过且检查没有阻塞项时，除非内联证据存在可以明确指出的矛盾，否则应建议通过；需要迭代时必须给出可以复验的知识纠正意见。',
    inputContract: ['候选知识', '评测报告', '检查报告'],
    outputContract: ['结构化复核与纠正意见'], tools: ['read_material'], customizableFields: ['promptAddon'],
  } as const;

/** 组合基础提示词和本角色可见的受信材料。 */
export function buildPrompt(input: Input, context: ExecutionContext): string {
  const content = input.materials.find(({ ref }) => ref.artifactId === input.payload.knowledgeRef.artifactId)?.content;
  const body = typeof content === 'string' ? content
    : content && typeof content === 'object' && 'body' in content && typeof content.body === 'string' ? content.body : '';
  const targets = markdownSections(body).map(({ heading }) => ({ heading, knowledgePath: `knowledge/${input.moduleId}.md#${heading}` }));
  return `${context.effectivePrompt}\n本次唯一允许的修订目标（程序从现有正文提取）：${JSON.stringify(targets)}。必须逐字选用其中一项的 heading 和 knowledgePath；H3/H4 子标题不是授权目标，问题位于子标题时应选择其所属的现有 H2。不能创建新标题或把标题转成 URL slug。\nverificationNeeds 是程序登记的待验收事项或范围限制，不代表行为已失败；以本轮结构化评测判断正文是否仍有陈旧的失败描述。不能靠 PASS 清除 unresolvedRisks，风险处置由独立的证据规则决定。纠正意见必须定位唯一现有 H2：knowledge/${input.moduleId}.md#原样H2标题。criterion 写清该段应补充或纠正的行为和可复验要求；不得建议删除测试、改预期或复制参考实现。可选 targetHeading 必须与锚点相同，replacementMarkdown 只能包含该 H2 段。证据不足时 correction=null，并填写 unresolvedRisks；通过时 unresolvedRisks=[]。\n\n受信 AgentCommand：\n${JSON.stringify(context.command)}\n\n命令引用工件（已校验内容摘要）：\n${JSON.stringify(materialsFor(input.payload, input.materials))}`;
}

/** 确定本角色允许读取的文件路径。 */
export function readablePaths(input: Input): string[] { return input.publicInterfacePaths; }
