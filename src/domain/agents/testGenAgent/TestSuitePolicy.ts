/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义测试复用身份和首次校验失败的有限修复规则。
 */
import { sha256 } from '../../Domain.ts';

/** 只使用实际输入源码的路径和内容摘要，不把提交、知识或运行配置作为生成条件。 */
export function sourceIdentity(moduleId: string, paths: string[], files: { path: string; sha256: string }[]): string {
  const selected = [...new Set(paths)].sort().map((path) => {
    const file = files.find((entry) => entry.path === path);
    if (!file || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('TEST_SOURCE_DIGEST_MISSING');
    return { path, sha256: file.sha256 };
  });
  if (!selected.length) throw new Error('TEST_SOURCE_EMPTY');
  return sha256(JSON.stringify({ moduleId, files: selected }));
}
/** 首次候选可有限修复；环境故障或已固定集合失败只能转人工。 */
export function testValidationAction(input: { passed: boolean; infrastructureFailure: boolean; reused: boolean; repairs: number; maxRepairs: number }): 'ACCEPT' | 'REPAIR' | 'MANUAL' {
  if (!Number.isSafeInteger(input.maxRepairs) || input.maxRepairs < 0 || input.maxRepairs > 3) throw new Error('TEST_REPAIR_LIMIT_INVALID');
  if (input.passed) return 'ACCEPT';
  if (input.infrastructureFailure || input.reused || input.repairs >= input.maxRepairs) return 'MANUAL';
  return 'REPAIR';
}
