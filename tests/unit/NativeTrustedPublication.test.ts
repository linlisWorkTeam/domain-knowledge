/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证可信发布报告不接受改预期、假标签或失败参考。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256 } from '../../src/domain/Domain.ts';
import { nativeTestKeys, type NativeTestSet } from '../../src/domain/evaluation/NativeTestCache.ts';
import { assertTrustedPublicationObservations, type TrustedPublicationReport } from '../../src/domain/evaluation/NativeTrustedPublication.ts';
import type { NativeBehaviorSuite } from '../../src/domain/evaluation/NativeBehaviorSuite.ts';
function fixture() {
  const digest = sha256('fixture');
  const binding = { cardIds: ['card'], knowledgeBodyDigests: [digest], referenceDigest: digest, interfaceDigest: digest, policyDigest: digest, toolchainDigest: digest };
  const ref = { artifactId: `sha256:${digest}`, sha256: digest, size: 1, mediaType: 'application/json' };
  const keys = nativeTestKeys(binding);
  const set: NativeTestSet = { ...keys, binding, testSetId: `native-tests-${sha256(`${keys.cacheKey}:${digest}:${digest}`)}`, parentTestSetId: null,
    originVersionIds: ['v'], projectSnapshotId: 'p', sourceRevision: 'r', status: 'TRUSTED', suiteRef: ref, oracleRef: ref, referenceRef: ref, fingerprintRef: ref, sectionBindings: [], createdAt: 'now' };
  const suite: NativeBehaviorSuite = { schemaVersion: 'native-cases-v1', cases: [{ caseId: 'a', description: 'value', sections: [], variables: [], calls: [],
    observations: [{ name: 'value', kind: 'integer', read: { variable: 'value' } }], expected: { value: '1' } }] };
  const oracle = [{ caseId: 'a', status: 'PASSED' as const, actual: { value: '1' }, report: {
    build: { exitCode: 0, timedOut: false, outputLimitExceeded: false }, execution: { exitCode: 0, timedOut: false, outputLimitExceeded: false } } }];
  const report: TrustedPublicationReport = { schemaVersion: 'native-evaluation-v1', testSetId: set.testSetId, total: 1, passed: 1, allPassed: true,
    cases: [{ ...structuredClone(oracle[0]!), input: structuredClone(suite.cases[0]!), expected: { value: '1' } }] };
  return { set, suite, oracle, report };
}
test('trusted publication recomputes results against immutable suite and cache identity', () => {
  const f = fixture(); assert.doesNotThrow(() => assertTrustedPublicationObservations(f.set, f.suite, f.oracle, f.report));
  const changes: Array<(f: ReturnType<typeof fixture>) => void> = [
    f => { f.report.cases[0]!.actual = { value: '9' }; },
    f => { f.report.cases[0]!.input.expected.value = '9'; },
    f => { f.report.cases[0]!.expected.value = '9'; },
    f => { f.oracle[0]!.report.build.exitCode = 1; },
    f => { f.report.cases[0]!.report.execution!.timedOut = true; },
    f => { f.set.cacheKey = sha256('wrong'); },
    f => { f.set.status = 'REJECTED'; },
    f => { f.report.cases = []; },
  ];
  for (const change of changes) { const changed = fixture(); change(changed); assert.throws(() => assertTrustedPublicationObservations(changed.set, changed.suite, changed.oracle, changed.report)); }
});
