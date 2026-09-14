/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证来源发布不能冒用其他章节、任务或有风险的Review。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256 } from '../../src/domain/Domain.ts';
import { assertSourcePublicationSection } from '../../src/domain/knowledge/SourcePublication.ts';
import { SOURCE_VERIFICATION_CONTRACT } from '../../src/domain/knowledge/KnowledgeSourceVerification.ts';
function fixture(): Parameters<typeof assertSourcePublicationSection>[0] {
  const body = '# Card\n\n## Purpose\nText\n\n## Limits\nText';
  const ref = (text: string) => ({ artifactId: `sha256:${sha256(text)}`, sha256: sha256(text), size: text.length, mediaType: 'application/json' });
  const rawRef = ref('raw'), criteriaRef = ref('criteria'), referenceRef = ref('source'), observationsRef = ref('observations');
  const card = { cardId: 'card', versionId: 'version', moduleId: 'module', bodyDigest: sha256(body) };
  return { taskId: 'source', card, body, section: 'Purpose', first: true, raw: { recommendation: 'PASS', blocking: false, correction: null }, rawRef,
    command: { schemaVersion: '1.0', commandId: 'command', runId: 'source', agentType: 'review', generationKey: 'generation',
      payload: { knowledgeRef: ref(body), criteriaRef, checkReportRef: referenceRef, evaluationReportRef: observationsRef } },
    result: { schemaVersion: '1.0', commandId: 'command', runId: 'source', agentType: 'review', status: 'SUCCEEDED', commandRef: ref('command'), rawOutputRef: rawRef,
      outputRefs: [rawRef], payload: { resultKind: 'attribution', corrections: [], unresolvedRisks: [] } },
    criteria: { schemaVersion: SOURCE_VERIFICATION_CONTRACT, phase: 'FINAL_SOURCE_REVIEW', binding: card, section: 'Purpose', verifyPreamble: true, allowedKnowledgePaths: ['knowledge/module.md#Purpose'] },
    criteriaRef, referenceRef, observationsRef };
}
test('source publication binds raw PASS and normalized result to exact card section and materials', () => {
  assert.doesNotThrow(() => assertSourcePublicationSection(fixture()));
  const mutations: Array<(input: ReturnType<typeof fixture>) => void> = [
    input => { input.raw.unresolvedRisks = ['risk']; },
    input => { input.raw.blocking = true; },
    input => { input.result.runId = 'other'; },
    input => { input.result.payload.corrections = [{}]; },
    input => { input.command.payload.checkReportRef = input.criteriaRef; },
    input => { input.criteria.section = 'Limits'; },
    input => { input.criteria.verifyPreamble = false; },
    input => { input.criteria.binding = { ...input.card, versionId: 'other' }; },
    input => { input.body += '\nChanged'; },
  ];
  for (const mutate of mutations) { const input = fixture(); mutate(input); assert.throws(() => assertSourcePublicationSection(input)); }
});
