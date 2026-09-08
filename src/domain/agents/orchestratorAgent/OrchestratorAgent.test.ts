/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证业务计划角色的行为、约束及失败场景。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { execute } from './OrchestratorAgent.ts';
import type { Input } from './OrchestratorAgentContract.ts';
import { roleExample } from '../../../../tests/helpers/RoleExample.ts';

test('orchestrator: normal output uses one model call and validates before returning artifacts', async () => {
  const sample = roleExample<Input>('orchestrator');
  const result = await execute(sample.input, sample.context);
  assert.deepEqual(result.output, sample.output);
  assert.deepEqual(sample.phases, ['model', 'validate']);
  assert.ok(result.payload.resultKind);
});
test('orchestrator: missing referenced material fails before model execution', async () => {
  const sample = roleExample<Input>('orchestrator');
  sample.input.materials = [];
  await assert.rejects(execute(sample.input, sample.context), /AGENT_MATERIAL_MISSING/);
  assert.deepEqual(sample.phases, []);
});
test('orchestrator: invalid output is rejected without a business retry', async () => {
  const sample = roleExample<Input>('orchestrator');
  let calls = 0;
  sample.context.model.execute = async () => { calls++; return {}; };
  await assert.rejects(execute(sample.input, sample.context), /AGENT_OUTPUT_INVALID/);
  assert.equal(calls, 1);
});
test('orchestrator: cancellation before and during model execution cannot return success', async () => {
  const before = roleExample<Input>('orchestrator'); before.controller.abort();
  await assert.rejects(execute(before.input, before.context), /AGENT_CANCELLED/);
  assert.deepEqual(before.phases, []);
  const during = roleExample<Input>('orchestrator');
  during.context.model.execute = async () => { during.controller.abort(); return during.output; };
  await assert.rejects(execute(during.input, during.context), /AGENT_CANCELLED/);
  assert.deepEqual(during.phases, []);
});
