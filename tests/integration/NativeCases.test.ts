/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证原生受信harness、参考拒绝和宿主观察，不接受自报计数。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { NativeToolchain } from '../../src/infrastructure/evaluation/project/NativeToolchain.ts';
import { NativeCaseExecutor } from '../../src/infrastructure/evaluation/project/NativeCaseExecutor.ts';
import { nativeCaseHarness } from '../../src/infrastructure/evaluation/project/NativeCaseHarness.ts';
import { assertNativeBehaviorSuite, type NativeContract, type NativeBehaviorCase } from '../../src/domain/evaluation/NativeBehaviorSuite.ts';
import { buildConstraints } from '../../src/domain/workbench/WorkbenchProject.ts';
const native = new NativeToolchain(); const executor = new NativeCaseExecutor(native); const build = buildConstraints();
const contract: NativeContract = { schemaVersion: 'native-contract-v1', language: 'c', includePath: 'api.h', entryPaths: ['api.c'], targetFunctions: ['add'],
  declarations: [{ kind: 'FunctionDecl', name: 'add', type: 'int (int, int)', parameters: [{ name: 'a', type: 'int' }, { name: 'b', type: 'int' }] }] };
const sample: NativeBehaviorCase = { caseId: 'sum', description: 'sum from fixed inputs', sections: ['Behavior'], variables: [],
  calls: [{ function: 'add', arguments: [{ integer: '3' }, { integer: '4' }], result: 'actual' }],
  observations: [{ name: 'sum', kind: 'integer', read: { variable: 'actual' } }], expected: { sum: '7' } };
const input = (body: string) => ({ language: 'c' as const, build, files: [{ path: 'api.h', content: 'int add(int a,int b);' }, { path: 'api.c', content: body }] });
test('host compares C behavior, never places expected values in harness and rejects wrong reference expectations', async () => {
  const good = await executor.execute(input('int add(int a,int b){return a+b;}'), contract, sample);
  assert.equal(good.status, 'PASSED', JSON.stringify(good.report)); assert.deepEqual(good.actual, { sum: '7' });
  const wrong = await executor.execute(input('int add(int a,int b){return a-b;}'), contract, sample);
  assert.equal(wrong.status, 'FAILED'); assert.equal(wrong.reasonCode, 'NATIVE_BEHAVIOR_MISMATCH'); assert.deepEqual(wrong.mismatches, ['sum']);
  const invalidExpected = { ...sample, expected: { sum: '909090909' } };
  assert.doesNotMatch(nativeCaseHarness(invalidExpected, contract), /909090909/);
  assert.equal((await executor.execute(input('int add(int a,int b){return a+b;}'), contract, invalidExpected)).status, 'FAILED');
  const spoof = await executor.execute(input('#include <stdio.h>\nint add(int a,int b){puts("all 100 tests passed");return 7;}'), contract, sample);
  assert.equal(spoof.reasonCode, 'NATIVE_OBSERVATION_INVALID');
});
test('sanitizers reject reference undefined behavior even if the function would print a matching value', async () => {
  const invalid = await executor.execute(input('int add(int a,int b){int v[1]={7}; volatile int n=2; return v[n];}'), contract, sample);
  assert.equal(invalid.reasonCode, 'NATIVE_CASE_EXECUTION_FAILED', JSON.stringify(invalid.report));
  assert.match(invalid.report.execution?.stderr ?? '', /runtime error|AddressSanitizer/);
});
test('C++ static methods support out parameters and preserve unsigned 64-bit observations', async () => {
  const files = [{ path: 'api.h', content: 'namespace demo { class Convert { public: static bool value(const char *s, unsigned long long *out){*out=18446744073709551615ULL;return true;} }; }' }];
  const api = await native.publicInterface({ language: 'cpp', files, build, entryPath: 'api.h', astFilter: 'demo::Convert' });
  const cppContract: NativeContract = { ...contract, language: 'cpp', entryPaths: [], declarations: api.declarations, targetFunctions: ['demo::Convert::value'] };
  const item: NativeBehaviorCase = { ...sample, variables: [{ name: 'output', type: 'unsigned long long' }],
    calls: [{ function: 'demo::Convert::value', arguments: [{ string: '"\n\\中文' }, { address: { variable: 'output' } }], result: 'ok' }],
    observations: [{ name: 'accepted', kind: 'boolean', read: { variable: 'ok' } }, { name: 'number', kind: 'unsigned', read: { variable: 'output' } }],
    expected: { accepted: true, number: '18446744073709551615' } };
  const result = await executor.execute({ language: 'cpp', files, build }, cppContract, item);
  assert.equal(result.status, 'PASSED', JSON.stringify(result.report)); assert.equal(result.actual?.number, '18446744073709551615');
});
test('declarative cases reject source injection, unrelated observations and out-of-bounds array access before compilation', () => {
  for (const item of [
    { ...sample, calls: [{ ...sample.calls[0], function: 'system' }] },
    { ...sample, variables: [{ name: 'unused', type: 'int' }], observations: [{ name: 'sum', kind: 'integer', read: { variable: 'unused' } }] },
    { ...sample, calls: [{ ...sample.calls[0], arguments: [{ integer: '0); system("bad")' }, { integer: '1' }] }] },
    { ...sample, observations: [{ name: 'sum', kind: 'integer', read: { variable: 'actual', index: 999 } }] },
  ]) assert.throws(() => assertNativeBehaviorSuite({ schemaVersion: 'native-cases-v1', cases: [item] }, contract), /NATIVE_BEHAVIOR_SUITE_INVALID/);
});

