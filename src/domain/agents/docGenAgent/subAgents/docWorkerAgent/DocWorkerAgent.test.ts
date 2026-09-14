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
  assert.deepEqual(result.output, { ...sample.output, analysisScope: { ...sample.output.analysisScope, files: sample.input.payload.assignedSourcePaths } });
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
  assert.deepEqual(JSON.parse(result.artifacts[0]!.content), result.output);
  assert.deepEqual(result.output.analysisScope.files, sample.input.payload.assignedSourcePaths);
  assert.deepEqual(result.payload.unresolvedRisks, sample.output.unresolvedQuestions);
  assert.deepEqual(result.payload.provenance, sample.input.provenance);
});

test('doc-worker rejects a wrong module, unauthorized evidence and missing source evidence', async () => {
  for (const mode of ['module', 'evidence', 'missing-evidence'] as const) {
    const sample = roleExample<Input>('doc-worker');
    if (mode === 'module') sample.output.analysisScope.moduleId = 'another-module';
    if (mode === 'evidence') sample.output.sourceEvidence[0].path = 'private.ts';
    if (mode === 'missing-evidence') sample.output.sourceEvidence[0].path = sample.input.publicInterfacePaths[0];
    sample.context.model.execute = async () => sample.output;
    await assert.rejects(execute(sample.input, sample.context), /DOCWORKER_(COVERAGE|EVIDENCE)/);
  }
});

test('doc-worker derives assigned files while allowing evidence from reference headers', async () => {
  for (const explicitAssignment of [true, false]) {
    const sample = roleExample<Input>('doc-worker');
    sample.input.sourcePaths = ['cJSON_Utils.c', 'other.c'];
    sample.input.publicInterfacePaths = ['cJSON_Utils.h', 'cJSON.h'];
    if (explicitAssignment) sample.input.payload.assignedSourcePaths = ['cJSON_Utils.c'];
    else delete sample.input.payload.assignedSourcePaths;
    const assigned = sample.input.payload.assignedSourcePaths ?? sample.input.sourcePaths;
    sample.output.analysisScope = { moduleId: sample.input.moduleId, symbols: ['cJSONUtils_GetPointer'] };
    sample.output.provenance = [...assigned, ...sample.input.publicInterfacePaths];
    sample.output.sourceEvidence = sample.output.provenance.map((path: string) => ({path, claim:'Behavior derived from authorized material'}));
    sample.context.model.execute = async (request) => { sample.requests.push(request); return sample.output; };
    const before = structuredClone(sample.output);
    const result = await execute(sample.input, sample.context);
    assert.deepEqual(result.output.analysisScope.files, assigned);
    assert.notEqual(result.output.analysisScope.files, assigned);
    assert.deepEqual(sample.output, before, 'framework must not mutate the model response');
    assert.deepEqual(result.output.sourceEvidence, before.sourceEvidence);
    assert.deepEqual(JSON.parse(result.artifacts[0]!.content).analysisScope.files, assigned);
    const scope = (sample.requests[0]!.outputSchema as {properties: {analysisScope: {properties: Record<string, unknown>; required: string[]}}}).properties.analysisScope;
    assert.equal(scope.properties.files, undefined);
    assert.equal(scope.required.includes('files'), false);
  }
});

test('doc-worker rejects model-supplied assignment metadata and missing evidence for a second source', async () => {
  const override = roleExample<Input>('doc-worker');
  override.output.analysisScope.files = ['private.c'];
  override.context.model.execute = async () => override.output;
  await assert.rejects(execute(override.input, override.context), /AGENT_OUTPUT_INVALID/);
  const missing = roleExample<Input>('doc-worker');
  missing.input.sourcePaths.push('second.c');
  missing.input.payload.assignedSourcePaths = [...missing.input.sourcePaths];
  await assert.rejects(execute(missing.input, missing.context), /DOCWORKER_EVIDENCE_MISSING/);
});

test('doc-worker rejects empty or repeated assignments before asking the model', async () => {
  for (const explicitAssignment of [true, false]) for (const empty of [true, false]) {
    const sample = roleExample<Input>('doc-worker');
    const files = empty ? [] : [sample.input.sourcePaths[0]!, sample.input.sourcePaths[0]!];
    if (explicitAssignment) sample.input.payload.assignedSourcePaths = files;
    else { delete sample.input.payload.assignedSourcePaths; sample.input.sourcePaths = files; }
    await assert.rejects(execute(sample.input, sample.context), /DOCWORKER_ASSIGNMENT_INVALID/);
    assert.deepEqual(sample.phases, []);
  }
});
