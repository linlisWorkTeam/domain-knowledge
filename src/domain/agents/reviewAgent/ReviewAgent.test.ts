/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证证据复核角色的行为、约束及失败场景。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { execute } from './ReviewAgent.ts';
import { buildPrompt } from './ReviewAgentPrompt.ts';
import type { Input } from './ReviewAgentContract.ts';
import { roleExample } from '../../../../tests/helpers/RoleExample.ts';

test('review: normal output uses one model call and validates before returning artifacts', async () => {
  const sample = roleExample<Input>('review');
  const result = await execute(sample.input, sample.context);
  assert.deepEqual(result.output, sample.output);
  assert.deepEqual(sample.phases, ['model', 'validate']);
  assert.ok(result.payload.resultKind);
});
test('review: missing referenced material fails before model execution', async () => {
  const sample = roleExample<Input>('review');
  sample.input.materials = [];
  await assert.rejects(execute(sample.input, sample.context), /AGENT_MATERIAL_MISSING/);
  assert.deepEqual(sample.phases, []);
});
test('review: invalid output is rejected without a business retry', async () => {
  const sample = roleExample<Input>('review');
  let calls = 0;
  sample.context.model.execute = async () => { calls++; return {}; };
  await assert.rejects(execute(sample.input, sample.context), /AGENT_OUTPUT_INVALID/);
  assert.equal(calls, 1);
});
test('review: cancellation before and during model execution cannot return success', async () => {
  const before = roleExample<Input>('review'); before.controller.abort();
  await assert.rejects(execute(before.input, before.context), /AGENT_CANCELLED/);
  assert.deepEqual(before.phases, []);
  const during = roleExample<Input>('review');
  during.context.model.execute = async () => { during.controller.abort(); return during.output; };
  await assert.rejects(execute(during.input, during.context), /AGENT_CANCELLED/);
  assert.deepEqual(during.phases, []);
});
test('review: correction IDs are normalized and bound to evaluation evidence', async () => {
  const sample = roleExample<Input>('review');
  sample.output.correction.correctionId = 'newline-failure';
  const result = await execute(sample.input, sample.context);
  const corrections = result.payload.corrections as { correctionId: string; evidenceRefs: unknown[] }[];
  assert.match(corrections[0]!.correctionId, /^COR-[0-9]{4,}$/);
  assert.deepEqual(corrections[0]!.evidenceRefs, [sample.input.payload.evaluationReportRef]);
  sample.output.blocking = true; sample.output.correction = null;
  const blocked = await execute(sample.input, sample.context);
  assert.deepEqual(blocked.payload.unresolvedRisks, ['review reported a blocking condition without a correction']);
});

test('review: correction binds both evaluation and Check evidence and rejects unknown H2', async () => {
  const sample = roleExample<Input>('review');
  sample.input.payload.checkReportRef = sample.input.payload.criteriaRef;
  const result = await execute(sample.input, sample.context);
  assert.deepEqual((result.payload.corrections as { evidenceRefs: unknown[] }[])[0]!.evidenceRefs,
    [sample.input.payload.evaluationReportRef, sample.input.payload.checkReportRef]);
  sample.output.correction.knowledgePath = 'knowledge/markdown-diff.md#Missing';
  await assert.rejects(execute(sample.input, sample.context), /REVIEW_CORRECTION_SCOPE_INVALID/);
});

test('review: replacement cannot introduce another H2 and PASS cannot hide unresolved risks', async () => {
  const sample = roleExample<Input>('review');
  sample.output.correction.replacementMarkdown = '## Behavior\nFix\n## Purpose\nChanged';
  await assert.rejects(execute(sample.input, sample.context), /REVIEW_CORRECTION_RANGE_INVALID/);
  sample.output.correction = null;
  sample.output.recommendation = 'PASS';
  sample.output.unresolvedRisks = ['missing evidence'];
  await assert.rejects(execute(sample.input, sample.context), /REVIEW_PASS_CONTRADICTION/);
});

test('review: fenced example headings cannot authorize a correction', async () => {
  const sample = roleExample<Input>('review');
  const knowledge = sample.input.materials.find(({ ref }) => ref.artifactId === sample.input.payload.knowledgeRef.artifactId)!;
  knowledge.content = '# Knowledge\n\n## Behavior\nReal section\n\n```markdown\n## Example only\n```\n';
  sample.output.correction.knowledgePath = 'knowledge/markdown-diff.md#Example only';
  await assert.rejects(execute(sample.input, sample.context), /REVIEW_CORRECTION_SCOPE_INVALID/);
  sample.output.correction.knowledgePath = 'knowledge/markdown-diff.md#Behavior';
  await execute(sample.input, sample.context);
});


test('review: prompt lists exact existing H2 targets and does not authorize subheadings or fenced headings', () => {
  const sample = roleExample<Input>('review');
  const material = sample.input.materials.find(({ ref }) => ref.artifactId === sample.input.payload.knowledgeRef.artifactId)!;
  material.content = '# Knowledge\n\n## Block syntax\n### Paragraphs\nRules\n```markdown\n## Fake heading\n```\n';
  const prompt = buildPrompt(sample.input, sample.context);
  const line = prompt.split('\n').find(x => x.startsWith('本次唯一允许的修订目标'))!;
  assert.ok(line.includes('"heading":"Block syntax"'));
  assert.ok(line.includes('knowledge/markdown-diff.md#Block syntax'));
  assert.ok(!line.includes('"heading":"Paragraphs"'));
  assert.ok(!line.includes('"heading":"Fake heading"'));
});


test('review: contradictory PASS receives one bounded feedback and preserves unresolved risk', async () => {
  const sample = roleExample<Input>('review');
  const attempts: any[] = [];
  sample.context.stageJournal = { read: async () => attempts, record: async entry => { attempts.push(entry); } };
  let calls = 0;
  sample.context.model.execute = async request => {
    calls++;
    if (calls === 2) {
      assert.match(request.prompt, /REVIEW_PASS_CONTRADICTION/);
      assert.match(request.prompt, /不能为满足结构而删除风险/);
    }
    return { blocking: true, recommendation: calls === 1 ? 'PASS' : 'ITERATE', correction: null,
      unresolvedRisks: ['missing source branch evidence'] };
  };
  const result = await execute(sample.input, sample.context);
  assert.equal(calls, 2);
  assert.deepEqual(result.payload.unresolvedRisks, ['missing source branch evidence']);
  assert.deepEqual(attempts.map(entry => entry.status), ['STARTED', 'REJECTED', 'STARTED', 'PASSED']);
  assert.equal(attempts[0].deadlineAt, attempts[2].deadlineAt);
});
