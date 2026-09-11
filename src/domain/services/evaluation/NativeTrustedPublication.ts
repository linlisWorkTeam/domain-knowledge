/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：发布前重算可信测试集与原始参考、生成观察的一致性。
 */
import { sha256 } from '../../Domain.ts';
import { canonicalJson } from '../workbench/StageTask.ts';
import { nativeTestKeys, type NativeTestSet } from './NativeTestCache.ts';
import { fixedNativePassed, type FixedNativeObservation } from './NativeFixedEvaluation.ts';
import type { NativeBehaviorSuite, NativeBehaviorCase } from './NativeBehaviorSuite.ts';
export interface TrustedPublicationReport {
  schemaVersion: string; testSetId: string; total: number; passed: number; allPassed: boolean;
  cases: Array<FixedNativeObservation & { input: NativeBehaviorCase; expected: NativeBehaviorCase['expected'] }>;
}
/** CAS和源码/知识绑定由Application核验；此处拒绝被标签掩盖的错误观察或修改预期。 */
export function assertTrustedPublicationObservations(set: NativeTestSet, suite: NativeBehaviorSuite,
  oracle: FixedNativeObservation[], report: TrustedPublicationReport): void {
  const reject = () => { throw new Error('PUBLICATION_TRUSTED_OBSERVATIONS_REJECTED'); };
  const keys = nativeTestKeys(set.binding);
  if (set.status !== 'TRUSTED' || set.cacheKey !== keys.cacheKey || set.referenceKey !== keys.referenceKey
    || set.testSetId !== `native-tests-${sha256(`${set.cacheKey}:${set.suiteRef.sha256}:${set.oracleRef.sha256}`)}`
    || report.schemaVersion !== 'native-evaluation-v1' || report.testSetId !== set.testSetId
    || suite.schemaVersion !== 'native-cases-v1' || !Array.isArray(suite.cases) || !suite.cases.length
    || new Set(suite.cases.map(test => test.caseId)).size !== suite.cases.length
    || report.total !== suite.cases.length || report.passed !== report.total || report.allPassed !== true
    || !Array.isArray(report.cases) || !Array.isArray(oracle)
    || !fixedNativePassed(suite, oracle) || !fixedNativePassed(suite, report.cases)) reject();
  for (const sample of suite.cases) {
    const result = report.cases.find(item => item.caseId === sample.caseId)!;
    if (canonicalJson(result.input) !== canonicalJson(sample) || canonicalJson(result.expected) !== canonicalJson(sample.expected)) reject();
  }
}
