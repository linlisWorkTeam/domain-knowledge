/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证文档生成角色的行为、约束及失败场景。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { execute } from './DocGenAgent.ts';
import type { Input } from './DocGenAgentContract.ts';
import { roleExample } from '../../../../tests/helpers/RoleExample.ts';

test('doc-gen: synthesis-only mode uses one model call and validates before returning artifacts', async () => {
  const sample = roleExample<Input>('doc-gen');
  const result = await execute(sample.input, sample.context);
  assert.deepEqual(result.output, sample.output);
  assert.deepEqual(sample.phases, ['model', 'validate']);
  assert.ok(result.payload.resultKind);
});
test('doc-gen: missing referenced material fails before model execution', async () => {
  const sample = roleExample<Input>('doc-gen');
  sample.input.materials = [];
  await assert.rejects(execute(sample.input, sample.context), /AGENT_MATERIAL_MISSING/);
  assert.deepEqual(sample.phases, []);
});
test('doc-gen: invalid output is rejected without a business retry', async () => {
  const sample = roleExample<Input>('doc-gen');
  let calls = 0;
  sample.context.model.execute = async () => { calls++; return {}; };
  await assert.rejects(execute(sample.input, sample.context), /AGENT_OUTPUT_INVALID/);
  assert.equal(calls, 1);
});
test('doc-gen: cancellation before and during model execution cannot return success', async () => {
  const before = roleExample<Input>('doc-gen'); before.controller.abort();
  await assert.rejects(execute(before.input, before.context), /AGENT_CANCELLED/);
  assert.deepEqual(before.phases, []);
  const during = roleExample<Input>('doc-gen');
  during.context.model.execute = async () => { during.controller.abort(); return during.output; };
  await assert.rejects(execute(during.input, during.context), /AGENT_CANCELLED/);
  assert.deepEqual(during.phases, []);
});
test('doc-gen: revision includes previous body, worker fragments and correction evidence', async () => {
  const sample = roleExample<Input>('doc-gen');
  const result = await execute(sample.input, sample.context);
  assert.match(sample.requests[0]!.prompt, /baseKnowledgeRef|workerFragmentRefs/);
  assert.match(sample.requests[0]!.prompt, /CRLF normalization mismatch/);
  assert.match(sample.requests[0]!.prompt, /COR-0001/);
  assert.equal(result.artifacts[0]!.content, sample.output.body);
  assert.deepEqual(result.payload.bodyRef, { pendingArtifact: 'body' });
});

test('doc-gen owns nonempty source partitions and waits for all fragments before synthesis', async () => {
  const sample = roleExample<Input>('doc-gen');
  sample.input.payload.workerCount = 5;
  sample.input.sourcePaths = ['a.ts', 'b.ts', 'a.ts'];
  const seen: string[][] = [];
  const context = { ...sample.context, docWorkers: { run: async (tasks: import('./DocGenAgentContract.ts').DocWorkerTask[]) => {
    assert.deepEqual(sample.phases, []);
    assert.deepEqual(tasks.map((task) => task.workerId), ['worker-1', 'worker-2']);
    seen.push(...tasks.map((task) => task.sourcePaths));
    return tasks.map((task) => ({ workerId: task.workerId, resultRef: sample.input.provenance[0]!,
      unresolvedRisks: ['Missing dependency'],
      material: { ref: sample.input.provenance[0]!, content: `extracted ${task.sourcePaths[0]}` } })).reverse();
  } } };
  const result = await execute(sample.input, context);
  assert.deepEqual(seen, [['a.ts'], ['b.ts']]);
  assert.deepEqual(result.payload.unresolvedRisks, ['Missing dependency']);
  assert.deepEqual(sample.phases, ['model', 'validate']);
  assert.match(sample.requests[0]!.prompt, /extracted a.ts/);
  assert.match(sample.requests[0]!.prompt, /extracted b.ts/);
  assert.equal((result.payload.workerResultRefs as unknown[]).length, 2);
});

test('doc-gen rejects incomplete or failed workers before synthesis', async () => {
  for (const mode of ['missing-port', 'incomplete', 'failure', 'cancelled'] as const) {
    const sample = roleExample<Input>('doc-gen');
    sample.input.payload.workerCount = 1;
    const context = { ...sample.context, ...(mode !== 'missing-port' ? { docWorkers: { run: async () => {
      if (mode === 'failure') throw new Error('worker failed');
      if (mode === 'cancelled') sample.controller.abort();
      return [];
    } } } : {}) };
    await assert.rejects(execute(sample.input, context), mode === 'missing-port' ? /EXECUTOR_MISSING/
      : mode === 'incomplete' ? /RESULTS_INCOMPLETE/ : mode === 'failure' ? /worker failed/ : /AGENT_CANCELLED/);
    assert.deepEqual(sample.phases, []);
  }
});

test('doc-gen validates worker count and defaults to one internal task', async () => {
  const sample = roleExample<Input>('doc-gen');
  delete sample.input.payload.workerCount;
  await assert.rejects(execute(sample.input, sample.context), /EXECUTOR_MISSING/);
  for (const count of [-1, 6, 0.5, NaN]) {
    sample.input.payload.workerCount = count;
    await assert.rejects(execute(sample.input, sample.context), /WORKER_COUNT_INVALID/);
  }
  assert.deepEqual(sample.phases, []);
});
