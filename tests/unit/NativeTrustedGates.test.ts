/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证历史门禁并集保留冲突预期且不修改原套件。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeTrustedGates, nativeSupplementGates } from '../../src/domain/services/evaluation/NativeTrustedGates.ts';
import type { NativeBehaviorSuite } from '../../src/domain/services/evaluation/NativeBehaviorSuite.ts';
const suite = (expected: string): NativeBehaviorSuite => ({ schemaVersion: 'native-cases-v1', cases: [{ caseId: 'sum', description: 'addition', sections: ['card#Behavior'], variables: [],
  calls: [{ function: 'add', arguments: [{ integer: '1' }, { integer: '2' }], result: 'out' }], observations: [{ name: 'out', kind: 'integer', read: { variable: 'out' } }], expected: { out: expected } }] });
test('trusted union keeps conflicting assertions and deterministic aliases without editing history', () => {
  const first = suite('3'), second = suite('4'); const before = JSON.stringify([first, second]);
  const merged = nativeTrustedGates([first, second, first]);
  assert.equal(merged.suite.cases.length, 2); assert.equal(new Set(merged.suite.cases.map((item) => item.caseId)).size, 2);
  assert.deepEqual(merged.suite.cases.map((item) => item.expected.out).sort(), ['3', '4']);
  assert.deepEqual(nativeTrustedGates([second, first]), merged);
  assert.equal(nativeTrustedGates([first, second, merged.suite]).digest, merged.digest);
  assert.equal(JSON.stringify([first, second]), before);
});
test('trusted union stops at execution capacity instead of discarding assertions', () => {
  assert.throws(() => nativeTrustedGates(Array.from({ length: 65 }, (_, n) => suite(String(n)))), /NATIVE_TRUSTED_GATE_LIMIT/);
});
test('supplement rejects changed expectations even with a new case name and section', () => {
  const historical = suite('3'), candidate = suite('4');
  candidate.cases[0]!.caseId = 'renamed'; candidate.cases[0]!.sections = ['card#Errors'];
  candidate.cases[0]!.description = 'new explanation';
  const before = JSON.stringify([historical, candidate]);
  assert.throws(() => nativeSupplementGates([historical], candidate), /NATIVE_SUPPLEMENT_EXPECTATION_CONFLICT/);
  assert.equal(JSON.stringify([historical, candidate]), before);
  assert.throws(() => nativeSupplementGates([historical, suite('4')], candidate), /NATIVE_TRUSTED_EXPECTATION_CONFLICT/);
  assert.throws(() => nativeSupplementGates([], { schemaVersion: 'native-cases-v1', cases: [...historical.cases, ...candidate.cases] }), /NATIVE_SUPPLEMENT_EXPECTATION_CONFLICT/);
});
test('supplement preserves old gates and accepts additional inputs and citations deterministically', () => {
  const historical = suite('3'), extra = suite('5');
  extra.cases[0]!.calls[0]!.arguments[1] = { integer: '4' };
  const citation = suite('3'); citation.cases[0]!.sections = ['card#Errors'];
  const before = JSON.stringify([historical, extra, citation]);
  const result = nativeSupplementGates([historical], { schemaVersion: 'native-cases-v1', cases: [...extra.cases, ...citation.cases] });
  assert.equal(result.suite.cases.length, 3);
  assert.ok(result.suite.cases.some((sample) => JSON.stringify(sample) === JSON.stringify(historical.cases[0])));
  assert.deepEqual(result, nativeSupplementGates([historical], { schemaVersion: 'native-cases-v1', cases: [...citation.cases, ...extra.cases] }));
  assert.equal(JSON.stringify([historical, extra, citation]), before);
});
