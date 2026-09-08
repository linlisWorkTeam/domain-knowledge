/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证测试生成角色的行为、约束及失败场景。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { execute } from './TestGenAgent.ts';
import type { Input } from './TestGenAgentContract.ts';
import { roleExample } from '../../../../tests/helpers/RoleExample.ts';

test('test-gen: normal output uses one model call and validates before returning artifacts', async () => {
  const sample = roleExample<Input>('test-gen');
  const result = await execute(sample.input, sample.context);
  assert.deepEqual(result.output, sample.output);
  assert.deepEqual(sample.phases, ['model', 'validate']);
  assert.ok(result.payload.resultKind);
});
test('test-gen: missing referenced material fails before model execution', async () => {
  const sample = roleExample<Input>('test-gen');
  sample.input.materials = [];
  await assert.rejects(execute(sample.input, sample.context), /AGENT_MATERIAL_MISSING/);
  assert.deepEqual(sample.phases, []);
});
test('test-gen: invalid output is rejected without a business retry', async () => {
  const sample = roleExample<Input>('test-gen');
  let calls = 0;
  sample.context.model.execute = async () => { calls++; return {}; };
  await assert.rejects(execute(sample.input, sample.context), /AGENT_OUTPUT_INVALID/);
  assert.equal(calls, 1);
});
test('test-gen: cancellation before and during model execution cannot return success', async () => {
  const before = roleExample<Input>('test-gen'); before.controller.abort();
  await assert.rejects(execute(before.input, before.context), /AGENT_CANCELLED/);
  assert.deepEqual(before.phases, []);
  const during = roleExample<Input>('test-gen');
  during.context.model.execute = async () => { during.controller.abort(); return during.output; };
  await assert.rejects(execute(during.input, during.context), /AGENT_CANCELLED/);
  assert.deepEqual(during.phases, []);
});
test('test-gen: unrelated candidate knowledge never reaches the prompt or workspace', async () => {
  const sample = roleExample<Input>('test-gen');
  sample.input.materials.push({ ref: { ...sample.input.materials[0]!.ref, artifactId: 'unrelated-knowledge' }, content: 'CANDIDATE_KNOWLEDGE_SECRET' });
  await execute(sample.input, sample.context);
  assert.doesNotMatch(sample.requests[0]!.prompt, /CANDIDATE_KNOWLEDGE_SECRET/);
  assert.deepEqual(sample.requests[0]!.readablePaths, [...sample.input.sourcePaths, ...sample.input.publicInterfacePaths]);
});
