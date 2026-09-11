/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证来源意见只授权原卡片和原始角色绑定的明确修订。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256, type ArtifactRef } from '../../src/domain/Domain.ts';
import { authorizeSourceCorrection, sourceCorrectionCandidates, SOURCE_CORRECTION_POLICY } from '../../src/domain/services/knowledge/SourceRevision.ts';
const body = '# Parser\n## Behavior\nReturn the difference.\n';
const ref = (digest: string): ArtifactRef => ({ artifactId: digest, sha256: digest, mediaType: 'application/json', size: 1 });
const correction = { correctionId: 'provider-label', knowledgePath: 'knowledge/parser.md#Behavior', criterion: 'Return the sum shown by fixed source.', risk: 'Wrong operation.' };
const input: Parameters<typeof authorizeSourceCorrection>[0] = {
  sourceTaskId: 'source-task', body, card: { cardId: 'card', versionId: 'version', moduleId: 'parser', bodyDigest: sha256(body), outcome: 'SOURCE_MISMATCH' },
  raw: { recommendation: 'ITERATE', blocking: true, correction, unresolvedRisks: [] }, rawRef: ref('a'.repeat(64)),
  command: { schemaVersion: '1.0', commandId: 'review-command', runId: 'source-task', agentType: 'review', generationKey: 'frozen', payload: { knowledgeRef: ref(sha256(body)) } },
  result: { schemaVersion: '1.0', commandId: 'review-command', commandRef: ref('c'.repeat(64)), runId: 'source-task', agentType: 'review', status: 'SUCCEEDED', rawOutputRef: ref('a'.repeat(64)), outputRefs: [], payload: { corrections: [{ ...correction, correctionId: 'COR-0001' }] } },
};
test('source correction retains its distinct origin without a fabricated failing test', () => {
  const authorized = authorizeSourceCorrection(input);
  assert.equal(authorized.origin, 'PINNED_SOURCE_CONTRADICTION'); assert.equal(authorized.heading, 'Behavior');
  assert.equal(authorized.correction.correctionId, 'COR-0001'); assert.equal(authorized.versionId, 'version');
  assert.throws(() => authorizeSourceCorrection({ ...input, body: body + ' changed' }), /SOURCE_REVISION_BINDING_INVALID/);
  assert.throws(() => authorizeSourceCorrection({ ...input, command: { ...input.command, payload: { knowledgeRef: ref('b'.repeat(64)) } } }), /SOURCE_REVISION_BINDING_INVALID/);
  assert.throws(() => authorizeSourceCorrection({ ...input, result: { ...input.result, runId: 'other-task' } }), /SOURCE_REVISION_BINDING_INVALID/);
  assert.throws(() => authorizeSourceCorrection({ ...input, rawRef: ref('b'.repeat(64)) }), /SOURCE_REVISION_BINDING_INVALID/);
});
test('unknown risks, unrequested edits and unmatched normalized corrections are never source repair authorization', () => {
  assert.throws(() => authorizeSourceCorrection({ ...input, raw: { ...input.raw, unresolvedRisks: ['Unknown'] } }), /SOURCE_REVISION_EXPLICIT_CORRECTION_REQUIRED/);
  assert.throws(() => authorizeSourceCorrection({ ...input, raw: { recommendation: 'PASS', blocking: false, correction: null } }), /SOURCE_REVISION_EXPLICIT_CORRECTION_REQUIRED/);
  assert.throws(() => authorizeSourceCorrection({ ...input, result: { ...input.result, payload: { corrections: [{ ...correction, correctionId: 'COR-0001', criterion: 'Injected edit' }] } } }), /SOURCE_REVISION_BINDING_INVALID/);
});

test('mixed whole-card risks retain their block while only bound explicit sections are selected', () => {
  type Finding = typeof input.card & { unresolved?: string[]; section?: string; sections?: Finding[] };
  const section = { ...input.card, unresolved: [] as string[], section: 'Behavior' };
  const unknown = { ...section, outcome: 'UNRESOLVED' as const, unresolved: ['Missing evidence'], section: 'Sources' };
  const card = { ...input.card, outcome: 'UNRESOLVED' as const, unresolved: ['Missing evidence'], sections: [unknown, section] };
  const before = JSON.stringify(card);
  assert.deepEqual(sourceCorrectionCandidates<Finding>([card]), []);
  assert.deepEqual(sourceCorrectionCandidates<Finding>([card], SOURCE_CORRECTION_POLICY), [section]);
  assert.equal(JSON.stringify(card), before);
  assert.equal(authorizeSourceCorrection({ ...input, card: section }).heading, 'Behavior');
  assert.deepEqual(sourceCorrectionCandidates<Finding>([{ ...card, sections: [unknown] }], SOURCE_CORRECTION_POLICY), []);
  assert.deepEqual(sourceCorrectionCandidates<Finding>([{ ...card, sections: [{ ...section, unresolved: ['Unproven correction'] }] }], SOURCE_CORRECTION_POLICY), []);
  for (const key of ['cardId', 'versionId', 'moduleId', 'bodyDigest']) {
    assert.throws(() => sourceCorrectionCandidates<Finding>([{ ...card, sections: [{ ...section, [key]: 'other' }] }], SOURCE_CORRECTION_POLICY), /SOURCE_CORRECTION_SECTION_BINDING_INVALID/);
  }
  assert.throws(() => sourceCorrectionCandidates<Finding>([card], 'unknown'), /SOURCE_CORRECTION_POLICY_INVALID/);
});
