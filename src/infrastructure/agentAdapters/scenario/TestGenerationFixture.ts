/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：仅供显式夹具把小型完整测试样本映射到计划与实现请求。
 */
export function testGenerationFixture(output: Record<string, unknown>, step?: string): Record<string, unknown> {
  if (!step) return structuredClone(output);
  if (step === 'plan') return structuredClone({ sharedFiles: [], cases: output.cases });
  return structuredClone({ files: output.files });
}
