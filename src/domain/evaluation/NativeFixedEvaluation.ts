/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：校验固定用例覆盖与真实观察，参考失败不判定知识错误。
 */
import { nativeOracleTrusted } from './NativeTestCache.ts';
import type { NativeBehaviorSuite, NativeScalar } from './NativeBehaviorSuite.ts';
export const FIXED_EVALUATION_CONTRACT = 'fixed-native-evaluation-v1';
export interface FixedNativeObservation {
  caseId: string; status: 'PASSED' | 'FAILED'; actual: Record<string, NativeScalar> | null;
  report: { build: { exitCode: number | null; timedOut: boolean; outputLimitExceeded: boolean };
    execution: { exitCode: number | null; timedOut: boolean; outputLimitExceeded: boolean } | null };
}
export function fixedNativePassed(suite: NativeBehaviorSuite, observations: FixedNativeObservation[]): boolean {
  return nativeOracleTrusted(suite, observations) && observations.every(item => item.report?.build?.exitCode === 0
    && item.report.build.timedOut === false && item.report.build.outputLimitExceeded === false && item.report.execution?.exitCode === 0
    && item.report.execution.timedOut === false && item.report.execution.outputLimitExceeded === false);
}
export function fixedModuleCoverage(expected: string[], actual: string[]): void {
  if (!expected.length || expected.some(id => typeof id !== 'string' || !id) || expected.length > 200 || new Set(expected).size !== expected.length
    || expected.length !== actual.length || new Set(actual).size !== actual.length
    || expected.some(id => !actual.includes(id))) throw new Error('FIXED_MODULE_COVERAGE_INVALID');
}

export function fixedCardCoverage(expected: string[], actual: string[]): void {
  if (!expected.length || new Set(expected).size !== expected.length || new Set(actual).size !== actual.length
    || expected.length !== actual.length || expected.some(id => !actual.includes(id))) throw new Error('FIXED_KNOWLEDGE_COVERAGE_INVALID');
}

/** 发布前重算原始固定观察，不能仅信任汇总status或通过计数。 */
export function assertFixedPublicationObservations(suite: NativeBehaviorSuite, report: {
  schemaVersion: string; status: string; reference: FixedNativeObservation[]; generated: FixedNativeObservation[];
}, expectedTotal: number): void {
  if (report.schemaVersion !== FIXED_EVALUATION_CONTRACT || report.status !== 'FIXED_PASSED'
    || suite.schemaVersion !== 'native-cases-v1' || !Number.isSafeInteger(expectedTotal) || expectedTotal < 1
    || suite.cases.length !== expectedTotal || new Set(suite.cases.map(item => item.caseId)).size !== expectedTotal
    || !fixedNativePassed(suite, report.reference) || !fixedNativePassed(suite, report.generated)) throw new Error('PUBLICATION_FIXED_OBSERVATIONS_REJECTED');
}
