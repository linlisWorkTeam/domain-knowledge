/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证补证目标精确定位、部分未命中保留和冻结策略兼容边界。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeSupplementTargets, nativeSupplementTargetCoverage, readNativeSuppliedCandidates } from '../../src/domain/evaluation/NativeSupplementTargets.ts';
import type { NativeBehaviorSuite } from '../../src/domain/evaluation/NativeBehaviorSuite.ts';
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

test('supplied candidates reject trusted flags, unknown modules and foreign section bindings', () => {
  const contract: any = { schemaVersion: 'native-contract-v1', language: 'c', includePath: 'math.h', entryPaths: [],
    declarations: [{ kind: 'FunctionDecl', name: 'add', type: 'int (int)', parameters: [{ name: 'a', type: 'int' }] }], targetFunctions: ['add'] };
  const candidate: any = { schemaVersion: 'native-supplied-candidates-v1', modules: [{ moduleId: 'math', suite: { schemaVersion: 'native-cases-v1', cases: [{
    caseId: 'boundary', description: 'Boundary', sections: ['card#Limits'], variables: [],
    calls: [{ function: 'add', arguments: [{ integer: '0' }], result: 'sum' }],
    observations: [{ name: 'sum', kind: 'integer', read: { variable: 'sum' } }], expected: { sum: '0' },
  }] } }] };
  const modules = [{ moduleId: 'math', contract, sectionIds: ['card#Limits'] }];
  assert.deepEqual(readNativeSuppliedCandidates(candidate, modules), candidate);
  for (const value of [null, [], { ...candidate, trusted: true }, { ...candidate, schemaVersion: 'future' },
    { ...candidate, modules: [...candidate.modules, ...candidate.modules] },
    { ...candidate, modules: [{ ...candidate.modules[0], moduleId: 'other' }] }]) {
    assert.throws(() => readNativeSuppliedCandidates(value, modules), /NATIVE_SUPPLIED_CANDIDATES_INVALID/);
  }
  candidate.modules[0].suite.cases[0].sections = ['other#Limits'];
  assert.throws(() => readNativeSuppliedCandidates(candidate, modules), /NATIVE_SUPPLIED_CANDIDATES_INVALID/);
});
