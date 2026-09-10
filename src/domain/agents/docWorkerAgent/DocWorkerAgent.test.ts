/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证文档分块角色的行为、约束及失败场景。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { execute } from './DocWorkerAgent.ts';
import { validateFacts, type Input } from './DocWorkerAgentContract.ts';
import { roleExample } from '../../../../tests/helpers/RoleExample.ts';

test('doc-worker: normal output uses one model call and validates before returning artifacts', async () => {
  const sample = roleExample<Input>('doc-worker');
  const result = await execute(sample.input, sample.context);
  assert.deepEqual(result.output, sample.expectedOutput);
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
  assert.deepEqual(chunk.facts, sample.expectedOutput.facts);
  assert.deepEqual(result.payload.unresolvedRisks, sample.output.unresolvedRisks);
  assert.deepEqual(result.payload.provenance, sample.input.payload.sourceRefs);
  assert.equal(sample.requests[0]!.stage, 'extract');
});

test('doc-worker: rejects invented quotes, ranges, paths and hidden uncertainty', async () => {
  for (const [mutate, expected] of [
    [(output: any) => { output.facts[0].quote = 'not in the source'; }, /AGENT_OUTPUT_INVALID/],
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

// 旧信封中的引用仍严格核验；新模型契约不允许提交 quote 绕过提取器。
test('doc-worker: canonical provenance continues to reject an off-by-one copied quote', () => {
  const sample = roleExample<Input>('doc-worker');
  sample.expectedOutput.facts[0].quote += '\n}';
  assert.throws(() => validateFacts(sample.expectedOutput, sample.input), /QUOTE_MISMATCH/);
});

test('doc-worker: trailing and whitespace-only source lines cannot stand in for evidence', async () => {
  for (const content of ['export const x = 1;\n', 'export const x = 1;\n  \t\n']) {
    const sample = roleExample<Input>('doc-worker');
    (sample.input.materials.find(({ ref }) => ref.artifactId === sample.input.payload.sourceRefs[0]!.artifactId)!.content as any).content = content;
    for (const fact of sample.output.facts) { fact.startLine = 2; fact.endLine = 2; }
    sample.output.unresolvedRisks = [];
    await assert.rejects(execute(sample.input, sample.context), /FACT_EVIDENCE_EMPTY/);
    assert.equal(sample.requests.length, 2);
  }
});

test('doc-worker: bounded feedback identifies a bad range, preserves risk and keeps capabilities unchanged', async () => {
  const sample = roleExample<Input>('doc-worker');
  const original = structuredClone(sample.output);
  sample.context.model.execute = async (request) => {
    sample.requests.push(request);
    if (sample.requests.length === 1) {
      const bad = structuredClone(original); bad.facts[0].endLine = 500; return bad;
    }
    return original;
  };
  const result = await execute(sample.input, sample.context);
  assert.deepEqual(result.output, sample.expectedOutput);
  assert.equal(sample.requests.length, 2);
  assert.match(sample.requests[1]!.prompt, /DOC_WORKER_FACT_RANGE_INVALID/);
  assert.match(sample.requests[1]!.prompt, /facts\[0\]/);
  assert.deepEqual(sample.requests[1]!.readablePaths, sample.requests[0]!.readablePaths);
  assert.deepEqual(sample.requests[1]!.tools, sample.requests[0]!.tools);
  assert.equal(sample.requests[1]!.stage, 'extract:attempt-2');
  assert.equal(sample.requests[0]!.maxTokens, 8192);
});
