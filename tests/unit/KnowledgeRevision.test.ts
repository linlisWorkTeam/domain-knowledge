/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证修订意见不能越过可信章节范围，证据不足保留原文。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { knowledgeRevisionDecision, knowledgeRevisionOutcome, finalizeKnowledgeRevision, sourceReviewObservations } from '../../src/domain/services/knowledge/KnowledgeRevision.ts';
import type { Output } from '../../src/domain/agents/reviewAgent/ReviewAgentContract.ts';
test('revision only accepts an explicit correction within the evidence-bound headings', () => {
  const review: Output = { blocking: true, recommendation: 'ITERATE', correction: { correctionId: 'COR-0001', knowledgePath: 'knowledge/card.md#Behavior', criterion: 'Explain missing behavior', risk: 'Wrong result' } };
  assert.equal(knowledgeRevisionDecision(review, 'card', ['Behavior']).heading, 'Behavior');
  assert.throws(() => knowledgeRevisionDecision(review, 'card', ['Other']), /REVISION_CORRECTION_OUTSIDE_EVIDENCE/);
  assert.throws(() => knowledgeRevisionDecision(review, 'another-card', ['Behavior']), /REVISION_CORRECTION_OUTSIDE_EVIDENCE/);
  assert.equal(knowledgeRevisionDecision({ ...review, unresolvedRisks: ['Could be generated code'] }, 'card', ['Behavior']).heading, null);
  assert.deepEqual(knowledgeRevisionDecision({ blocking: false, recommendation: 'PASS', correction: null }, 'card', ['Behavior']), { heading: null, unresolved: [] });
  assert.ok(knowledgeRevisionDecision({ blocking: true, recommendation: 'ITERATE', correction: null }, 'card', ['Behavior']).unresolved.length);
});

test('revision completion never advances rejected quality or unresolved attribution', () => {
  assert.equal(knowledgeRevisionOutcome(1, false, ['ACCEPTED']), 'REVISED_INDEXED');
  assert.equal(knowledgeRevisionOutcome(1, false, ['REJECTED']), 'QUALITY_REJECTED');
  assert.equal(knowledgeRevisionOutcome(1, true, ['ACCEPTED']), 'UNRESOLVED');
  assert.equal(knowledgeRevisionOutcome(0, false, []), 'NO_REVISION');
});

test('revision keeps the fixed source footer and rejects a change that only removed provenance', () => {
  const footer = '\n\n---\n\n来源提交：`commit`；知识单元：`parse`。\n';
  const base = '# Card\n## Behavior\nBefore.' + footer;
  assert.equal(finalizeKnowledgeRevision(base, '# Card\n## Behavior\nAfter.\n', 'Behavior', { commit: 'commit', symbol: 'parse' }), '# Card\n## Behavior\nAfter.' + footer);
  assert.throws(() => finalizeKnowledgeRevision(base, '# Card\n## Behavior\nBefore.\n', 'Behavior', { commit: 'commit', symbol: 'parse' }), /KNOWLEDGE_CORRECTION_NOT_APPLIED/);
});

test('source review projects actual trusted reference observations and rejects generated failures', () => {
  const suite = { schemaVersion: 'native-cases-v1' as const, cases: [{ caseId: 'init', description: 'Reference initializes position', sections: ['card#Behavior'], variables: [], calls: [], observations: [{ name: 'pos', kind: 'integer' as const, read: { variable: 'pos' } }], expected: { pos: '0' } }] };
  const oracle = [{ caseId: 'init', status: 'PASSED' as const, actual: { pos: '0' }, unrelated: 'not forwarded' }];
  const report = sourceReviewObservations(suite, oracle, ['init']);
  assert.equal(report.observedImplementation, 'PINNED_REFERENCE');
  assert.deepEqual(report.cases[0]!.observation, { caseId: 'init', status: 'PASSED', actual: { pos: '0' } });
  assert.deepEqual(report.cases[0]!.input, suite.cases[0]);
  assert.throws(() => sourceReviewObservations(suite, [{ caseId: 'init', status: 'FAILED', actual: { pos: '1' } }], ['init']), /REVISION_REFERENCE_NOT_TRUSTED/);
  assert.throws(() => sourceReviewObservations(suite, [{ caseId: 'init', status: 'PASSED', actual: { pos: '1' } }], ['init']), /REVISION_REFERENCE_NOT_TRUSTED/);
  assert.throws(() => sourceReviewObservations(suite, oracle, ['unknown']), /REVISION_SOURCE_CASE_BINDING_INVALID/);
  assert.throws(() => sourceReviewObservations(suite, oracle, []), /REVISION_SOURCE_CASE_BINDING_INVALID/);
});
