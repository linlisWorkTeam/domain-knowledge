/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证未修改卡片覆盖、版本绑定及来源风险不能被行为通过清除。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceCardDecision, sourceVerificationOutcome, type SourceCardBinding } from '../../src/domain/services/knowledge/KnowledgeSourceVerification.ts';
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