test('existing TestGen role accepts native knowledge policy and emits an untrusted data manifest', async () => {
  const { roleExample } = await import('../helpers/RoleExample.ts');
  const { executeAgent } = await import('../../src/domain/workflow/AgentExecutionService.ts');
  const example = roleExample<import('../../src/domain/agents/testGenAgent/BehaviorCasesContract.ts').Input>('test-gen', 'src/domain/agents/testGenAgent/examples/BehaviorCasesSample.json');
  example.input.payload.languageId = 'c';
  example.input.sourcePaths = []; example.input.publicInterfacePaths = [];
  const policy = example.input.materials.find((item) => item.ref.artifactId === example.input.payload.testPolicyRef.artifactId)!;
  policy.content = { nativeContract: contract, knowledge: '# Addition\n## Behavior\nadd returns the sum of two representable integers.' };
  const { sha256 } = await import('../../src/domain/Domain.ts');
  const digest = sha256(JSON.stringify(policy.content));
  policy.ref = { ...policy.ref, artifactId: `sha256:${digest}`, sha256: digest, size: Buffer.byteLength(JSON.stringify(policy.content)) };
  example.input.payload.testPolicyRef = policy.ref;
  const roleInput = { ...example.input, payload: { ...example.input.payload } };
  example.context.model.execute = async (request) => {
    assert.match(request.prompt, /依据授权知识正文/); assert.deepEqual(request.readablePaths, []);
    return { nativeSuite: { schemaVersion: 'native-cases-v1', cases: [sample] }, oracleRequired: true };
  };
  const result = await executeAgent(roleInput, example.context);
  assert.equal(result.artifacts.length, 1);
  assert.equal(JSON.parse(result.artifacts[0]!.content).status, 'PENDING_ORACLE');
  assert.equal(result.artifacts[0]?.mediaType, 'application/json');
  example.context.model.execute = async () => ({ nativeSuite: { schemaVersion: 'native-cases-v1', cases: [sample] }, oracleRequired: false });
  await assert.rejects(executeAgent(roleInput, example.context), /AGENT_OUTPUT_INVALID/);
});

