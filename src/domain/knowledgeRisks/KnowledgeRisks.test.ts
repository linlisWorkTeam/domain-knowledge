/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证风险处置的范围、证据和跨轮次隔离。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256, type ArtifactRef } from '../Domain.ts';
import { collectRisks, assessRisks } from './KnowledgeRisks.ts';
const ref = (text: string): ArtifactRef => ({ artifactId: `sha256:${sha256(text)}`, sha256: sha256(text), mediaType: 'application/json', size: text.length });
const source = ref('source');
const facts = { moduleScope: true, scopeRef: ref('scope'), evaluationRef: ref('evaluation'), passed: true,
  infrastructureFailure: false, testsPassed: 10, testsTotal: 10, stability: 1 };
const risks = () => collectRisks([{ ref: source, content: { unresolvedRisks: ['缺少逃逸行为源码'],
  verificationNeeds: ['MODULE_BEHAVIOR_TESTS', 'SYSTEM_INTEGRATION', 'OUTSIDE_PUBLIC_TYPES'] } }]);
test('risk review: opaque evidence gaps stay open while canonical needs bind to current proof', () => {
  const before = risks(); const result = assessRisks(before, facts);
  assert.deepEqual(result.map(item => item.status), ['OPEN', 'VERIFIED', 'OUT_OF_SCOPE', 'OUT_OF_SCOPE']);
  assert.deepEqual(result[1]!.evidenceRefs, [source, facts.scopeRef, facts.evaluationRef]);
  assert.deepEqual(before, risks(), 'original declarations must remain unchanged');
  assert.deepEqual(risks().map(item => item.riskId), before.map(item => item.riskId));
});
test('risk review: failed, empty, unstable or absent module evidence never verifies behavior', () => {
  for (const change of [{ passed: false }, { infrastructureFailure: true }, { testsTotal: 0, testsPassed: 0 },
    { testsPassed: 9 }, { testsPassed: Infinity, testsTotal: Infinity }, { testsPassed: NaN }, { stability: 0.9 }, { moduleScope: false }]) {
    assert.equal(assessRisks(risks(), { ...facts, ...change })[1]!.status, 'OPEN');
  }
  assert.ok(assessRisks(risks(), { ...facts, moduleScope: false }).every(item => item.status === 'OPEN'));
});
test('risk review: arbitrary claims cannot masquerade as a canonical verified or excluded declaration', () => {
  const entries = risks().map(item => ({ ...item, statement: '任意安全漏洞已解决' }));
  assert.ok(assessRisks(entries, facts).every(item => item.status === 'OPEN'));
});
test('risk review: previous successful assessments cannot clear a later failing version', () => {
  const first = assessRisks(risks(), facts);
  const second = assessRisks(first, { ...facts, evaluationRef: ref('next-version'), passed: false });
  assert.equal(first[1]!.status, 'VERIFIED'); assert.equal(second[1]!.status, 'OPEN');
  assert.deepEqual(second[1]!.evidenceRefs, [source]);
});
test('risk review: worker and session provenance separates otherwise identical declarations', () => {
  const second = collectRisks([{ ref: ref('other-session'), content: { unresolvedRisks: ['缺少逃逸行为源码'] } }]);
  assert.notEqual(second[0]!.riskId, risks()[0]!.riskId);
});
