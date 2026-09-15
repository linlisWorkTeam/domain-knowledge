/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：区分生成代码编译拒绝与资源中断，决定是否允许提出新代码候选。
 */
/** 只依据生成实现的确定性编译失败修复代码，不据此修订知识或修改测试。 */
export function canRepairNativeCode(reasonCode: string, diagnostic: unknown): boolean {
  if (reasonCode !== 'NATIVE_INTERFACE_COMPILE_FAILED' || !diagnostic || typeof diagnostic !== 'object') return false;
  const result = diagnostic as { exitCode?: unknown; timedOut?: unknown; outputLimitExceeded?: unknown; stderr?: unknown };
  return result.exitCode === 1 && result.timedOut === false && result.outputLimitExceeded === false
    && typeof result.stderr === 'string' && result.stderr.length > 0
    && !/out of memory|cannot allocate memory|file too large|no space left on device|permission denied|resource temporarily unavailable|killed signal/i.test(result.stderr);
}
