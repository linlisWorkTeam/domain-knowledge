/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证证据授权范围在 Review 模型协议、提示词和角色校验中一致。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createArtifactRef } from '../../src/domain/Domain.ts';
import { schemaFor, outputSchema, correctionTargets, validateInput, validateOutput, type Input } from '../../src/domain/agents/reviewAgent/ReviewAgentContract.ts';
import { buildPrompt } from '../../src/domain/agents/reviewAgent/ReviewAgentPrompt.ts';
import { assertModelOutput } from '../../src/infrastructure/agentAdapters/ModelExecution.ts';
function input(paths?: string[]): Input {
  const body = '# Card\n## Behavior\nReturn the sum.\n## Limits\nRepresentable inputs only.';
  const criteria = paths ? { allowedKnowledgePaths: paths } : {};
  const knowledgeRef = createArtifactRef(Buffer.from(body), 'text/markdown');
  const criteriaRef = createArtifactRef(Buffer.from(JSON.stringify(criteria)), 'application/json');
  const evaluationReportRef = createArtifactRef(Buffer.from('{}'), 'application/json');
  return { moduleId: 'card', sourcePaths: [], publicInterfacePaths: [], provenance: [],
    payload: { knowledgeRef, criteriaRef, evaluationReportRef }, materials: [{ ref: knowledgeRef, content: body }, { ref: criteriaRef, content: criteria }, { ref: evaluationReportRef, content: {} }] };
}
test('evidence headings constrain both advertised and validated Review output before acceptance', () => {
  const value = input(['knowledge/card.md#Behavior']); validateInput(value);
  assert.deepEqual(correctionTargets(value), [{ heading: 'Behavior', knowledgePath: 'knowledge/card.md#Behavior' }]);
  const output = { blocking: true, recommendation: 'ITERATE' as const, correction: { correctionId: 'fix', knowledgePath: 'knowledge/card.md#Limits', criterion: 'Clarify bounds', risk: 'Undefined range' } };
  assert.throws(() => assertModelOutput(output, schemaFor(value)), /AGENT_OUTPUT_INVALID/);
  assert.throws(() => validateOutput(output, value), /REVIEW_CORRECTION_OUTSIDE_EVIDENCE/);
  const prompt = buildPrompt(value, { effectivePrompt: 'Review the evidence', command: {} } as Parameters<typeof buildPrompt>[1]);
  assert.match(prompt, /"knowledgePath":"knowledge\/card.md#Behavior"/);
  assert.doesNotMatch(prompt, /"knowledgePath":"knowledge\/card.md#Limits"/);
  output.correction.knowledgePath = 'knowledge/card.md#Behavior';
  assertModelOutput(output, schemaFor(value)); validateOutput(output, value);
});
test('legacy Review keeps its schema; invalid or foreign evidence targets fail before a model call', () => {
  assert.equal(schemaFor(input()), outputSchema);
  assert.equal(correctionTargets(input()).length, 2);
  assert.throws(() => validateInput(input(['knowledge/other.md#Behavior'])), /REVIEW_CORRECTION_SCOPE_INVALID/);
  assert.throws(() => validateInput(input(['knowledge/card.md#Missing'])), /REVIEW_CORRECTION_SCOPE_INVALID/);
});
