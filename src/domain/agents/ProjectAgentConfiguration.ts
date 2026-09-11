/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义按项目冻结的 C/C++ 编写约束，不包含构建命令或业务答案。
 */
export interface ProjectAgentConfiguration {
  languageId: 'c' | 'cpp'; standard: string; dependencies: string[]; constraints: string[];
  testPaths: string[]; maxTestRepairs?: number;
}
/** 验证可裁剪的项目配置；具体命令由 Application 另行交给执行器。 */
export function validateProjectAgentConfiguration(value: unknown): asserts value is ProjectAgentConfiguration {
  const config = value as ProjectAgentConfiguration | undefined;
  if (!config || !['c', 'cpp'].includes(config.languageId)
    || !(config.languageId === 'c' ? /^(c89|c99|c11|c17|c23)$/ : /^(c\+\+11|c\+\+14|c\+\+17|c\+\+20|c\+\+23)$/).test(config.standard)
    || ![config.dependencies, config.constraints, config.testPaths].every((items) => Array.isArray(items) && items.every((item) => typeof item === 'string' && item.trim()))
    || !config.testPaths.length || !Number.isSafeInteger(config.maxTestRepairs ?? 1) || (config.maxTestRepairs ?? 1) < 0 || (config.maxTestRepairs ?? 1) > 3) throw new Error('PROJECT_AGENT_CONFIGURATION_INVALID');
}
