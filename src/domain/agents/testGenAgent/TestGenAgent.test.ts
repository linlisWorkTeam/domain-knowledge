/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证测试生成角色的行为、约束及失败场景。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { execute } from './TestGenAgent.ts';
import type { Input } from './TestGenAgentContract.ts';
import { roleExample } from '../../../../tests/helpers/RoleExample.ts';
import { assertModuleBehaviorSuite } from './ModuleBehaviorSuite.ts';

test('test-gen: normal output uses one model call and validates before returning artifacts', async () => {
  const sample = roleExample<Input>('test-gen');
  const result = await execute(sample.input, sample.context);
  assert.deepEqual(result.output, sample.output);
  assert.deepEqual(sample.phases, ['model', 'validate']);
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

test('test-gen: declarative cases produce executable reproduction and pending oracle manifest', async () => {
  const sample = roleExample<Input>('test-gen');
  const suite = { schemaVersion: 'module-cases-v1', modulePath: sample.input.sourcePaths[0]!,
    exportName: 'structuredMarkdownDiff', cases: [{ caseId: 'identical', description: '相同正文无差异',
      args: ['same', 'same'], expected: { hunks: [], changedSections: [] } }] };
  sample.context.model.execute = async () => ({ suite, oracleRequired: true });
  const result = await execute(sample.input, sample.context);
  assert.match(result.artifacts.find((item) => item.key === 'candidate-tests')!.content, /assert.deepEqual/);
  assert.equal(JSON.parse(result.artifacts.find((item) => item.key === 'case-manifest')!.content).status, 'PENDING_ORACLE');
  assert.deepEqual(result.payload.caseManifestRef, { pendingArtifact: 'case-manifest' });
  sample.context.model.execute = async () => ({ suite, oracleRequired: false });
  await assert.rejects(execute(sample.input, sample.context), /TEST_ORACLE_REQUIRED/);
});

test('test-gen: rejects duplicate cases, traversal, code claims and oversized JSON data', () => {
  const suite = { schemaVersion: 'module-cases-v1', modulePath: 'module.ts', exportName: 'render',
    cases: [{ caseId: 'one', description: 'one', args: ['x'], expected: 'x' }] };
  assertModuleBehaviorSuite(suite);
  assert.throws(() => assertModuleBehaviorSuite({ ...suite, modulePath: '../module.ts' }), /SUITE_INVALID/);
  assert.throws(() => assertModuleBehaviorSuite({ ...suite, cases: [suite.cases[0], suite.cases[0]] }), /SUITE_INVALID/);
  assert.throws(() => assertModuleBehaviorSuite({ ...suite, cases: [{ ...suite.cases[0], expected: () => true }] }), /SUITE_INVALID/);
  assert.throws(() => assertModuleBehaviorSuite({ ...suite, cases: [{ ...suite.cases[0], expected: 'a'.repeat(65_537) }] }), /SUITE_INVALID/);
});

test('test-gen: module policy requires behavior cases instead of legacy commands', async () => {
  const sample = roleExample<Input>('test-gen');
  const policy = sample.input.materials.find(({ ref }) => ref.artifactId === sample.input.payload.testPolicyRef.artifactId)!;
  policy.content = { moduleContract: { modulePath: sample.input.sourcePaths[0], exportName: 'structuredMarkdownDiff' } };
  await assert.rejects(execute(sample.input, sample.context), /AGENT_OUTPUT_INVALID/);
});
