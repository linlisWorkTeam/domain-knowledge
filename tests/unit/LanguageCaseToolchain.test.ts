/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证语言案例边界保留报告与取消信号并拒绝错误语言绑定。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { groupRepositoryModules } from '../../src/domain/services/sourceScan/RepositoryAnalysis.ts';
import { IsolatedLanguageCases } from '../../src/infrastructure/evaluation/project/IsolatedLanguageCases.ts';
import type { ArtifactStore, ProjectEvaluation } from '../../src/application/ports/ApplicationPorts.ts';
import type { NativeCaseInput, TypeScriptModuleInput } from '../../src/application/ports/LanguageToolchainPorts.ts';
import type { NativeCaseObservation } from '../../src/application/ports/NativeEvaluationPorts.ts';
const artifacts = {} as ArtifactStore;
test('language case dispatch preserves native evidence, failed counts and cancellation signal', async () => {
  const signal = new AbortController().signal;
  const detail = { status: 'FAILED', reasonCode: 'NATIVE_BEHAVIOR_MISMATCH' } as NativeCaseObservation;
  const request = { language: 'c', input: { language: 'c' }, contract: { language: 'c' }, test: {} } as NativeCaseInput;
  let calls = 0;
  const tools = new IsolatedLanguageCases(artifacts, { execute: async (input, contract, testCase, received) => {
    calls++; assert.equal(input, request.input); assert.equal(contract, request.contract); assert.equal(testCase, request.test); assert.equal(received, signal); return detail;
  } }, async () => { throw new Error('UNEXPECTED_TYPESCRIPT'); });
  const report = await tools.evaluate(request, signal);
  assert.equal(report.detail, detail); assert.equal(report.passed, false); assert.equal(report.testsPassed, 0); assert.equal(report.testsTotal, 1);
  await assert.rejects(tools.evaluate({ ...request, language: 'cpp' }, signal), /LANGUAGE_CASE_INPUT_INVALID/);
  assert.equal(calls, 1);
});
test('TypeScript route keeps the existing repeated evaluation and evidence report intact', async () => {
  const signal = new AbortController().signal; const input = {} as TypeScriptModuleInput;
  const detail = { passed: true, testsPassed: 3, testsTotal: 3, stability: 1, evidenceRef: { sha256: 'reference' } } as ProjectEvaluation;
  const tools = new IsolatedLanguageCases(artifacts, { execute: async () => { throw new Error('UNEXPECTED_NATIVE'); } }, async (store, request, received) => {
    assert.equal(store, artifacts); assert.equal(request, input); assert.equal(received, signal); return detail;
  });
  const report = await tools.evaluate({ language: 'typescript', input }, signal);
  assert.equal(report.detail, detail); assert.equal(report.language, 'typescript'); assert.equal(report.testsTotal, 3); assert.equal(report.testsPassed, 3); assert.equal(report.passed, true);
});

test('repository defaults select only modules supported by multi-card generation while retaining TypeScript identity', () => {
  const modules = groupRepositoryModules([
    { path: 'parser.c', objectId: 'c', size: 20, language: 'c', kind: 'source' },
    { path: 'markdownLite.ts', objectId: 'ts', size: 20, language: 'typescript', kind: 'source' },
  ]);
  assert.equal(modules[0]!.selectedByDefault, true);
  assert.equal(modules[1]!.language, 'typescript');
  assert.equal(modules[1]!.selectedByDefault, false);
  assert.deepEqual(modules[1]!.reasons, ['TYPESCRIPT_MODULE_REGRESSION_ONLY']);
});
