/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证固定用例门禁拒绝伪通过、缺项和模块范围漂移。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixedModuleCoverage, fixedCardCoverage, fixedNativePassed } from '../../src/domain/services/evaluation/NativeFixedEvaluation.ts';
import type { NativeBehaviorSuite } from '../../src/domain/services/evaluation/NativeBehaviorSuite.ts';
const suite: NativeBehaviorSuite = { schemaVersion: 'native-cases-v1', cases: [{ caseId: 'sum', description: 'sum', sections: ['Behavior'], variables: [], calls: [], observations: [{ name: 'sum', kind: 'integer', read: { variable: 'sum' } }], expected: { sum: '7' } }] };
const process = { exitCode: 0, timedOut: false, outputLimitExceeded: false };
const good = { caseId: 'sum', status: 'PASSED' as const, actual: { sum: '7' }, report: { build: process, execution: process } };
test('fixed observations must match expected values and successful isolated execution, not self-reported status', () => {
  assert.equal(fixedNativePassed(suite, [good]), true);
  assert.equal(fixedNativePassed(suite, [{ ...good, actual: { sum: '9' } }]), false);
  assert.equal(fixedNativePassed(suite, [{ ...good, report: { build: { ...process, exitCode: 1 }, execution: process } }]), false);
  assert.equal(fixedNativePassed(suite, [{ ...good, report: { build: process, execution: null } }]), false);
  assert.equal(fixedNativePassed(suite, []), false);
  assert.equal(fixedNativePassed(suite, [good, good]), false);
});
test('fixed suites cover exactly the reconstruction modules', () => {
  fixedModuleCoverage(['c', 'cpp'], ['cpp', 'c']);
  for (const actual of [[], ['c'], ['c', 'c'], ['c', 'python']]) assert.throws(() => fixedModuleCoverage(['c', 'cpp'], actual), /FIXED_MODULE_COVERAGE_INVALID/);
});

test('fixed reports cannot omit or duplicate frozen knowledge versions', () => {
  fixedCardCoverage(['v1', 'v2'], ['v2', 'v1']);
  assert.throws(() => fixedCardCoverage(['v1', 'v2'], ['v1']), /FIXED_KNOWLEDGE_COVERAGE_INVALID/);
  assert.throws(() => fixedCardCoverage(['v1', 'v2'], ['v1', 'v1']), /FIXED_KNOWLEDGE_COVERAGE_INVALID/);
});
