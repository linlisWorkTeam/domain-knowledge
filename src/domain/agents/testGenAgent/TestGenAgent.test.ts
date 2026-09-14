/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证测试生成角色的行为、约束及失败场景。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { execute } from './TestGenAgent.ts';
import { schemaFor, validateOutput, type Input } from './TestGenAgentContract.ts';
import { assertModelOutput } from '../../../../src/infrastructure/agentAdapters/ModelExecution.ts';
import { roleExample } from '../../../../tests/helpers/RoleExample.ts';
import { planSchema } from './TestGeneration.ts';
import { AgentReportFailure, ModelResponseError } from '../AgentExecution.ts';

test('test-gen: normal output persists a plan and implementation before returning artifacts', async () => {
  const sample = roleExample<Input>('test-gen');
  const result = await execute(sample.input, sample.context);
  assert.deepEqual(result.output, sample.output);
  assert.deepEqual(sample.phases, ['model', 'validate', 'validate', 'model', 'validate', 'validate', 'validate']);
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

test('test-gen rejects undeclared test files and invented evidence and stores distinct artifacts', async () => {
  const sample = roleExample<Input>('test-gen');
  const result = await execute(sample.input, sample.context);
  assert.deepEqual(result.payload.candidateSetRef, { pendingArtifact: 'tests' });
  assert.deepEqual(result.payload.caseManifestRef, { pendingArtifact: 'cases' });
  sample.output.cases[0].sourceEvidence = ['private.cpp'];
  sample.context.model.execute = async () => sample.output;
  await assert.rejects(execute(sample.input, sample.context), /AGENT_OUTPUT_INVALID/);
  assert.throws(() => validateOutput(sample.output, sample.input), /CASE_MANIFEST_INVALID/);
  sample.output.files[0].path = '../source.cpp';
  await assert.rejects(execute(sample.input, sample.context), /AGENT_OUTPUT_INVALID/);
  assert.throws(() => validateOutput(sample.output, sample.input), /OUTPUT_PATH_INVALID/);
});

test('model schema exposes exact evidence and output boundaries before business validation', () => {
  const sample = roleExample<Input>('test-gen');
  const schema = schemaFor(sample.input);
  assert.doesNotThrow(() => assertModelOutput(sample.output, schema));
  const qualified = structuredClone(sample.output);
  qualified.cases[0].sourceEvidence = [`${sample.input.sourcePaths[0]}:calculate`];
  assert.throws(() => assertModelOutput(qualified, schema), /AGENT_OUTPUT_INVALID/);
  const extra = structuredClone(sample.output);
  extra.files.push({path: `${extra.files[0].path}.manifest.json`, content: '{}'});
  assert.throws(() => assertModelOutput(extra, schema), /AGENT_OUTPUT_INVALID/);
});

test('validated source tests bypass the model even when the prompt changes', async () => {
  const sample = roleExample<Input>('test-gen');
  sample.context.effectivePrompt = 'new prompt';
  sample.context.model.execute = async () => { throw new Error('must reuse'); };
  const result = await execute(sample.input, { ...sample.context, validatedOutput: sample.output });
  assert.deepEqual(result.output, sample.output);
});

test('TestGen bounds the plan and rejects duplicate case identities before generating batches', async () => {
  const sample = roleExample<Input>('test-gen');
  const plan = { sharedFiles: [], cases: Array.from({ length: 129 }, (_, i) => ({ ...sample.output.cases[0], caseId: `case-${i}`, entryPoint: `test_${i}` })) };
  assert.throws(() => assertModelOutput(plan, planSchema(sample.input)), /AGENT_OUTPUT_INVALID/);
  plan.cases = [sample.output.cases[0], sample.output.cases[0]];
  let calls = 0;
  sample.context.model.execute = async () => { calls++; return plan; };
  await assert.rejects(execute(sample.input, sample.context), /TESTGEN_CASE_ENTRY_INVALID/);
  assert.equal(calls, 1);
});

test('TestGen rejects repair plans that delete or rename an original failing case', async () => {
  const sample = roleExample<Input>('test-gen');
  const ref = { ...sample.input.materials[0]!.ref, artifactId: 'previous-candidate' };
  sample.input.payload.previousCandidateRef = ref;
  sample.input.payload.validationFailureRef = sample.input.materials[0]!.ref;
  sample.input.materials.push({ ref, content: sample.output });
  sample.context.model.execute = async () => ({ sharedFiles: [], cases: [{ ...sample.output.cases[0], caseId: 'replacement-case' }] });
  await assert.rejects(execute(sample.input, sample.context), /TESTGEN_REPAIR_CASE_SET_CHANGED/);
});

test('TestGen retains an invalid raw answer as failure evidence without committing it as a batch', async () => {
  const sample = roleExample<Input>('test-gen');
  sample.context.model.execute = async () => { throw new ModelResponseError('DSH_AGENT_OUTPUT_NOT_JSON', '{partial'); };
  await assert.rejects(execute(sample.input, sample.context), error => {
    assert.ok(error instanceof AgentReportFailure);
    assert.equal(JSON.parse(error.artifacts[0]!.content).raw, '{partial');
    assert.doesNotMatch(error.message, /partial/);
    return true;
  });
});
