/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证原生阶段的错误候选拒绝、可信用例恢复和知识修订后的失败定位。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256 } from '../../src/domain/Domain.ts';
import { createComposition } from '../../src/interfaces/runner/Composition.ts';
import { assertModelOutput } from '../../src/infrastructure/agentAdapters/ModelExecution.ts';
import { NativeToolchain } from '../../src/infrastructure/evaluation/project/NativeToolchain.ts';
import { NativeCaseExecutor } from '../../src/infrastructure/evaluation/project/NativeCaseExecutor.ts';

test('native stage rejects bad candidates, resumes trusted cases after restart and maps generated failures to revised cards', async () => {
  const root = mkdtempSync(join(tmpdir(), 'evaluation-source-')); const runtimeDir = mkdtempSync(join(tmpdir(), 'evaluation-runtime-'));
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q'); writeFileSync(join(root, 'math.h'), 'int add(int a,int b);');
  writeFileSync(join(root, 'math.c'), '#include "math.h"\n/* REFERENCE_PRIVATE */\nint add(int a,int b){return a+b;}');
  git('add', '.'); git('commit', '-qm', 'Fixed reference');
  let composition = createComposition({ runtimeDir }); let testCalls = 0, codeCalls = 0, generatedRuns = 0, reviewCalls = 0, revisionCalls = 0;
  let wrongCandidate = true, wrongCode = false, interrupt = true;
  const install = () => {
    const deps = composition.apps.workbenchReconstruction.dependencies;
    deps.snapshot = async (language, build) => ({ schemaVersion: 'native-toolchain-v1', language, build, architecture: 'test', files: [], digest: sha256('fixed-tools') });
    composition.apps.nativeEvaluation.dependencies.snapshot = deps.snapshot;
    const runner = new NativeCaseExecutor(new NativeToolchain());
    composition.apps.nativeEvaluation.dependencies.runner = { execute: async (input, contract, sample, signal) => {
      const generated = !input.files.some((file) => file.content.includes('REFERENCE_PRIVATE'));
      if (generated) { generatedRuns++; if (interrupt) throw new Error('WORKBENCH_RESOURCE_INSUFFICIENT'); }
      return runner.execute(input, contract, sample, signal);
    } };
    deps.roles.dependencies.model = (_command, _configuration, usage) => ({ assertOutput: assertModelOutput, execute: async (request) => {
      assert.deepEqual(request.readablePaths, []);
      if (['code', 'test-gen'].includes(request.role)) assert.doesNotMatch(request.prompt, /REFERENCE_PRIVATE|return a\+b/);
      else assert.match(request.prompt, /REFERENCE_PRIVATE/, 'revision roles receive the pinned reference, never Code or TestGen');
      if (request.role === 'review') { reviewCalls++; usage(`review-${reviewCalls}`, 3); return { blocking: true, recommendation: 'ITERATE', correction: { correctionId: 'COR-0001', knowledgePath: 'knowledge/unit-add.md#Behavior', criterion: 'Describe addition rather than subtraction according to the trusted sum observation.', risk: 'Incorrect arithmetic operation' }, unresolvedRisks: [] }; }
      if (request.role === 'doc-gen') { revisionCalls++; usage(`revision-${revisionCalls}`, 4); assert.equal(request.stage, 'revision'); return { title: 'Addition', description: 'Representable sum', sections: [{ sectionId: 'section-1', body: 'The sum of the two arguments is returned, rather than their difference. For the fixed inputs 3 and 4, the expected result is 7. Inputs and result must be representable signed integers. Overflow and unsupported values remain outside the specified interface contract.\n\nAddition is required because the public operation combines both arguments, rather than computing an ordered difference. The trusted reference observation is evidence for the fixed sample; it does not establish that every possible integer input has been tested. Callers must still respect the signed integer range. Negative operands may affect the sign of the sum, but they do not change the arithmetic operation into subtraction. No memory allocation or persistent state is part of this interface.' }] }; }
      if (request.role === 'code') { codeCalls++; usage(`code-${codeCalls}`, 7);
        return { files: [{ path: 'math.h', content: 'int add(int a,int b);' }, { path: 'math.c', content: `#include "math.h"\nint add(int a,int b){return a${wrongCode ? '-' : '+'}b;}` }] }; }
      assert.equal(request.role, 'test-gen'); testCalls++; usage(`test-${testCalls}`, 5);
      assert.match(request.prompt, /card-add#Behavior/);
      if (testCalls === 2) { assert.match(request.prompt, /NATIVE_BEHAVIOR_MISMATCH/); assert.match(request.prompt, /rejectedCandidate/); }
      return { oracleRequired: true, nativeSuite: { schemaVersion: 'native-cases-v1', cases: [{ caseId: 'sum', description: 'Sum from fixed inputs',
        sections: ['card-add#Behavior'], variables: [], calls: [{ function: 'add', arguments: [{ integer: '3' }, { integer: '4' }], result: 'sum' }],
        observations: [{ name: 'sum', kind: 'integer', read: { variable: 'sum' } }], expected: { sum: wrongCandidate ? '9' : '7' } }] } };
    } });
  };
  try {
    install(); const project = await composition.apps.workbenchProjects.create({ directory: root, moduleIds: ['math'] });
    const api = await new NativeToolchain().publicInterface({ language: 'c', build: project.build, entryPath: 'math.h', files: [{ path: 'math.h', content: 'int add(int a,int b);' }] });
    const interfaceRef = await composition.artifacts.put(Buffer.from(JSON.stringify(api)), 'application/json');
    const input = { moduleId: 'unit-add', title: 'Addition', description: 'Representable sum',
      body: '# Addition\n## Behavior\nThe sum of the two arguments is returned. Inputs and result must be representable signed integers.\n## Limits\nNo overflow.',
      provenance: [{ path: 'math.c', commit: project.commit, pinned: true }], metadata: { cardId: 'card-add', language: 'c', sourceModule: 'math',
        projectSnapshotId: project.snapshotId, repositoryId: project.repositoryId, interfaceRef } };
    const candidate = await composition.apps.flywheel.ingestCandidate(input);
    const code = await composition.apps.workbenchReconstruction.start(project.snapshotId, [candidate.version.versionId]);
    assert.equal((await composition.apps.workbenchStages.wait(code.taskId)).status, 'SUCCEEDED');
    const evaluation = await composition.apps.workbenchEvaluation.start(code.taskId);
    const rejected = await composition.apps.workbenchStages.wait(evaluation.taskId);
    assert.equal(rejected.status, 'FAILED', rejected.reasonCode ?? ''); assert.equal(rejected.reasonCode, 'TEST_CANDIDATE_REJECTED');
    assert.equal(testCalls, 1); assert.equal(generatedRuns, 0);
    await assert.rejects(composition.apps.workbenchEvaluation.revisionEvidence(evaluation.taskId), /REVISION_COMPLETED_EVALUATION_REQUIRED/);
    const rejectedCheckpoint = composition.apps.workbenchStages.store.checkpoints(evaluation.taskId).find((item) => item.key.startsWith('candidate-rejection:'))!;
    assert.equal(rejectedCheckpoint.result.summary.knowledgeErrorProven, false);
    wrongCandidate = false; composition.apps.workbenchStages.resume(evaluation.taskId, evaluation.inputDigest);
    const paused = await composition.apps.workbenchStages.wait(evaluation.taskId);
    assert.equal(paused.status, 'PAUSED', paused.reasonCode ?? ''); assert.equal(testCalls, 2); assert.equal(paused.usage.modelCalls, 2);
    await composition.close(); composition = createComposition({ runtimeDir }); install(); interrupt = false;
    composition.apps.workbenchStages.resume(evaluation.taskId, evaluation.inputDigest);
    const done = await composition.apps.workbenchStages.wait(evaluation.taskId);
    assert.equal(done.status, 'SUCCEEDED', done.reasonCode ?? ''); assert.equal(testCalls, 2); assert.equal(done.usage.modelCalls, 2); assert.equal(done.usage.tokens, 10);
    const reports = done.result!.summary.modules as Array<{ status: string; passed: number; total: number; publicationVerified: boolean }>;
    assert.equal(reports[0]?.status, 'BEHAVIOR_PASSED'); assert.equal(reports[0]?.passed, 1); assert.equal(reports[0]?.publicationVerified, false);
    assert.equal((await composition.apps.workbenchEvaluation.start(code.taskId)).taskId, evaluation.taskId);
    assert.equal((await composition.apps.workbenchEvaluation.revisionEvidence(done.taskId)).modules[0]?.nextAction, 'NO_BEHAVIOR_REVISION_REQUIRED');
    wrongCode = true;
    const revised = await composition.apps.flywheel.ingestCandidate({ ...input, body: input.body.replace('The sum', 'The difference') + '\nOverflow is excluded explicitly.' });
    const rebuilt = await composition.apps.workbenchReconstruction.start(project.snapshotId, [revised.version.versionId]);
    assert.equal((await composition.apps.workbenchStages.wait(rebuilt.taskId)).status, 'SUCCEEDED');
    const next = await composition.apps.workbenchEvaluation.start(rebuilt.taskId);
    const failedBehavior = await composition.apps.workbenchStages.wait(next.taskId);
    assert.equal(failedBehavior.status, 'SUCCEEDED', failedBehavior.reasonCode ?? '');
    const module = (failedBehavior.result!.summary.modules as unknown as Array<{ status: string; reused: number; reportRef: Parameters<typeof composition.artifacts.get>[0] }>)[0]!;
    assert.equal(module.status, 'BEHAVIOR_FAILED'); assert.equal(module.reused, 1); assert.equal(testCalls, 2); assert.equal(codeCalls, 2);
    const behaviorReport = JSON.parse(Buffer.from(await composition.artifacts.get(module.reportRef)).toString('utf8'));
    assert.equal(behaviorReport.cases[0]?.actual.sum, '-1'); assert.equal(behaviorReport.cases[0]?.sectionBindings[0]?.versionId, revised.version.versionId);
    const evidence = await composition.apps.workbenchEvaluation.revisionEvidence(next.taskId);
    assert.equal(evidence.revisionAuthorized, false);
    assert.equal(evidence.modules[0]?.candidates[0]?.versionId, revised.version.versionId);
    assert.deepEqual(evidence.modules[0]?.candidates[0]?.sections[0]?.caseIds, ['sum']);
    assert.equal(evidence.modules[0]?.knowledgeErrorProven, false, 'wrong generated code alone is not a knowledge error');
    assert.deepEqual(await composition.apps.workbenchEvaluation.revisionEvidence(next.taskId), evidence, 'read-only evidence is deterministic');
    const indexWrite = composition.apps.knowledgeIndex.index.write.bind(composition.apps.knowledgeIndex.index); let indexFail = true;
    composition.apps.knowledgeIndex.index.write = (...args) => { if (indexFail) throw new Error('TEST_INDEX_INTERRUPTION'); return indexWrite(...args); };
    const revision = await composition.apps.workbenchKnowledgeRevision.start(next.taskId);
    const partial = await composition.apps.workbenchStages.wait(revision.taskId);
    assert.equal(partial.reasonCode, 'INDEX_BUILD_PARTIAL'); assert.equal(reviewCalls, 1); assert.equal(revisionCalls, 1);
    const saved = composition.apps.workbenchStages.store.checkpoints(revision.taskId).find(item => item.key.startsWith('revision-card:'))!;
    const correctedId = String(saved.result.summary.versionId);
    const corrected = composition.repository.getKnowledgeVersion(correctedId)!;
    assert.equal(corrected.metadata.cardId, 'card-add'); assert.equal(corrected.parentVersionId, revised.version.versionId);
    const correctedBody = Buffer.from(await composition.artifacts.get(corrected.bodyRef)).toString('utf8');
    assert.match(correctedBody, /The sum/); assert.ok(correctedBody.endsWith('## Limits\nNo overflow.\nOverflow is excluded explicitly.'));
    await composition.close(); composition = createComposition({ runtimeDir }); install();
    indexFail = false; composition.apps.workbenchStages.resume(revision.taskId, revision.inputDigest);
    const revisionDone = await composition.apps.workbenchStages.wait(revision.taskId);
    assert.equal(revisionDone.status, 'SUCCEEDED', revisionDone.reasonCode ?? ''); assert.equal(revisionDone.result!.summary.outcome, 'REVISED_INDEXED'); assert.equal(reviewCalls, 1); assert.equal(revisionCalls, 1);
    assert.equal((await composition.apps.workbenchKnowledgeRevision.start(next.taskId)).taskId, revision.taskId);
    assert.equal((await composition.apps.knowledgeIndex.preview('card-add')).versionId, correctedId);
    await assert.rejects(composition.apps.flywheel.ingestCandidate({ ...input, body: input.body + '\nConcurrent stale write.', expectedParentVersionId: revised.version.versionId }), /CANDIDATE_PARENT_CHANGED/);
    assert.equal(composition.repository.latestKnowledgeVersion(input.moduleId)?.versionId, correctedId);
    assert.equal((await composition.apps.flywheel.ingestCandidate({ ...input, body: correctedBody, expectedParentVersionId: revised.version.versionId })).version.versionId, correctedId);
    wrongCode = false;
    const correctedCode = await composition.apps.workbenchReconstruction.start(project.snapshotId, [correctedId]);
    assert.equal((await composition.apps.workbenchStages.wait(correctedCode.taskId)).status, 'SUCCEEDED');
    const correctedEval = await composition.apps.workbenchEvaluation.start(correctedCode.taskId);
    const correctedResult = await composition.apps.workbenchStages.wait(correctedEval.taskId);
    assert.equal((correctedResult.result!.summary.modules as any[])[0].status, 'BEHAVIOR_PASSED');
    assert.equal(testCalls, 2, 'knowledge revision preserves historical expected results');
    writeFileSync(join(root, 'math.c'), '#include "math.h"\nint add(int a,int b){return a+b+1;}');
    git('add', '.'); git('commit', '-qm', 'Changed reference behavior');
    const changedProject = await composition.apps.workbenchProjects.create({ directory: root, moduleIds: ['math'] });
    const changedCard = await composition.apps.flywheel.ingestCandidate({ ...input, body: input.body + '\nReference source revision changed.',
      metadata: { ...input.metadata, projectSnapshotId: changedProject.snapshotId }, provenance: [{ path: 'math.c', commit: changedProject.commit, pinned: true }] });
    const changedCode = await composition.apps.workbenchReconstruction.start(changedProject.snapshotId, [changedCard.version.versionId]);
    assert.equal((await composition.apps.workbenchStages.wait(changedCode.taskId)).status, 'SUCCEEDED');
    const conflictTask = await composition.apps.workbenchEvaluation.start(changedCode.taskId);
    const conflict = await composition.apps.workbenchStages.wait(conflictTask.taskId);
    assert.equal(conflict.status, 'PAUSED'); assert.equal(conflict.reasonCode, 'NATIVE_TRUSTED_REFERENCE_FAILED');
    assert.equal(testCalls, 2, 'source changes cannot replace historical trusted expectations');
    assert.ok(composition.apps.workbenchStages.store.checkpoints(conflictTask.taskId).some((item) => item.key.startsWith('trusted-gate-conflict:')));
    composition.apps.workbenchStages.resume(conflictTask.taskId, conflictTask.inputDigest);
    assert.equal((await composition.apps.workbenchStages.wait(conflictTask.taskId)).reasonCode, 'NATIVE_TRUSTED_REFERENCE_FAILED');
    assert.equal(testCalls, 2, 'resuming a trusted conflict cannot propose replacement tests');
    writeFileSync(join(root, 'math.c'), '#include "missing_dependency.h"\nint add(int a,int b){return a+b;}');
    git('add', '.'); git('commit', '-qm', 'Missing reference dependency');
    const brokenProject = await composition.apps.workbenchProjects.create({ directory: root, moduleIds: ['math'] });
    const brokenCard = await composition.apps.flywheel.ingestCandidate({ ...input, body: input.body + '\nReference dependency changed.',
      metadata: { ...input.metadata, projectSnapshotId: brokenProject.snapshotId }, provenance: [{ path: 'math.c', commit: brokenProject.commit, pinned: true }] });
    const brokenCode = await composition.apps.workbenchReconstruction.start(brokenProject.snapshotId, [brokenCard.version.versionId]);
    assert.equal((await composition.apps.workbenchStages.wait(brokenCode.taskId)).status, 'SUCCEEDED');
    const baselineTask = await composition.apps.workbenchEvaluation.start(brokenCode.taskId);
    const baselineFailed = await composition.apps.workbenchStages.wait(baselineTask.taskId);
    assert.equal(baselineFailed.reasonCode, 'NATIVE_REFERENCE_BASELINE_FAILED'); assert.equal(testCalls, 2, 'missing reference dependencies must stop before TestGen');
    assert.ok(composition.apps.workbenchStages.store.checkpoints(baselineTask.taskId).some((item) => item.key.startsWith('reference-baseline:')));
    const baselineNative = composition.apps.workbenchEvaluation.dependencies.native; let retriedBuilds = 0;
    composition.apps.workbenchEvaluation.dependencies.native = { publicInterface: (...args) => baselineNative.publicInterface(...args),
      compileAndRun: async (...args) => { retriedBuilds++; return baselineNative.compileAndRun(...args); } };
    composition.apps.workbenchStages.resume(baselineTask.taskId, baselineTask.inputDigest);
    assert.equal((await composition.apps.workbenchStages.wait(baselineTask.taskId)).reasonCode, 'NATIVE_REFERENCE_BASELINE_FAILED');
    assert.equal(retriedBuilds, 1, 'failed baseline evidence cannot suppress a real retry'); assert.equal(testCalls, 2);
  } finally { await composition.close(); rmSync(root, { recursive: true, force: true }); rmSync(runtimeDir, { recursive: true, force: true }); }
});
