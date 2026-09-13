/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：通过受控参考观察及真实SQLite/CAS验证补充测试晋升与拒绝隔离。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NativeSuiteEvaluation } from '../../src/application/services/NativeSuiteEvaluation.ts';
import { LocalCasArtifactStore } from '../../src/infrastructure/sqlite/SqliteCas.ts';
import { SqliteNativeTests } from '../../src/infrastructure/sqlite/SqliteNativeTests.ts';
import { buildConstraints } from '../../src/domain/services/workbench/WorkbenchProject.ts';
import { nativeSupplementTargets } from '../../src/domain/services/evaluation/NativeSupplementTargets.ts';
import type { NativeBehaviorSuite, NativeContract } from '../../src/domain/services/evaluation/NativeBehaviorSuite.ts';
const suite = (n: number, expected = n + 1): NativeBehaviorSuite => ({ schemaVersion: 'native-cases-v1', cases: [{ caseId: `sum${n}`, description: 'addition', sections: ['card#Behavior'], variables: [],
  calls: [{ function: 'add', arguments: [{ integer: String(n) }, { integer: '1' }], result: 'out' }], observations: [{ name: 'out', kind: 'integer', read: { variable: 'out' } }], expected: { out: String(expected) } }] });
const contract: NativeContract = { schemaVersion: 'native-contract-v1', language: 'c', includePath: 'api.h', entryPaths: ['api.c'], targetFunctions: ['add'],
  declarations: [{ kind: 'FunctionDecl', name: 'add', type: 'int (int, int)', parameters: [{ name: 'a', type: 'int' }, { name: 'b', type: 'int' }] }] };
test('supplement validates candidates separately, keeps rejected history immutable and reuses exact successful demands', async () => {
  const root = mkdtempSync(join(tmpdir(), 'native-supplement-'));
  const artifacts = new LocalCasArtifactStore(join(root, 'cas')), store = new SqliteNativeTests(join(root, 'tests.sqlite'));
  const calls: string[] = []; let brokenReference = false;
  const build = buildConstraints();
  const evaluation = new NativeSuiteEvaluation({ artifacts, store,
    snapshot: async () => ({ schemaVersion: 'native-toolchain-v1', language: 'c', build, architecture: 'controlled', files: [], digest: 'a'.repeat(64) }),
    runner: { execute: async (_input, _contract, sample) => {
      calls.push(sample.caseId);
      const actual = { out: String(sample.calls[0]!.arguments.reduce((sum, arg) => sum + ('integer' in arg ? Number(arg.integer) : 0), 0) + (brokenReference ? 1 : 0)) };
      const passed = actual.out === sample.expected.out;
      return { caseId: sample.caseId, status: passed ? 'PASSED' : 'FAILED', reasonCode: passed ? null : 'NATIVE_BEHAVIOR_MISMATCH', actual, mismatches: passed ? [] : ['out'],
        report: { build: { exitCode: 0, timedOut: false, outputLimitExceeded: false, durationMs: 0, stdout: '', stderr: '' }, execution: null } };
    } } });
  try {
    const bodyRef = await artifacts.put(Buffer.from('# Card\n\n## Behavior\nAdds integers.\n\n## Evidence\nMissing boundary evidence.\n\n## Limits\nUnverified range.'), 'text/markdown');
    const input = { projectSnapshotId: 'snapshot', sourceRevision: 'commit', cardIds: ['card'], versionIds: ['v1'], bodyRefs: [bodyRef],
      reference: { language: 'c' as const, build, files: [{ path: 'api.h', content: 'int add(int,int);' }] }, contract, policyDigest: 'b'.repeat(64), propose: async () => suite(1) };
    const original = await evaluation.prepare(input); assert.equal(original.set.status, 'TRUSTED');
    const preserved = JSON.stringify(store.get(original.set.testSetId));
    let proposals = 0;
    const supplement = { schemaVersion: 'native-supplement-v1' as const, demandDigest: 'c'.repeat(64) };
    const rejected = await evaluation.prepare({ ...input, supplement, propose: async () => { proposals++; return suite(2, 99); } });
    assert.equal(rejected.rejection, 'CANDIDATE_REJECTED'); assert.equal(rejected.reused, 1); assert.equal(rejected.proposed, 1);
    assert.equal(rejected.set.status, 'REJECTED'); assert.equal(store.lineage(['card']).length, 1);
    assert.equal(JSON.stringify(store.get(original.set.testSetId)), preserved);
    const promoted = await evaluation.prepare({ ...input, supplement, propose: async () => { proposals++; return suite(2); } });
    assert.equal(promoted.set.status, 'TRUSTED'); assert.equal(promoted.reused, 1); assert.equal(promoted.proposed, 1);
    const merged = JSON.parse(Buffer.from(await artifacts.get(promoted.set.suiteRef)).toString()) as NativeBehaviorSuite;
    assert.deepEqual(merged.cases.map(item => item.expected.out).sort(), ['2', '3']);
    const before = calls.length;
    const cached = await evaluation.prepare({ ...input, supplement, propose: async () => { throw new Error('must reuse'); } });
    assert.equal(cached.set.testSetId, promoted.set.testSetId); assert.equal(cached.revalidated, false); assert.equal(calls.length, before); assert.equal(proposals, 2);
    const targeted = { ...supplement, targets: nativeSupplementTargets(['card#Evidence', 'card#Limits']) };
    const missed = await evaluation.prepare({ ...input, supplement: targeted, propose: async () => suite(3) });
    assert.equal(missed.set.status, 'REJECTED'); assert.equal(missed.rejection, 'CANDIDATE_REJECTED');
    assert.equal(missed.reused, 2); assert.equal(missed.proposed, 1);
    assert.equal(missed.targetCoverage?.candidateEligible, false);
    assert.deepEqual(missed.targetCoverage?.unmatchedSectionIds, ['card#Evidence', 'card#Limits']);
    assert.equal(calls.includes('sum3'), false, 'off-target candidate must never execute');
    assert.equal(JSON.stringify(store.get(original.set.testSetId)), preserved);
    assert.deepEqual(JSON.parse(Buffer.from(await artifacts.get(missed.set.oracleRef)).toString()), []);
    const repairedCandidate = suite(3); repairedCandidate.cases[0]!.sections = ['card#Evidence'];
    const targetedPromotion = await evaluation.prepare({ ...input, supplement: targeted, propose: async () => repairedCandidate });
    assert.equal(targetedPromotion.set.status, 'TRUSTED');
    assert.deepEqual(targetedPromotion.targetCoverage?.unmatchedSectionIds, ['card#Limits']);
    assert.equal(targetedPromotion.targetCoverage?.semanticCoverageProven, false);
    assert.ok(calls.includes('sum3'));
    assert.equal(JSON.stringify(store.get(original.set.testSetId)), preserved);
    brokenReference = true;
    const changedBody = await artifacts.put(Buffer.from('# Card\n\n## Behavior\nAdds integers, revised.'), 'text/markdown');
    const conflict = await evaluation.prepare({ ...input, bodyRefs: [changedBody], versionIds: ['v2'], supplement,
      propose: async () => { throw new Error('historical gates must stop proposal'); } });
    assert.equal(conflict.rejection, 'TRUSTED_GATE_CONFLICT');
    assert.equal(JSON.stringify(store.get(original.set.testSetId)), preserved);
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});
