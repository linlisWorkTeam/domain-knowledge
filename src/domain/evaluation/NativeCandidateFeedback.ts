/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：从已拒绝的声明式测试定位参数构造风险，不读取实现或改变候选。
 */
import type { NativeBehaviorCase } from './NativeBehaviorSuite.ts';
/** 提示仅说明 DSL 语义，不证明接口不兼容，也不替代参考验证。 */
export function nativeCandidateHints(sample: NativeBehaviorCase, reasonCode: string | null): string[] {
  if (reasonCode !== 'NATIVE_CASE_BUILD_FAILED') return [];
  const hints: string[] = [];
  sample.calls.forEach((call, callIndex) => call.arguments.forEach((argument, argumentIndex) => {
    if (!('address' in argument) || argument.address.index !== undefined || argument.address.members?.length) return;
    const variable = sample.variables.find((item) => item.name === argument.address.variable);
    if (!variable?.arrayLength) return;
    hints.push(`calls[${callIndex}].arguments[${argumentIndex}] takes the address of the whole ${variable.type}[${variable.arrayLength}] array ${variable.name}. This produces a pointer to an array, not a pointer to an element. If the public parameter expects ${variable.type}*, use ${JSON.stringify({ read: { variable: variable.name } })} instead. Check the public signature; this hint does not change the candidate.`);
  }));
  return hints;
}
