/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证代码生成角色的行为、约束及失败场景。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { execute } from './CodeAgent.ts';
import type { Input } from './CodeAgentContract.ts';
import { roleExample } from '../../../../tests/helpers/RoleExample.ts';

test('code: normal output uses one model call and validates before returning artifacts', async () => {
  const sample = roleExample<Input>('code');
  const result = await execute(sample.input, sample.context);
  assert.deepEqual(result.output, sample.output);
  assert.deepEqual(sample.phases, ['model', 'validate']);
  assert.ok(result.payload.resultKind);
});
test('code: missing referenced material fails before model execution', async () => {
  const sample = roleExample<Input>('code');
  sample.input.materials = [];
  await assert.rejects(execute(sample.input, sample.context), /AGENT_MATERIAL_MISSING/);
  assert.deepEqual(sample.phases, []);
});
test('code: invalid output is rejected without a business retry', async () => {
  const sample = roleExample<Input>('code');
  let calls = 0;
  sample.context.model.execute = async () => { calls++; return {}; };
  await assert.rejects(execute(sample.input, sample.context), /AGENT_OUTPUT_INVALID/);
  assert.equal(calls, 1);
});
test('code: cancellation before and during model execution cannot return success', async () => {
  const before = roleExample<Input>('code'); before.controller.abort();
  await assert.rejects(execute(before.input, before.context), /AGENT_CANCELLED/);
  assert.deepEqual(before.phases, []);
  const during = roleExample<Input>('code');
  during.context.model.execute = async () => { during.controller.abort(); return during.output; };
  await assert.rejects(execute(during.input, during.context), /AGENT_CANCELLED/);
  assert.deepEqual(during.phases, []);
});
test('code: output whitelist and duplicate paths are enforced', async () => {
  const sample = roleExample<Input>('code');
  sample.context.model.execute = async () => ({ files: [{ path: '../escape.ts', content: 'escape' }] });
  await assert.rejects(execute(sample.input, sample.context), /AGENT_OUTPUT_INVALID|PROJECT_PATH_DENIED/);
  const path = sample.input.payload.allowedGeneratedPaths[0]!;
  sample.input.payload.allowedGeneratedPaths.push('second.ts');
  sample.context.model.execute = async () => ({ files: [{ path, content: 'a' }, { path, content: 'b' }] });
  await assert.rejects(execute(sample.input, sample.context), /PROJECT_PATH_DUPLICATED/);
});

test('code: rejects unsafe caller whitelist and hides unrelated source materials', async () => {
  const sample = roleExample<Input>('code');
  sample.input.materials.push({ ref: { ...sample.input.materials[0]!.ref, artifactId: 'reference-source' }, content: 'REFERENCE_SOURCE_SECRET' });
  await execute(sample.input, sample.context);
  assert.doesNotMatch(sample.requests[0]!.prompt, /REFERENCE_SOURCE_SECRET/);
  assert.deepEqual(sample.requests[0]!.readablePaths, sample.input.publicInterfacePaths);
  sample.input.payload.allowedGeneratedPaths = ['../escape.ts'];
  await assert.rejects(execute(sample.input, sample.context), /PROJECT_PATH_DENIED/);
});
