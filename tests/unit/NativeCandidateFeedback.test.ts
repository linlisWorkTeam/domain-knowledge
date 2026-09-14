/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证候选构造反馈只依据失败的DSL且不修改原始用例。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeCandidateHints } from '../../src/domain/evaluation/NativeCandidateFeedback.ts';
import type { NativeBehaviorCase } from '../../src/domain/evaluation/NativeBehaviorSuite.ts';
test('failed array arguments carry precise advisory locations without rewriting input', () => {
  const sample: NativeBehaviorCase = { caseId: 'buffer', description: 'write', sections: ['API'], variables: [{ name: 'buf', type: 'char', arrayLength: 32 }],
    calls: [{ function: 'write', arguments: [{ address: { variable: 'buf' } }, { address: { variable: 'buf', index: 0 } }, { read: { variable: 'buf' } }] }],
    observations: [{ name: 'out', kind: 'string', read: { variable: 'buf' } }], expected: { out: 'text' } };
  const original = JSON.stringify(sample);
  const hints = nativeCandidateHints(sample, 'NATIVE_CASE_BUILD_FAILED');
  assert.equal(hints.length, 1); assert.match(hints[0]!, /calls\[0\].arguments\[0\]/); assert.match(hints[0]!, /"read":\{"variable":"buf"\}/);
  assert.equal(JSON.stringify(sample), original);
  assert.deepEqual(nativeCandidateHints(sample, 'NATIVE_BEHAVIOR_MISMATCH'), []);
  assert.deepEqual(nativeCandidateHints(sample, null), []);
});
