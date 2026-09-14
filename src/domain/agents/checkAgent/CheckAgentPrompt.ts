/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：维护只读检查角色的基础指令、职责和可读材料范围。
 */
import { materialsFor } from '../AgentExecution.ts';
import { sources, type Input } from './CheckAgentContract.ts';
import type { ExecutionContext } from '../AgentExecution.ts';

/** 对外提供definition，作为调用方使用的统一约定。 */
export const definition = {
    agentId: 'check', displayName: '检查智能体',
    responsibility: '以只读方式检查生成实现、差异和确定性判据，不能修改代码。',
    basePrompt: '只读比较原始源码与生成实现，按 comparisonRulesRef 给定规则输出 scope 和 findings。每项包含 ruleId、original、generated、message、severity（BLOCKER/INFO）。不输出 blocking，程序由严重程度计算。双方证据分别使用 {status:"present",locations:[{path,startLine,endLine,kind:"function"或"declaration"}]}，位置为下方逐行材料中从1开始的行号；选相关完整函数中的位置，程序提取完整实现，相关类型/宏/全局声明单独定位。不抄写代码、不添加省略号。确有一侧缺失时使用 {status:"missing",checkedPaths:[该侧全部授权文件],reason:"按规则解释缺失依据"}；定位失败不等于缺失，内部函数改名/合并/内联不自动违反规则，禁止双方均缺失。message 正文自由表达，无 Markdown 排版要求；说明规则相关的实际差异及影响，不因普通写法变化编造缺陷，不把泛泛疑点写成已确认缺陷。Check 不修改实现、不运行测试、不定位或修订知识文档。scope 列全生成文件，无差异 findings 可为空。',
    inputContract: ['生成文件', '代码差异', '判定标准'],
    outputContract: ['结构化检查报告'], tools: ['read_material'], customizableFields: ['promptAddon'],
  } as const;

/** 组合基础提示词和本角色可见的受信材料。 */
export function buildPrompt(input: Input, context: ExecutionContext): string {
  const numbered = Object.fromEntries(Object.entries(sources(input)).map(([side, files]) => [side, files.filter((file) => side === 'generated' || readablePaths(input).includes(file.path)).map((file) => ({ path: file.path, lines: file.content?.split('\n').map((line, index) => `${index + 1}: ${line}`).join('\n') }))]));
  return `${context.effectivePrompt}\n\n受信 AgentCommand：\n${JSON.stringify(context.command)}\n\n命令引用工件（已校验内容摘要）：\n${JSON.stringify(materialsFor(input.payload, input.materials).filter((m) => m.ref.artifactId === input.payload.comparisonRulesRef.artifactId))}\n\n冻结代码逐行材料（行号前缀不属于代码）：\n${JSON.stringify(numbered)}`;
}

/** 确定本角色允许读取的文件路径。 */
export function readablePaths(input: Input): string[] { return [...new Set([...input.sourcePaths, ...input.publicInterfacePaths])]; }
