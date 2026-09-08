import assert from 'node:assert/strict';
import test from 'node:test';
import { execute } from './agent.ts';
import type { Input } from './contract.ts';
import { roleExample } from '../../../../tests/helpers/role-example.ts';

test('doc-gen: normal output uses one model call and validates before returning artifacts', async () => {
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
