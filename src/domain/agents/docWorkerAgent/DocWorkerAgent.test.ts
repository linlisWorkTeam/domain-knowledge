/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证文档分块角色的行为、约束及失败场景。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { execute } from './DocWorkerAgent.ts';
import type { Input } from './DocWorkerAgentContract.ts';
import { roleExample } from '../../../../tests/helpers/RoleExample.ts';

test('doc-worker: normal output uses one model call and validates before returning artifacts', async () => {
  const sample = roleExample<Input>('doc-worker');
  const result = await execute(sample.input, sample.context);
  assert.deepEqual(result.output, sample.output);
  assert.deepEqual(sample.phases, ['model', 'validate']);
  assert.ok(result.payload.resultKind);
});
test('doc-worker: missing referenced material fails before model execution', async () => {
  const sample = roleExample<Input>('doc-worker');
  sample.input.materials = [];
  await assert.rejects(execute(sample.input, sample.context), /AGENT_MATERIAL_MISSING/);
  assert.deepEqual(sample.phases, []);
});
test('doc-worker: invalid output is rejected without a business retry', async () => {
  const sample = roleExample<Input>('doc-worker');
  let calls = 0;
  sample.context.model.execute = async () => { calls++; return {}; };
  await assert.rejects(execute(sample.input, sample.context), /AGENT_OUTPUT_INVALID/);
  assert.equal(calls, 1);
});
test('doc-worker: cancellation before and during model execution cannot return success', async () => {
  const before = roleExample<Input>('doc-worker'); before.controller.abort();
  await assert.rejects(execute(before.input, before.context), /AGENT_CANCELLED/);
  assert.deepEqual(before.phases, []);
  const during = roleExample<Input>('doc-worker');
  during.context.model.execute = async () => { during.controller.abort(); return during.output; };
  await assert.rejects(execute(during.input, during.context), /AGENT_CANCELLED/);
  assert.deepEqual(during.phases, []);
});

test('doc-worker: source facts are bound to exact authorized lines and risks survive the artifact', async () => {
  const sample = roleExample<Input>('doc-worker');
  const result = await execute(sample.input, sample.context);
  const chunk = JSON.parse(result.artifacts[0]!.content);
  assert.deepEqual(chunk.facts, sample.output.facts);
  assert.deepEqual(result.payload.unresolvedRisks, sample.output.unresolvedRisks);
  assert.deepEqual(result.payload.provenance, sample.input.payload.sourceRefs);
  assert.equal(sample.requests[0]!.stage, 'extract');
});

test('doc-worker: rejects invented quotes, ranges, paths and hidden uncertainty', async () => {
  for (const [mutate, expected] of [
    [(output: any) => { output.facts[0].quote = 'not in the source'; }, /QUOTE_MISMATCH/],
    [(output: any) => { output.facts[0].endLine = 500; }, /RANGE_INVALID/],
    [(output: any) => { output.facts[0].sourcePath = '../hidden.ts'; }, /SOURCE_DENIED/],
    [(output: any) => { output.provenance = ['../hidden.ts']; }, /PROVENANCE_DENIED/],
    [(output: any) => { output.facts = []; output.unresolvedRisks = []; }, /MISSING_EVIDENCE_RISK/],
  ] as const) {
    const sample = roleExample<Input>('doc-worker');
    mutate(sample.output);
    await assert.rejects(execute(sample.input, sample.context), expected);
  }
});

test('doc-worker: metadata alone or unrelated material cannot prove source quotes', async () => {
  const sample = roleExample<Input>('doc-worker');
  const source = sample.input.materials.find(({ ref }) => ref.artifactId === sample.input.payload.sourceRefs[0]!.artifactId)!;
  const original = source.content;
  source.content = { path: sample.input.sourcePaths[0], sha256: 'metadata-only' };
  sample.input.materials.push({ ref: { ...source.ref, artifactId: 'unrelated' }, content: original });
  await assert.rejects(execute(sample.input, sample.context), /SOURCE_TEXT_MISSING/);
});

test('doc-worker: assigned paths cannot broaden the source authorization', async () => {
  const sample = roleExample<Input>('doc-worker');
  sample.input.payload.assignedSourcePaths = ['../other.ts'];
  await assert.rejects(execute(sample.input, sample.context), /ASSIGNED_SOURCE_DENIED/);
  assert.deepEqual(sample.phases, []);
});
