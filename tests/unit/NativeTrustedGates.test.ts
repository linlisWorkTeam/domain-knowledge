/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证历史门禁并集保留冲突预期且不修改原套件。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeTrustedGates } from '../../src/domain/services/evaluation/NativeTrustedGates.ts';
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
