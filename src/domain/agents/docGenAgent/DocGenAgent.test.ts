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

test('doc-gen: revision output uses one model call and validates before returning artifacts', async () => {
  const sample = roleExample<Input>('doc-gen');
  const result = await execute(sample.input, sample.context);
  assert.deepEqual(result.output, sample.expectedOutput);
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
  assert.equal(result.artifacts[0]!.content, sample.expectedOutput.body);
  assert.deepEqual(result.payload.bodyRef, { pendingArtifact: 'body' });
});

test('doc-gen: initial generation validates outline before body and preserves its audit artifact', async () => {
  const sample = roleExample<Input>('doc-gen');
  delete sample.input.payload.baseKnowledgeRef;
  delete sample.input.payload.corrections;
  const result = await execute(sample.input, sample.context);
  assert.deepEqual(sample.requests.map((request) => request.stage), ['outline', 'body']);
  assert.deepEqual(sample.phases, ['model', 'validate', 'model', 'validate']);
  assert.match(sample.requests[1]!.prompt, /已确认概要/);
  assert.deepEqual(result.artifacts.map((artifact) => artifact.key), ['outline', 'body']);
});

test('doc-gen: invalid outline stops before body; outline cancellation rejects late success', async () => {
  for (const cancel of [false, true]) {
    const sample = roleExample<Input>('doc-gen');
    delete sample.input.payload.baseKnowledgeRef;
    delete sample.input.payload.corrections;
    let calls = 0;
    sample.context.model.execute = async () => { calls++; if (cancel) sample.controller.abort(); return {}; };
    await assert.rejects(execute(sample.input, sample.context), cancel ? /AGENT_CANCELLED/ : /AGENT_OUTPUT_INVALID/);
    assert.equal(calls, 1);
  }
});

test('doc-gen: body cannot omit outline sections or replace accepted metadata', async () => {
  for (const [mutate, expected] of [
    [(output: any) => { output.sections.pop(); }, /SECTION_SET_MISMATCH/],
    [(output: any) => { output.title = 'another document'; }, /OUTLINE_METADATA_MISMATCH/],
  ] as const) {
    const sample = roleExample<Input>('doc-gen');
    delete sample.input.payload.baseKnowledgeRef;
    delete sample.input.payload.corrections;
    mutate(sample.modelStages.body);
    await assert.rejects(execute(sample.input, sample.context), expected);
  }
});

test('doc-gen: revision rejects missing base, ambiguous scope and evidence before model execution', async () => {
  for (const [mutate, expected] of [
    [(input: Input) => { delete input.payload.baseKnowledgeRef; }, /REVISION_BASE_REQUIRED/],
    [(input: Input) => { (input.payload.corrections![0] as any).knowledgePath = 'knowledge/markdown-diff.md'; }, /SCOPE_REQUIRED/],
    [(input: Input) => { (input.payload.corrections![0] as any).knowledgePath = 'knowledge/other.md#Behavior'; }, /SCOPE_REQUIRED/],
    [(input: Input) => { (input.payload.corrections![0] as any).knowledgePath = 'knowledge/markdown-diff.md#Missing'; }, /SECTION_AMBIGUOUS/],
    [(input: Input) => { (input.payload.corrections![0] as any).evidenceRefs = []; }, /EVIDENCE_REQUIRED/],
    [(input: Input) => { delete input.payload.corrections; }, /REVISION_CORRECTIONS_REQUIRED/],
  ] as const) {
    const sample = roleExample<Input>('doc-gen');
    mutate(sample.input);
    await assert.rejects(execute(sample.input, sample.context), expected);
    assert.deepEqual(sample.phases, []);
  }
});

test('doc-gen: revision refuses to modify an unnamed section or claim an unchanged correction', async () => {
  const outside = roleExample<Input>('doc-gen');
  outside.output.sections.push({ sectionId: 'section-1', body: 'Compare secretly changed documents' });
  await assert.rejects(execute(outside.input, outside.context), /SECTION_DENIED/);
  const noChange = roleExample<Input>('doc-gen');
  noChange.output.sections[0].body = String(noChange.input.materials.find(({ ref }) => ref.artifactId === noChange.input.payload.baseKnowledgeRef!.artifactId)!.content).split('## Behavior\n')[1];
  await assert.rejects(execute(noChange.input, noChange.context), /CORRECTION_NOT_APPLIED/);
});

test('doc-gen: H1 leakage receives a bounded field-specific repair while the outline is reused', async () => {
  const sample = roleExample<Input>('doc-gen');
  delete sample.input.payload.baseKnowledgeRef; delete sample.input.payload.corrections;
  const originalExecute = sample.context.model.execute;
  sample.context.model.execute = async (request, signal) => {
    const raw = await originalExecute(request, signal);
    if (request.stage === 'body') (raw as any).sections[0].body = '# 1. Wrong hierarchy\n' + (raw as any).sections[0].body;
    return raw;
  };
  const result = await execute(sample.input, sample.context);
  assert.deepEqual(sample.requests.map(({ stage }) => stage), ['outline', 'body', 'body:attempt-2']);
  assert.match(sample.requests[2]!.prompt, /DOC_GEN_SECTION_HEADING_INVALID/);
  assert.match(result.output.body, /^# Markdown diff\n\n## Purpose\n/);
  assert.doesNotMatch(result.output.body, /Wrong hierarchy/);
});

test('doc-gen: unclosed fences cannot hide later chapters and duplicate section IDs cannot omit content', async () => {
  for (const bad of ['fence', 'duplicate']) {
    const sample = roleExample<Input>('doc-gen');
    delete sample.input.payload.baseKnowledgeRef; delete sample.input.payload.corrections;
    if (bad === 'fence') sample.modelStages.body.sections[0].body += '\n```ts\nunterminated';
    else sample.modelStages.body.sections[1].sectionId = sample.modelStages.body.sections[0].sectionId;
    await assert.rejects(execute(sample.input, sample.context), bad === 'fence' ? /FENCE_UNCLOSED/ : /SECTION_SET_MISMATCH/);
    assert.equal(sample.requests.length, 3);
  }
});

test('doc-gen: lone CR cannot hide headings in generated or revised section content', async () => {
  for (const revision of [false, true]) {
    const sample = roleExample<Input>('doc-gen');
    if (!revision) { delete sample.input.payload.baseKnowledgeRef; delete sample.input.payload.corrections; }
    const wire = revision ? sample.output : sample.modelStages.body;
    wire.sections[0].body += '\r# Injected H1\r## Injected H2\rsecret replacement';
    await assert.rejects(execute(sample.input, sample.context), /SECTION_LINE_ENDING_INVALID/);
  }
});

test('doc-gen: multiline outline titles are rejected before entering the body stage', async () => {
  const sample = roleExample<Input>('doc-gen');
  delete sample.input.payload.baseKnowledgeRef; delete sample.input.payload.corrections;
  sample.modelStages.outline.title = 'Module\n# Another title';
  await assert.rejects(execute(sample.input, sample.context), /DOC_GEN_TITLE_INVALID/);
  assert.deepEqual(sample.requests.map(({ stage }) => stage), ['outline', 'outline:attempt-2']);
});
