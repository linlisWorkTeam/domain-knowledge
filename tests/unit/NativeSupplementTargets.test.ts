/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证补证目标精确定位、部分未命中保留和冻结策略兼容边界。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeSupplementTargets, nativeSupplementTargetCoverage } from '../../src/domain/services/evaluation/NativeSupplementTargets.ts';
import type { NativeBehaviorSuite } from '../../src/domain/services/evaluation/NativeBehaviorSuite.ts';
const suite = (sections: string[]): NativeBehaviorSuite => ({ schemaVersion: 'native-cases-v1', cases: [{
  caseId: 'case1', description: 'boundary', sections, variables: [], calls: [], observations: [], expected: {},
}] });
test('ordinary behavior citations cannot substitute for the requested evidence sections', () => {
  const targets = nativeSupplementTargets(['card#Evidence', 'card#Missing cases']);
  const result = nativeSupplementTargetCoverage(targets, suite(['card#Behavior', 'other#Evidence', 'card#Evidence extra']));
  assert.equal(result.candidateEligible, false);
  assert.deepEqual(result.matchedSectionIds, []);
  assert.deepEqual(result.unmatchedSectionIds, targets.sectionIds);
  assert.equal(result.semanticCoverageProven, false);
});
test('partial exact matches retain every other target and never prove semantic coverage', () => {
  const input = ['card#Missing cases', 'card#Evidence', 'card#Evidence'];
  const before = [...input], targets = nativeSupplementTargets(input), candidate = suite(['card#Evidence']);
  const frozen = JSON.stringify({ targets, candidate });
  const result = nativeSupplementTargetCoverage(targets, candidate);
  assert.equal(result.candidateEligible, true);
  assert.deepEqual(result.matchedSectionIds, ['card#Evidence']);
  assert.deepEqual(result.unmatchedSectionIds, ['card#Missing cases']);
  assert.deepEqual(result.matches, [{ caseId: 'case1', sectionIds: ['card#Evidence'] }]);
  assert.equal(result.semanticCoverageProven, false);
  assert.equal(JSON.stringify({ targets, candidate }), frozen);
  assert.deepEqual(input, before);
  assert.deepEqual(nativeSupplementTargets(input.reverse()), targets);
});
test('invalid or changed frozen policies fail instead of silently broadening targets', () => {
  for (const ids of [[], ['card'], ['card#'], [' card#Evidence'], ['card#Evidence ']]) {
    assert.throws(() => nativeSupplementTargets(ids), /TARGETS_INVALID/);
  }
  const targets = nativeSupplementTargets(['card#Evidence']);
  assert.throws(() => nativeSupplementTargetCoverage({ ...targets, contract: 'future' as typeof targets.contract }, suite([])), /POLICY_INCOMPATIBLE/);
  assert.throws(() => nativeSupplementTargetCoverage({ ...targets, sectionIds: ['card#Evidence', 'card#Evidence'] }, suite([])), /TARGETS_INVALID/);
});
