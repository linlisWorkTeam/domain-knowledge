/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：把生成测试入口绑定到受信的原生编译和运行计划。
 */
import type { ProjectAgentConfiguration } from '../ProjectAgentConfiguration.ts';
import type { Output } from './TestGenAgentContract.ts';

/** 每个测试翻译单元是独立入口；头文件随同写入，不能作为独立用例入口。 */
export function testExecutionPlan(config: ProjectAgentConfiguration, sourcePaths: string[], suite: Output) {
  const entries = [...new Set(suite.cases.map((item) => item.testPath))];
  if (!entries.length || entries.some((path) => !/\.(c|cc|cpp|cxx)$/.test(path))) throw new Error('TEST_EXECUTION_ENTRY_INVALID');
  const sources = sourcePaths.filter((path) => /\.(c|cc|cpp|cxx)$/.test(path));
  if (!sources.length) throw new Error('TEST_EXECUTION_SOURCE_MISSING');
  return entries.flatMap((entry, index) => [
    { tool: config.languageId === 'c' ? 'gcc' as const : 'g++' as const, purpose: 'check' as const,
      args: [`-std=${config.standard}`, '-I.', ...sources, entry, '-o', `.generated-test-${index}`] },
    { tool: 'binary' as const, purpose: 'test' as const, args: [`.generated-test-${index}`] },
  ]);
}
