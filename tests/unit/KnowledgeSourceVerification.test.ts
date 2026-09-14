/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证未修改卡片覆盖、版本绑定及来源风险不能被行为通过清除。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceSectionObservations, sourceCardDecision, sourceVerificationOutcome, sourceSectionDecision, sourceSectionsOutcome, type SourceCardBinding } from '../../src/domain/knowledge/KnowledgeSourceVerification.ts';
const body = '# Parser\n## Behavior\nEnd is one past the closing quote.\n## Limits\nPinned source only.\n';
const correction = { correctionId: 'COR-1', knowledgePath: 'knowledge/parser.md#Behavior', criterion: 'End is the closing quote index in the fixed source.', risk: 'Incorrect token boundary.' };
test('source contradictions remain actionable without a generated behavior failure; unknown risks cannot become PASS', () => {
  assert.deepEqual(sourceCardDecision('parser', body, { recommendation: 'ITERATE', blocking: true, correction, unresolvedRisks: [] }), { outcome: 'SOURCE_MISMATCH', heading: 'Behavior', unresolved: [] });
  const uncertain = sourceCardDecision('parser', body, { recommendation: 'ITERATE', blocking: true, correction, unresolvedRisks: ['Reference evidence incomplete.'] });
  assert.equal(uncertain.outcome, 'UNRESOLVED'); assert.equal(uncertain.heading, null);
  assert.throws(() => sourceCardDecision('parser', body, { recommendation: 'ITERATE', blocking: true, correction: { ...correction, knowledgePath: 'knowledge/parser.md#Unknown' } }), /REVISION_CORRECTION_OUTSIDE_EVIDENCE/);
});
test('all frozen cards are required, including unchanged cards; stale and duplicate results are rejected', () => {
  const expected: SourceCardBinding[] = [{ cardId: 'parser', versionId: 'v1', moduleId: 'parser', bodyDigest: 'a'.repeat(64) }, { cardId: 'init', versionId: 'v2', moduleId: 'init', bodyDigest: 'b'.repeat(64) }];
  const passed = expected.map(card => ({ ...card, outcome: 'SOURCE_MATCHED' as const }));
  assert.equal(sourceVerificationOutcome(expected, passed), 'SOURCE_MATCHED');
  assert.equal(sourceVerificationOutcome(expected, [{ ...passed[0]!, outcome: 'SOURCE_MISMATCH' }, passed[1]!]), 'SOURCE_MISMATCH');
  assert.throws(() => sourceVerificationOutcome(expected, [passed[1]!]), /SOURCE_VERIFICATION_BINDING_INVALID/);
  assert.throws(() => sourceVerificationOutcome(expected, [passed[0]!, passed[0]!]), /SOURCE_VERIFICATION_BINDING_INVALID/);
  assert.throws(() => sourceVerificationOutcome(expected, [{ ...passed[0]!, bodyDigest: 'old body' }, passed[1]!]), /SOURCE_VERIFICATION_BINDING_INVALID/);
  assert.throws(() => sourceVerificationOutcome(expected, [{ ...passed[0]!, versionId: 'old version' }, passed[1]!]), /SOURCE_VERIFICATION_BINDING_INVALID/);
});

test('section-by-section checks require complete H2 coverage and prohibit a correction to another section', () => {
  assert.equal(sourceSectionDecision('parser', body, 'Behavior', { recommendation: 'ITERATE', blocking: true, correction, unresolvedRisks: [] }).outcome, 'SOURCE_MISMATCH');
  assert.throws(() => sourceSectionDecision('parser', body, 'Limits', { recommendation: 'ITERATE', blocking: true, correction, unresolvedRisks: [] }), /SOURCE_VERIFICATION_SECTION_INVALID/);
  assert.throws(() => sourceSectionsOutcome(body, [{ section: 'Behavior', outcome: 'SOURCE_MATCHED' }]), /SOURCE_VERIFICATION_SECTION_INVALID/);
  assert.equal(sourceSectionsOutcome(body, [{ section: 'Behavior', outcome: 'SOURCE_MATCHED' }, { section: 'Limits', outcome: 'SOURCE_MISMATCH' }]), 'SOURCE_MISMATCH');
  assert.equal(sourceSectionsOutcome(body, [{ section: 'Behavior', outcome: 'SOURCE_MATCHED' }, { section: 'Limits', outcome: 'UNRESOLVED' }]), 'UNRESOLVED');
});

test('section evidence filters exact card bindings only after validating the complete oracle', () => {
  const make = (caseId: string, section: string) => ({ caseId, description: caseId, sections: [section], variables: [], calls: [], observations: [{ name: 'value', kind: 'integer' as const, read: { variable: 'value' } }], expected: { value: '7' } });
  const suite = { schemaVersion: 'native-cases-v1' as const, cases: [make('one', 'card#Behavior'), make('other', 'other#Behavior')] };
  const oracle = suite.cases.map(test => ({ caseId: test.caseId, status: 'PASSED' as const, actual: { value: '7' } }));
  const selected = sourceSectionObservations(suite, oracle, 'card', 'Behavior');
  assert.deepEqual(selected.cases.map(item => item.input.caseId), ['one']);
  assert.equal(selected.coverage, 'DIRECT_BEHAVIOR_EVIDENCE');
  assert.deepEqual(selected.relatedObservations.map(item => [item.caseId, item.actual]), [['other', { value: '7' }]]);
  const empty = sourceSectionObservations(suite, oracle, 'card', 'Sources');
  assert.deepEqual(empty.cases, []); assert.equal(empty.coverage, 'NO_DIRECT_BEHAVIOR_EVIDENCE');
  assert.deepEqual(empty.relatedObservations.map(item => item.caseId), ['one', 'other']);
  assert.throws(() => sourceSectionObservations(suite, [oracle[0]!], 'card', 'Sources'), /REVISION_REFERENCE_NOT_TRUSTED/);
  assert.throws(() => sourceSectionObservations(suite, [oracle[0]!, { ...oracle[1]!, actual: { value: '9' } }], 'card', 'Behavior'), /REVISION_REFERENCE_NOT_TRUSTED/);
});
