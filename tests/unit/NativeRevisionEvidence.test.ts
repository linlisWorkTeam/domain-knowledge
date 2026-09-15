/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证修订材料只绑定参考可信且当前章节有效的行为失败。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256, type ArtifactRef } from '../../src/domain/Domain.ts';
import { nativeRevisionEvidence } from '../../src/domain/evaluation/NativeRevisionEvidence.ts';
import type { NativeTestSet } from '../../src/domain/evaluation/NativeTestCache.ts';
import type { NativeBehaviorSuite } from '../../src/domain/evaluation/NativeBehaviorSuite.ts';
function fixture() {
  const body = '# Card\n\n## Behavior\nReturns one.\n\n## Limits\nIntegers only.\n';
  const cards = [{ cardId: 'card', versionId: 'v1', body, bodyDigest: sha256(body) }];
  const ref: ArtifactRef = { artifactId: 'sha256:x', sha256: 'x', size: 1, mediaType: 'application/json' };
  const suite: NativeBehaviorSuite = { schemaVersion: 'native-cases-v1', cases: [{ caseId: 'one', description: 'one', sections: ['card#Behavior'], variables: [], calls: [{ function: 'one', arguments: [], result: 'result' }], observations: [{ name: 'result', kind: 'integer', read: { variable: 'result' } }], expected: { result: '1' } }] };
  const set: NativeTestSet = { testSetId: 'set', cacheKey: 'cache', referenceKey: 'ref', parentTestSetId: null, originVersionIds: ['v1'], sourceRevision: 'commit', projectSnapshotId: 'snapshot', binding: { cardIds: ['card'], knowledgeBodyDigests: [sha256(body)], referenceDigest: 'ref', interfaceDigest: 'api', policyDigest: 'policy', toolchainDigest: 'tool' }, status: 'TRUSTED', suiteRef: ref, oracleRef: ref, referenceRef: ref, fingerprintRef: ref, createdAt: 'now', sectionBindings: [{ sectionId: 'card#Behavior', versionId: 'v1', matchesInput: true }] };
  const oracle = [{ caseId: 'one', status: 'PASSED' as const, actual: { result: '1' } }];
  const report = { testSetId: 'set', cases: [{ caseId: 'one', status: 'FAILED' as 'PASSED' | 'FAILED', reasonCode: 'NATIVE_BEHAVIOR_MISMATCH', actual: { result: '0' } as { result: string } | null, input: suite.cases[0]! }] };
  return { cards, set, suite, oracle, report };
}
test('trusted behavior failure locates exact current H2 but never authorizes revision by itself', () => {
  const f = fixture(); const result = nativeRevisionEvidence(f.set, f.suite, f.oracle, f.report, f.cards);
  assert.equal(result.failed, 1); assert.equal(result.nextAction, 'REVIEW_CURRENT_SECTIONS');
  assert.deepEqual(result.candidates[0]?.sections, [{ sectionId: 'card#Behavior', heading: 'Behavior', text: '## Behavior\nReturns one.\n\n', caseIds: ['one'] }]);
  assert.equal(result.knowledgeErrorProven, false); assert.equal(result.revisionAuthorized, false);
  f.report.cases[0]!.status = 'PASSED'; f.report.cases[0]!.actual = { result: '1' };
  assert.equal(nativeRevisionEvidence(f.set, f.suite, f.oracle, f.report, f.cards).nextAction, 'NO_BEHAVIOR_REVISION_REQUIRED');
});
test('reference rejection and altered expected values cannot become revision evidence', () => {
  const f = fixture(); f.oracle[0]!.actual.result = '0';
  assert.throws(() => nativeRevisionEvidence(f.set, f.suite, f.oracle, f.report, f.cards), /REVISION_REFERENCE_NOT_TRUSTED/);
  f.oracle[0]!.actual.result = '1'; f.report.cases[0]!.input = { ...f.suite.cases[0]!, expected: { result: '0' } };
  assert.throws(() => nativeRevisionEvidence(f.set, f.suite, f.oracle, f.report, f.cards), /REVISION_REPORT_BINDING_INVALID/);
});
test('stale versions, removed or ambiguous headings, and build failures stay unresolved', () => {
  for (const mutate of [(f: ReturnType<typeof fixture>) => { f.set.sectionBindings[0]!.matchesInput = false; },
    (f: ReturnType<typeof fixture>) => { f.set.sectionBindings[0]!.versionId = 'old'; },
    (f: ReturnType<typeof fixture>) => { f.cards[0]!.versionId = 'metadata-only-new-version'; },
    (f: ReturnType<typeof fixture>) => { f.set.sectionBindings.push({ ...f.set.sectionBindings[0]! }); }]) {
    const f = fixture(); mutate(f); const result = nativeRevisionEvidence(f.set, f.suite, f.oracle, f.report, f.cards);
    assert.equal(result.candidates.length, 0); assert.equal(result.unresolved[0]?.reason, 'CURRENT_SECTION_REQUIRED');
  }
  for (const body of ['# Card\n## Renamed\nOld heading removed.', '# Card\n## Behavior\nOne.\n## Behavior\nTwo.']) {
    const changed = fixture(); changed.cards[0]!.body = body; changed.cards[0]!.bodyDigest = sha256(body); changed.set.binding.knowledgeBodyDigests = [sha256(body)];
    const result = nativeRevisionEvidence(changed.set, changed.suite, changed.oracle, changed.report, changed.cards);
    assert.equal(result.candidates.length, 0); assert.equal(result.unresolved[0]?.reason, 'CURRENT_SECTION_REQUIRED');
  }
  const f = fixture(); f.report.cases[0]!.actual = null; f.report.cases[0]!.reasonCode = 'NATIVE_BUILD_FAILED';
  const result = nativeRevisionEvidence(f.set, f.suite, f.oracle, f.report, f.cards);
  assert.equal(result.candidates.length, 0); assert.equal(result.nextAction, 'RESOLVE_DIAGNOSTIC');
  f.cards[0]!.body += 'changed';
  assert.throws(() => nativeRevisionEvidence(f.set, f.suite, f.oracle, f.report, f.cards), /REVISION_KNOWLEDGE_BINDING_INVALID/);
});
