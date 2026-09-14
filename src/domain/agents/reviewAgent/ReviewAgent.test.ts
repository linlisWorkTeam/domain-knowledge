/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证证据复核角色的行为、约束及失败场景。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { execute } from './ReviewAgent.ts';
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
  sample.output.corrections[0].correctionId = 'newline-failure';
  const result = await execute(sample.input, sample.context);
  const corrections = result.payload.corrections as { correctionId: string; evidenceRefs: unknown[] }[];
  assert.match(corrections[0]!.correctionId, /^COR-[0-9]{4,}$/);
  assert.deepEqual(corrections[0]!.evidenceRefs, [sample.input.payload.evaluationReportRef]);
  sample.output.blocking = true; sample.output.corrections = [];
  const blocked = await execute(sample.input, sample.context);
  assert.deepEqual(blocked.payload.unresolvedRisks, ['review reported a blocking condition without a correction']);
});

test('review: multiple corrections bind to their selected trusted reports', async () => {
  const sample = roleExample<Input>('review');
  sample.output.corrections.push({ ...sample.output.corrections[0], correctionId: 'comparison-failure', evidence: ['comparison', 'evaluation'] });
  const result = await execute(sample.input, sample.context);
  const corrections = result.payload.corrections as { evidenceRefs: unknown[]; criterion: string }[];
  assert.equal(corrections.length, 2);
  assert.deepEqual(corrections[1]!.evidenceRefs, [sample.input.payload.comparisonReportRef, sample.input.payload.evaluationReportRef]);
  assert.match(corrections[1]!.criterion, /Document return value/);
  sample.output.corrections[0].knowledgePath = 'another document';
  await assert.rejects(execute(sample.input, sample.context), /REVIEW_LOCATION_INVALID/);
});
