/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证只读检查角色的行为、约束及失败场景。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { execute } from './CheckAgent.ts';
import type { Input } from './CheckAgentContract.ts';
import { roleExample } from '../../../../tests/helpers/RoleExample.ts';

test('check: normal output uses one model call and validates before returning artifacts', async () => {
  const sample = roleExample<Input>('check');
  const result = await execute(sample.input, sample.context);
  assert.deepEqual(result.output, sample.output);
  assert.deepEqual(sample.phases, ['model', 'validate']);
  assert.ok(result.payload.resultKind);
});
test('check: missing referenced material fails before model execution', async () => {
  const sample = roleExample<Input>('check');
  sample.input.materials = [];
  await assert.rejects(execute(sample.input, sample.context), /AGENT_MATERIAL_MISSING/);
  assert.deepEqual(sample.phases, []);
});
test('check: invalid output is rejected without a business retry', async () => {
  const sample = roleExample<Input>('check');
  let calls = 0;
  sample.context.model.execute = async () => { calls++; return {}; };
  await assert.rejects(execute(sample.input, sample.context), /AGENT_OUTPUT_INVALID/);
  assert.equal(calls, 1);
});
test('check: cancellation before and during model execution cannot return success', async () => {
  const before = roleExample<Input>('check'); before.controller.abort();
  await assert.rejects(execute(before.input, before.context), /AGENT_CANCELLED/);
  assert.deepEqual(before.phases, []);
  const during = roleExample<Input>('check');
  during.context.model.execute = async () => { during.controller.abort(); return during.output; };
  await assert.rejects(execute(during.input, during.context), /AGENT_CANCELLED/);
  assert.deepEqual(during.phases, []);
});

test('check: blocking findings bind a criterion to a real generated file and line', async () => {
  const sample = roleExample<Input>('check');
  const path = sample.output.scope[0];
  const output = { blocking: true, findings: ['接口输出字段缺失'], scope: [path],
    evidence: [{ criterionId: 'public-interface', path, line: 1, message: '接口输出字段缺失', severity: 'BLOCKER' }] };
  sample.context.model.execute = async () => output;
  const result = await execute(sample.input, sample.context);
  const finding = (result.payload.findings as { evidenceLocation: string }[])[0]!;
  assert.equal(finding.evidenceLocation, `${path}:1`);
  output.evidence[0]!.line = 100;
  await assert.rejects(execute(sample.input, sample.context), /CHECK_EVIDENCE_LOCATION_INVALID/);
  output.evidence = [];
  await assert.rejects(execute(sample.input, sample.context), /CHECK_BLOCKING_EVIDENCE_REQUIRED/);
});
