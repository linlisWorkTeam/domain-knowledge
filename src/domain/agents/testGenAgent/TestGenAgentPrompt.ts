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
    basePrompt: '只根据源码和公开接口生成可编译运行的 C/C++ 测试源码 files 及 cases 清单。每项用例说明目标、输入、预期结果及源码路径依据；每个测试翻译单元必须有清单项；辅助头文件可以没有清单项，不能作为可执行入口。只使用 allowedTestPaths，禁止输出构建命令或修改原始实现。验证失败材料存在时修复候选测试；不得读取知识卡片或生成实现。测试运行输出 TAP 或标准测试计数供执行器记录。',
    inputContract: ['源码快照', '公开接口'],
    outputContract: ['候选测试方案'], tools: ['read_material'], customizableFields: ['promptAddon'],
  } as const;

/** 组合基础提示词和本角色可见的受信材料。 */
export function buildPrompt(input: Input, context: ExecutionContext): string {
  return `${context.effectivePrompt}\n\n受信 AgentCommand：\n${JSON.stringify(context.command)}\n\n命令引用工件（已校验内容摘要）：\n${JSON.stringify(materialsFor(input.payload, input.materials))}`;
}

/** 确定本角色允许读取的文件路径。 */
export function readablePaths(input: Input): string[] { return [...input.sourcePaths, ...input.publicInterfacePaths]; }
