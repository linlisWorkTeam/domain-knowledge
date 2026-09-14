/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证文档分块角色的行为、约束及失败场景。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { execute } from './DocWorkerAgent.ts';
import type { Input } from './DocWorkerAgentContract.ts';
import { roleExample } from '../../../../../../tests/helpers/RoleExample.ts';

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

test('doc-worker preserves structured evidence and unresolved questions in its handoff', async () => {
  const sample = roleExample<Input>('doc-worker');
  sample.output.unresolvedQuestions = ['Missing dependency implementation'];
  sample.context.model.execute = async () => sample.output;
  const result = await execute(sample.input, sample.context);
  assert.deepEqual(JSON.parse(result.artifacts[0]!.content), sample.output);
  assert.deepEqual(result.payload.unresolvedRisks, sample.output.unresolvedQuestions);
  assert.deepEqual(result.payload.provenance, sample.input.provenance);
});

test('doc-worker rejects invented coverage, unauthorized evidence and unsupported files', async () => {
  for (const mode of ['module', 'coverage', 'evidence', 'missing-evidence'] as const) {
    const sample = roleExample<Input>('doc-worker');
    if (mode === 'module') sample.output.analysisScope.moduleId = 'another-module';
    if (mode === 'coverage') sample.output.analysisScope.files = ['private.ts'];
    if (mode === 'evidence') sample.output.sourceEvidence[0].path = 'private.ts';
    if (mode === 'missing-evidence') sample.output.sourceEvidence[0].path = sample.input.publicInterfacePaths[0];
    sample.context.model.execute = async () => sample.output;
    await assert.rejects(execute(sample.input, sample.context), /DOCWORKER_(COVERAGE|EVIDENCE)/);
  }
});