test('persisted oracle cache rejects bad candidates, reuses unchanged input and preserves trusted expectations after knowledge revisions', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs'); const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const { createComposition } = await import('../../src/interfaces/runner/Composition.ts');
  const { sha256 } = await import('../../src/domain/Domain.ts');
  const directory = mkdtempSync(join(tmpdir(), 'native-cache-')); let composition = createComposition({ runtimeDir: directory });
  let compiler = sha256('controlled-toolchain'); let proposals = 0; let executions = 0;
  const install = () => {
    composition.apps.nativeEvaluation.dependencies.snapshot = async (language, constraints) => ({ schemaVersion: 'native-toolchain-v1', language, build: constraints, architecture: 'test', files: [], digest: compiler });
    composition.apps.nativeEvaluation.dependencies.runner = { execute: async (...args) => { executions++; return executor.execute(...args); } };
  };
  try {
    install(); const body = await composition.artifacts.put(Buffer.from('# Math\n## Behavior\nAddition on representable integers.'), 'text/markdown');
    const suite = { schemaVersion: 'native-cases-v1' as const, cases: [{ ...sample, sections: ['card-add#Behavior'] }] };
    const request = { projectSnapshotId: 'project-input-test', sourceRevision: 'a'.repeat(40), cardIds: ['card-add'], versionIds: ['version-one'], bodyRefs: [body],
      reference: input('int add(int a,int b){return a+b;}'), contract, policyDigest: sha256('policy'), propose: async () => { proposals++; return suite; } };
    const ambiguous = await composition.artifacts.put(Buffer.from('# Math\n## Behavior\nFirst.\n## Behavior\nSecond.'), 'text/markdown');
    await assert.rejects(composition.apps.nativeEvaluation.prepare({ ...request, bodyRefs: [ambiguous], propose: async () => suite }), /NATIVE_TEST_SECTION_AMBIGUOUS/);
    const rejected = await composition.apps.nativeEvaluation.prepare({ ...request, propose: async () => ({ ...suite, cases: [{ ...suite.cases[0]!, expected: { sum: '9' } }] }) });
    assert.equal(rejected.set.status, 'REJECTED');
    await assert.rejects(composition.apps.nativeEvaluation.evaluate(rejected.set.testSetId, request.reference, contract), /NATIVE_TEST_NOT_TRUSTED/);
    assert.equal(executions, 1, 'rejected candidates never execute generated code');
    const first = await composition.apps.nativeEvaluation.prepare(request); assert.equal(first.set.status, 'TRUSTED'); assert.equal(proposals, 1);
    assert.equal(executions, 2);
    await composition.close(); composition = createComposition({ runtimeDir: directory }); install();
    const replay = await composition.apps.nativeEvaluation.prepare(request);
    assert.equal(replay.set.testSetId, first.set.testSetId); assert.equal(replay.reused, 1); assert.equal(proposals, 1); assert.equal(executions, 2);
    const changedBody = await composition.artifacts.put(Buffer.from('# Math\n## Behavior\nRevised addition boundary.'), 'text/markdown');
    const revised = await composition.apps.nativeEvaluation.prepare({ ...request, bodyRefs: [changedBody], versionIds: ['version-two'], propose: async () => { throw new Error('OLD_EXPECTATIONS_MUST_NOT_BE_REWRITTEN'); } });
    assert.equal(revised.revalidated, true); assert.equal(revised.set.parentTestSetId, first.set.testSetId); assert.equal(revised.set.suiteRef.sha256, first.set.suiteRef.sha256);
    assert.equal(executions, 3); assert.equal(revised.set.sectionBindings[0]?.versionId, 'version-two');
    const result = await composition.apps.nativeEvaluation.evaluate(revised.set.testSetId, input('int add(int a,int b){return a-b;}'), contract);
    assert.equal(result.report.allPassed, false); assert.equal(result.report.passed, 0); assert.equal(result.report.publicationVerified, false);
    assert.deepEqual(result.report.cases[0]?.actual, { sum: '-1' }); assert.equal(result.report.cases[0]?.sectionBindings[0]?.versionId, 'version-two');
    const removed = await composition.artifacts.put(Buffer.from('# Math\n## Other\nNo current Behavior section.'), 'text/markdown');
    const historical = await composition.apps.nativeEvaluation.prepare({ ...request, bodyRefs: [removed], versionIds: ['version-three'] });
    assert.equal(historical.set.sectionBindings[0]?.matchesInput, false); assert.equal(historical.set.sectionBindings[0]?.versionId, 'version-two');
    compiler = sha256('changed-toolchain');
    const toolsChanged = await composition.apps.nativeEvaluation.prepare(request); assert.notEqual(toolsChanged.set.cacheKey, first.set.cacheKey); assert.equal(proposals, 1, 'toolchain changes must revalidate trusted gates without proposing replacements');
    const sourceChanged = await composition.apps.nativeEvaluation.prepare({ ...request, reference: input('int add(int a,int b){return a+b+1;}') });
    assert.equal(sourceChanged.reused, 1); assert.equal(sourceChanged.proposed, 0);
    assert.equal(sourceChanged.set.suiteRef.sha256, first.set.suiteRef.sha256);
    assert.ok(sourceChanged.set.inheritedTestSetIds?.includes(first.set.testSetId));
    const policyChanged = await composition.apps.nativeEvaluation.prepare({ ...request, policyDigest: sha256('new-policy') });
    assert.equal(policyChanged.revalidated, true); assert.equal(proposals, 1);
    await assert.rejects(composition.apps.nativeEvaluation.prepare({ ...request, contract: { ...contract, includePath: 'changed.h' } }), /NATIVE_TRUSTED_INTERFACE_CHANGED/);
    assert.equal(sourceChanged.set.status, 'REJECTED'); assert.notEqual(sourceChanged.set.binding.referenceDigest, toolsChanged.set.binding.referenceDigest);
    assert.equal(composition.apps.nativeEvaluation.dependencies.store.get(first.set.testSetId)?.status, 'TRUSTED');
    assert.deepEqual(composition.apps.nativeEvaluation.dependencies.store.get(first.set.testSetId)?.binding, first.set.binding);
    // Import a separately validated historical gate from before lineage-aware caching.
    const { nativeTestKeys } = await import('../../src/domain/evaluation/NativeTestCache.ts');
    const legacySuite = { ...suite, cases: [{ ...suite.cases[0]!, expected: { sum: '8' } }] };
    const legacyReference = input('int add(int a,int b){return a+b+1;}');
    const legacyObservation = await executor.execute(legacyReference, contract, legacySuite.cases[0]!);
    assert.equal(legacyObservation.status, 'PASSED');
    const { gateDigest: _gateDigest, ...legacyBinding } = sourceChanged.set.binding;
    const legacyKeys = nativeTestKeys(legacyBinding);
    const legacyGate = composition.apps.nativeEvaluation.dependencies.store.save({ ...sourceChanged.set, ...legacyKeys,
      binding: legacyBinding, testSetId: 'native-tests-historical-independent', parentTestSetId: null, status: 'TRUSTED',
      suiteRef: await composition.artifacts.put(Buffer.from(JSON.stringify(legacySuite)), 'application/json'),
      oracleRef: await composition.artifacts.put(Buffer.from(JSON.stringify([legacyObservation])), 'application/json') });
    const inheritedConflict = await composition.apps.nativeEvaluation.prepare(request);
    assert.equal(inheritedConflict.set.status, 'REJECTED', 'an older successful cache cannot hide a later trusted assertion');
    assert.equal(inheritedConflict.reused, 2); assert.equal(inheritedConflict.proposed, 0); assert.equal(proposals, 1);
    assert.ok(inheritedConflict.set.inheritedTestSetIds?.includes(legacyGate.testSetId));
    assert.notEqual(inheritedConflict.set.cacheKey, toolsChanged.set.cacheKey);

  } finally { await composition.close(); rmSync(directory, { recursive: true, force: true }); }
});
