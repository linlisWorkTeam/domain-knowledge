/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证原生阶段的错误候选拒绝、可信用例恢复和知识修订后的失败定位。
 */
import { WorkbenchSourceFindingHistory } from '../../src/application/services/WorkbenchSourceFindingHistory.ts';
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

for (const { rejectSourceReview, mixedSourceRisks } of [{ rejectSourceReview: false, mixedSourceRisks: false }, { rejectSourceReview: true, mixedSourceRisks: false }, { rejectSourceReview: false, mixedSourceRisks: true }]) test(`native stage rejects bad candidates, resumes trusted cases after restart and maps generated failures to revised cards (source rejection=${rejectSourceReview}, mixed risks=${mixedSourceRisks})`, async () => {
  const root = mkdtempSync(join(tmpdir(), 'evaluation-source-')); const runtimeDir = mkdtempSync(join(tmpdir(), 'evaluation-runtime-'));
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q'); writeFileSync(join(root, 'math.h'), 'int add(int a,int b);');
  writeFileSync(join(root, 'math.c'), '#include "math.h"\n/* REFERENCE_PRIVATE */\nint add(int a,int b){return a+b;}');
  git('add', '.'); git('commit', '-qm', 'Fixed reference');
  let composition = createComposition({ runtimeDir }); let testCalls = 0, codeCalls = 0, generatedRuns = 0, reviewCalls = 0, revisionCalls = 0, sourceReviewCalls = 0;
  let supplementRequested = false; let exposeMixedRisk = false; let acceptFalseSource = false; let interruptSourceSection = true; const sectionCalls = new Map<string, number>();
  let wrongCandidate = true, wrongCode = false, interrupt = true, reviewKeepsKnowledge = false;
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
      if (request.role === 'review' && request.prompt.includes('FINAL_SOURCE_REVIEW')) {
        assert.ok(composition.apps.workbenchStages.store.checkpoints(_command.runId).some(row => row.key.startsWith('source-materials:')));
        const sourceReport = JSON.parse(Buffer.from(await composition.artifacts.get(_command.payload.evaluationReportRef as any)).toString('utf8'));
        assert.equal(sourceReport.observedImplementation, 'PINNED_REFERENCE'); assert.equal(sourceReport.scope, 'EXACT_CARD_SECTION');
        const body = Buffer.from(await composition.artifacts.get(_command.payload.knowledgeRef as any)).toString('utf8');
        usage(`whole-source-${_command.commandId}`, 3);
        const criteria = JSON.parse(Buffer.from(await composition.artifacts.get(_command.payload.criteriaRef as any)).toString('utf8'));
        assert.equal(criteria.verifyPreamble, criteria.section === 'Behavior');
        assert.deepEqual(criteria.sourceReviewPolicy, { schemaVersion: 'source-review-policy-v1', timeoutMs: 600000 });
        assert.equal(criteria.sourceEvidenceBindings.schemaVersion, 'source-evidence-bindings-v1');
        assert.equal(criteria.sourceEvidenceBindings.repositoryFileManifest.sourceDigest, sourceReport.sourceDigest);
        assert.ok(criteria.sourceEvidenceBindings.sourceFiles.some((file: { path: string; artifactRef: { sha256: string } }) => file.path === 'math.c' && /^[a-f0-9]{64}$/.test(file.artifactRef.sha256)));
        assert.equal(sourceReport.sectionId, `card-add#${criteria.section}`);
        assert.deepEqual(criteria.applicationVerified, { artifactDigests: true, frozenVersionBindings: true });
        if (criteria.section === 'Behavior') { assert.equal(sourceReport.cases[0].observation.actual.sum, '7'); assert.equal(sourceReport.coverage, 'DIRECT_BEHAVIOR_EVIDENCE'); }
        else { assert.deepEqual(sourceReport.cases, []); assert.equal(sourceReport.coverage, 'NO_DIRECT_BEHAVIOR_EVIDENCE'); }
        const sectionKey = `${_command.runId}:${criteria.section}`;
        sectionCalls.set(sectionKey, (sectionCalls.get(sectionKey) ?? 0) + 1);
        if (criteria.section === 'Limits' && interruptSourceSection) { interruptSourceSection = false; throw new Error('TEST_SOURCE_SECTION_INTERRUPTION'); }
        if (exposeMixedRisk && criteria.section === 'Limits') return { blocking: true, recommendation: 'ITERATE', correction: null, unresolvedRisks: ['Independent Limits evidence remains unknown.'] };
        return !acceptFalseSource && body.includes('The difference') && criteria.section === 'Behavior' ? { blocking: true, recommendation: 'ITERATE', correction: { correctionId: 'source-error', knowledgePath: 'knowledge/unit-add.md#Behavior', criterion: 'Pinned source adds the arguments.', risk: 'Incorrect operation.' }, unresolvedRisks: [] }
          : { blocking: false, recommendation: 'PASS', correction: null, unresolvedRisks: [] };
      }
      if (request.role === 'review' && request.prompt.includes('REVISION_SOURCE_REVIEW')) { sourceReviewCalls++; const sourceRef = _command.payload.evaluationReportRef as any; const sourceReport = JSON.parse(Buffer.from(await composition.artifacts.get(sourceRef)).toString('utf8')); assert.equal(sourceReport.observedImplementation, 'PINNED_REFERENCE'); assert.ok(composition.apps.workbenchStages.store.checkpoints(_command.runId).some(row => row.key.startsWith('revision-source-materials:')), 'source review inputs persist before invoking the model'); assert.equal(sourceReport.cases[0].observation.actual.sum, '7'); assert.doesNotMatch(request.prompt, /\"sum\":\"-1\"/); usage('source-review', 3); if (rejectSourceReview) return { blocking: true, recommendation: 'ITERATE', correction: null, unresolvedRisks: ['Candidate contradicts the fixed source.'] }; return { blocking: false, recommendation: 'PASS', correction: null, unresolvedRisks: [] }; }
      if (request.role === 'review') { reviewCalls++; usage(`review-${reviewCalls}`, 3); if (reviewKeepsKnowledge) { wrongCode = false; return { blocking: false, recommendation: 'PASS', correction: null, unresolvedRisks: [] }; } return { blocking: true, recommendation: 'ITERATE', correction: { correctionId: 'fix-arithmetic-operation', targetHeading: 'Behavior', replacementMarkdown: '## Behavior\nReturn the sum of the representable signed arguments.', knowledgePath: 'knowledge/unit-add.md#Behavior', criterion: 'Describe addition rather than subtraction according to the trusted sum observation.', risk: 'Incorrect arithmetic operation' }, unresolvedRisks: [] }; }
      if (request.role === 'doc-gen') { revisionCalls++; usage(`revision-${revisionCalls}`, 4); if (rejectSourceReview && revisionCalls === 1) return { title: 'Addition', description: 'Representable sum', sections: [{ sectionId: 'section-1', body: '## Invalid top heading' }] }; assert.equal(request.stage, rejectSourceReview ? 'revision:attempt-2' : 'revision'); const correction = (_command.payload.corrections as Array<Record<string, unknown>>)[0]!; assert.match(String(correction.correctionId), /^COR-[0-9]+$/); assert.deepEqual(Object.keys(correction).sort(), ['correctionId', 'criterion', 'evidenceRefs', 'knowledgePath', 'risk']); return { title: 'Addition', description: 'Representable sum', sections: [{ sectionId: 'section-1', body: 'The sum of the two arguments is returned, rather than their difference. For the fixed inputs 3 and 4, the expected result is 7. Inputs and result must be representable signed integers. Overflow and unsupported values remain outside the specified interface contract.\n\nAddition is required because the public operation combines both arguments, rather than computing an ordered difference. The trusted reference observation is evidence for the fixed sample; it does not establish that every possible integer input has been tested. Callers must still respect the signed integer range. Negative operands may affect the sign of the sum, but they do not change the arithmetic operation into subtraction. No memory allocation or persistent state is part of this interface.' }] }; }
      if (request.role === 'code') { codeCalls++; usage(`code-${codeCalls}`, 7);
        return { files: [{ path: 'math.h', content: 'int add(int a,int b);' }, { path: 'math.c', content: `#include "math.h"\nint add(int a,int b){return a${wrongCode ? '-' : '+'}b;}` }] }; }
      assert.equal(request.role, 'test-gen'); testCalls++; usage(`test-${testCalls}`, 5);
      assert.match(request.prompt, /card-add#Behavior/);
      if (testCalls === 2) { assert.match(request.prompt, /NATIVE_BEHAVIOR_MISMATCH/); assert.match(request.prompt, /rejectedCandidate/); }
      if (supplementRequested) {
        assert.match(request.prompt, /missing|unknown/); assert.match(request.prompt, /card-add#Limits/);
        return { oracleRequired: true, nativeSuite: { schemaVersion: 'native-cases-v1', cases: [{ caseId: 'zero', description: 'Zero boundary', sections: ['card-add#Limits'], variables: [],
          calls: [{ function: 'add', arguments: [{ integer: '0' }, { integer: '0' }], result: 'sum' }], observations: [{ name: 'sum', kind: 'integer', read: { variable: 'sum' } }], expected: { sum: '0' } }] } };
      }
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
    const sourceTask = await composition.apps.workbenchSourceVerification.start(done.taskId);
    const sourceInterrupted = await composition.apps.workbenchStages.wait(sourceTask.taskId);
    assert.equal(sourceInterrupted.status, 'FAILED');
    assert.ok(composition.apps.workbenchStages.store.checkpoints(sourceTask.taskId).some(item => item.key.startsWith('source-section:')));
    await composition.close(); composition = createComposition({ runtimeDir }); install();
    composition.apps.workbenchStages.resume(sourceTask.taskId, sourceTask.inputDigest);
    const sourceDone = await composition.apps.workbenchStages.wait(sourceTask.taskId);
    assert.equal(sectionCalls.get(`${sourceTask.taskId}:Behavior`), 1, 'finished chapters survive restart without a new model call');
    assert.equal(sectionCalls.get(`${sourceTask.taskId}:Limits`), 2);
    assert.equal(sourceDone.usage.modelCalls, sourceInterrupted.usage.modelCalls + 1);
    assert.equal(sourceDone.status, 'SUCCEEDED', sourceDone.reasonCode ?? '');
    await assert.rejects(composition.apps.workbenchSourceRevision.start(done.taskId), /SOURCE_REVISION_VERIFICATION_REQUIRED/);
    await assert.rejects(composition.apps.workbenchSourceRevision.start(sourceTask.taskId), /SOURCE_REVISION_NO_CORRECTION/);
    assert.equal(sourceDone.result!.summary.outcome, 'SOURCE_MATCHED'); assert.equal(sourceDone.result!.summary.publicationVerified, false);
    assert.equal((await composition.apps.workbenchSourceVerification.start(done.taskId)).taskId, sourceTask.taskId);
    await assert.rejects(composition.apps.workbenchSourceVerification.start(sourceTask.taskId), /SOURCE_VERIFICATION_EVALUATION_REQUIRED/);
    await assert.rejects(composition.apps.workbenchEvaluation.revisionEvidence(sourceTask.taskId), /REVISION_COMPLETED_EVALUATION_REQUIRED/);
    await assert.rejects(composition.apps.workbenchEvaluation.progress(sourceTask.taskId), /PIPELINE_PROGRESS_UNAVAILABLE/);
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
    const mismatchTask = await composition.apps.workbenchSourceVerification.start(next.taskId);
    const mismatch = await composition.apps.workbenchStages.wait(mismatchTask.taskId);
    assert.equal(mismatch.status, 'SUCCEEDED', mismatch.reasonCode ?? ''); assert.equal(mismatch.result!.summary.outcome, 'SOURCE_MISMATCH');
    assert.equal((mismatch.result!.summary.cards as any[])[0].versionId, revised.version.versionId);
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
    assert.equal(sourceReviewCalls, 1);
    if (rejectSourceReview) {
      const attempts = composition.apps.workbenchStages.store.events(revision.taskId).map(event => event.detail as any).filter(detail => detail.phase === 'role-stage-attempt' && detail.role === 'doc-gen');
      assert.deepEqual(attempts.map(entry => entry.status), ['STARTED', 'REJECTED', 'STARTED', 'PASSED']);
      const rejectedAttempt = attempts.find(entry => entry.status === 'REJECTED')!;
      const audit = await composition.apps.workbenchReconstruction.artifact(revision.taskId, rejectedAttempt.artifactRef.sha256);
      assert.ok(audit); const recorded = JSON.parse(Buffer.from(audit.bytes).toString('utf8'));
      assert.equal(recorded.issue.code, 'DOC_GEN_SECTION_HEADING_INVALID');
      assert.equal(recorded.output.sections[0].body, '## Invalid top heading');
      assert.equal(await composition.apps.workbenchReconstruction.artifact(next.taskId, rejectedAttempt.artifactRef.sha256), null, 'another task cannot download the attempt by digest');
      assert.equal(partial.status, 'SUCCEEDED'); assert.equal(partial.result!.summary.outcome, 'UNRESOLVED');
      assert.deepEqual(partial.result!.summary.updatedVersionIds, []); assert.equal(partial.result!.summary.indexed, false);
      assert.equal(composition.repository.latestKnowledgeVersion(input.moduleId)?.versionId, revised.version.versionId);
      const rejected = (partial.result!.summary.cards as Array<Record<string, any>>)[0]!;
      assert.ok(rejected.unresolved.includes('REVISION_SOURCE_REVIEW_REJECTED'));
      assert.ok(await composition.artifacts.verify(rejected.draftRef));
      assert.equal((await composition.apps.workbenchKnowledgeRevision.start(next.taskId)).taskId, revision.taskId);
      assert.equal(sourceReviewCalls, 1); assert.equal(testCalls, 2, 'source rejection retains trusted expectations');
      return;
    }
    assert.equal(partial.reasonCode, 'INDEX_BUILD_PARTIAL'); assert.equal(reviewCalls, 1); assert.equal(revisionCalls, 1);
    const saved = composition.apps.workbenchStages.store.checkpoints(revision.taskId).find(item => item.key.startsWith('revision-card:'))!;
    const correctedId = String(saved.result.summary.versionId);
    const corrected = composition.repository.getKnowledgeVersion(correctedId)!;
    assert.ok(corrected.metadata.sourceReviewResultRef); assert.equal(corrected.metadata.cardId, 'card-add'); assert.equal(corrected.parentVersionId, revised.version.versionId);
    const correctedBody = Buffer.from(await composition.artifacts.get(corrected.bodyRef)).toString('utf8');
    assert.match(correctedBody, /The sum/); assert.ok(correctedBody.endsWith('## Limits\nNo overflow.\nOverflow is excluded explicitly.'));
    await composition.close(); composition = createComposition({ runtimeDir }); install();
    indexFail = false; composition.apps.workbenchStages.resume(revision.taskId, revision.inputDigest);
    const revisionDone = await composition.apps.workbenchStages.wait(revision.taskId);
    assert.equal(revisionDone.status, 'SUCCEEDED', revisionDone.reasonCode ?? ''); assert.equal(revisionDone.result!.summary.outcome, 'REVISED_INDEXED'); assert.equal(reviewCalls, 1); assert.equal(revisionCalls, 1);
    assert.equal((await composition.apps.workbenchKnowledgeRevision.start(next.taskId)).taskId, revision.taskId);
    assert.equal(sourceReviewCalls, 1, 'index recovery reuses the review of the committed final body');
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
    // Controlled generation handoff; actual compiler, evaluator, revision and coordinator execute below.
    const pipelineCard = await composition.apps.flywheel.ingestCandidate({ ...input, body: correctedBody + '\nThis acceptance run retains the representable addition contract.' });
    const originalGenerate = composition.apps.workbenchGeneration.generate.bind(composition.apps.workbenchGeneration);
    const originalEnvironment = composition.apps.workbenchPipelines.dependencies.environment;
    composition.apps.workbenchGeneration.generate = async () => ({ artifactRefs: [pipelineCard.version.bodyRef], summary: { snapshotId: project.snapshotId, generated: 1, evaluated: false, cards: [{ versionId: pipelineCard.version.versionId }] } });
    composition.apps.workbenchPipelines.dependencies.environment = async () => 'fixed-controlled-native-environment';
    wrongCode = true; reviewKeepsKnowledge = true;
    const priorCodeCalls = codeCalls, priorRevisionCalls = revisionCalls;
    try {
      const pipeline = await composition.apps.workbenchPipelines.start(project.snapshotId);
      const completed = await composition.apps.workbenchPipelines.wait(pipeline.pipelineId);
      assert.equal(completed.status, 'SUCCEEDED', completed.reasonCode ?? ''); assert.equal(completed.iterations!.length, 2);
      const [first, second] = completed.iterations!;
      assert.equal(composition.apps.workbenchStages.get(first!.revision!.taskId).result!.summary.outcome, 'NO_REVISION');
      assert.deepEqual(first!.versionIds, second!.versionIds, 'correct knowledge is not rewritten to force a new Code attempt');
      assert.notEqual(first!.reconstruction!.taskId, second!.reconstruction!.taskId);
      assert.equal(first!.progress!.failed.length, 1); assert.equal(second!.progress!.failed.length, 0);
      assert.equal(codeCalls - priorCodeCalls, 2, 'failed Code cache cannot suppress a same-card retry');
      assert.equal(revisionCalls, priorRevisionCalls, 'Review PASS must not invoke DocGen');
      assert.equal(testCalls, 2, 'all old trusted expectations are retained');
      assert.equal(completed.completed.at(-1), 'ASSOCIATE');
      assert.equal(composition.apps.workbenchPipelines.detail(pipeline.pipelineId).publicationVerified, false);
      const calls = codeCalls;
      assert.equal((await composition.apps.workbenchReconstruction.start(project.snapshotId, second!.versionIds, { retryEvaluationTaskId: first!.evaluation!.taskId })).taskId, second!.reconstruction!.taskId);
      assert.equal(codeCalls, calls);
      await assert.rejects(composition.apps.workbenchReconstruction.start(project.snapshotId, second!.versionIds, { retryEvaluationTaskId: second!.evaluation!.taskId }), /RECONSTRUCTION_RETRY_INVALID/);
    } finally { composition.apps.workbenchGeneration.generate = originalGenerate; composition.apps.workbenchPipelines.dependencies.environment = originalEnvironment; reviewKeepsKnowledge = false; wrongCode = false; }
    // A correct reconstruction must not excuse false knowledge that it happened to ignore.
    exposeMixedRisk = mixedSourceRisks;
    const falseCard = await composition.apps.flywheel.ingestCandidate({ ...input, body: input.body.replace('The sum', 'The difference') + '\nIndependent whole-card counterexample.' });
    wrongCode = false;
    const luckyCode = await composition.apps.workbenchReconstruction.start(project.snapshotId, [falseCard.version.versionId]);
    assert.equal((await composition.apps.workbenchStages.wait(luckyCode.taskId)).status, 'SUCCEEDED');
    const luckyTask = await composition.apps.workbenchEvaluation.start(luckyCode.taskId);
    const lucky = await composition.apps.workbenchStages.wait(luckyTask.taskId);
    assert.equal((lucky.result!.summary.modules as any[])[0].status, 'BEHAVIOR_PASSED');
    assert.equal((await composition.apps.workbenchEvaluation.revisionEvidence(luckyTask.taskId)).modules[0]!.nextAction, 'NO_BEHAVIOR_REVISION_REQUIRED');
    let falseSource = await composition.apps.workbenchSourceVerification.start(luckyTask.taskId);
    const falseResult = await composition.apps.workbenchStages.wait(falseSource.taskId);
    assert.equal(falseResult.status, 'SUCCEEDED', falseResult.reasonCode ?? '');
    assert.equal(falseResult.result!.summary.outcome, mixedSourceRisks ? 'UNRESOLVED' : 'SOURCE_MISMATCH');
    assert.equal(falseResult.result!.summary.publicationVerified, false);
    const originalSourceTaskId = falseSource.taskId;
    acceptFalseSource = true;
    falseSource = await composition.apps.workbenchSourceVerification.start(luckyTask.taskId);
    assert.notEqual(falseSource.taskId, originalSourceTaskId, 'new input freezes the existing contradiction');
    const carried = await composition.apps.workbenchStages.wait(falseSource.taskId);
    assert.equal(carried.status, 'SUCCEEDED', carried.reasonCode ?? '');
    assert.equal(carried.result!.summary.outcome, mixedSourceRisks ? 'UNRESOLVED' : 'SOURCE_MISMATCH', 'a later model PASS cannot erase a source contradiction in unchanged knowledge');
    const carriedCard = (carried.result!.summary.cards as any[])[0];
    assert.equal(carriedCard.originEvidence.taskId, originalSourceTaskId); assert.equal(carriedCard.carriedForward, true);
    assert.equal(sectionCalls.get(`${falseSource.taskId}:Behavior`), undefined, 'carried finding is not represented as a fresh model call');
    assert.equal((await composition.apps.workbenchSourceVerification.start(luckyTask.taskId)).taskId, falseSource.taskId, 'history selection is stable and ignores inherited copies');
    const history = new WorkbenchSourceFindingHistory(composition.apps.workbenchEvaluation);
    await assert.rejects(history.validate({ ...carriedCard.originEvidence, checkpointDigest: '0'.repeat(64) }, falseSource.input), /SOURCE_HISTORY_BINDING_INVALID/);
    await assert.rejects(history.validate(carriedCard.originEvidence, { ...falseSource.input, cardVersionIds: [] }), /SOURCE_HISTORY_BINDING_INVALID/);
    acceptFalseSource = false;

    const sourceIndexWrite = composition.apps.knowledgeIndex.index.write.bind(composition.apps.knowledgeIndex.index);
    composition.apps.knowledgeIndex.index.write = () => { throw new Error('TEST_SOURCE_INDEX_INTERRUPTION'); };
    const beforeSourceDocGen = revisionCalls;
    const sourceRepair = await composition.apps.workbenchSourceRevision.start(falseSource.taskId);
    assert.deepEqual(sourceRepair.input.parameters.sourceReviewPolicy, { schemaVersion: 'source-review-policy-v1', timeoutMs: 600000 });
    const partialSource = await composition.apps.workbenchStages.wait(sourceRepair.taskId);
    assert.equal(partialSource.status, 'FAILED'); assert.equal(partialSource.reasonCode, 'INDEX_BUILD_PARTIAL');
    assert.equal(revisionCalls, beforeSourceDocGen + 1);
    composition.apps.knowledgeIndex.index.write = sourceIndexWrite;
    composition.apps.workbenchStages.resume(sourceRepair.taskId, sourceRepair.inputDigest);
    const repairedSource = await composition.apps.workbenchStages.wait(sourceRepair.taskId);
    assert.equal(repairedSource.status, 'SUCCEEDED', repairedSource.reasonCode ?? '');
    assert.equal(repairedSource.result!.summary.outcome, mixedSourceRisks ? 'UNRESOLVED' : 'REVISED_INDEXED');
    assert.equal(sourceRepair.input.parameters.sourceCorrectionPolicy, 'source-correction-selection-v1');
    assert.equal(repairedSource.result!.summary.indexed, true);
    if (mixedSourceRisks) assert.match(JSON.stringify(repairedSource.result!.summary.unresolved), /Independent Limits evidence remains unknown/);
    assert.equal(revisionCalls, beforeSourceDocGen + 1, 'index retry must reuse the accepted source revision');
    assert.equal(repairedSource.usage.modelCalls, partialSource.usage.modelCalls);
    assert.equal(repairedSource.usage.tokens, partialSource.usage.tokens);
    const sourceVersions = repairedSource.result!.summary.versionIds as string[];
    assert.notEqual(sourceVersions[0], falseCard.version.versionId);
    assert.equal(composition.repository.getKnowledgeVersion(sourceVersions[0]!)!.metadata.sourceVerificationTaskId, falseSource.taskId);
    assert.equal((await composition.apps.workbenchSourceRevision.start(falseSource.taskId)).taskId, sourceRepair.taskId);
    const sourceRebuilt = await composition.apps.workbenchReconstruction.start(project.snapshotId, sourceVersions);
    assert.equal((await composition.apps.workbenchStages.wait(sourceRebuilt.taskId)).status, 'SUCCEEDED');
    const sourceRetest = await composition.apps.workbenchEvaluation.start(sourceRebuilt.taskId);
    const sourceRetested = await composition.apps.workbenchStages.wait(sourceRetest.taskId);
    assert.equal(sourceRetested.status, 'SUCCEEDED');
    assert.equal((sourceRetested.result!.summary.modules as any[])[0].status, 'BEHAVIOR_PASSED');
    const recheck = await composition.apps.workbenchSourceVerification.start(sourceRetest.taskId);
    const rechecked = await composition.apps.workbenchStages.wait(recheck.taskId);
    assert.equal(rechecked.result!.summary.outcome, mixedSourceRisks ? 'UNRESOLVED' : 'SOURCE_MATCHED');
    if (mixedSourceRisks) {
      const sections = (rechecked.result!.summary.cards as any[])[0].sections;
      assert.equal(sections.find((section: any) => section.section === 'Behavior').outcome, 'SOURCE_MATCHED');
      assert.equal(sections.find((section: any) => section.section === 'Limits').outcome, 'UNRESOLVED');
      assert.equal(rechecked.result!.summary.publicationVerified, false);
    }
    assert.equal(testCalls, 2, 'source-driven revision cannot replace or drop existing trusted expected results');

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
    if (mixedSourceRisks) {
      supplementRequested = true;
      const supplemental = await composition.apps.workbenchEvaluation.start(sourceRebuilt.taskId, rechecked.taskId);
      assert.equal(supplemental.input.parameters.supplementContract, 'knowledge-test-supplement-v1');
      const done = await composition.apps.workbenchStages.wait(supplemental.taskId);
      assert.equal(done.status, 'SUCCEEDED', done.reasonCode ?? '');
      const report = (done.result!.summary.modules as any[])[0];
      assert.equal(report.proposed, 1); assert.equal(report.reused, 1); assert.equal(report.passed, 2);
      assert.equal(testCalls, 3);
      assert.equal((await composition.apps.workbenchEvaluation.start(sourceRebuilt.taskId, rechecked.taskId)).taskId, supplemental.taskId);
      assert.equal(testCalls, 3);
      await assert.rejects(composition.apps.workbenchEvaluation.prepare(changedCode.taskId, rechecked.taskId), /NATIVE_SUPPLEMENT_BINDING_INVALID/);
    }
  } finally { await composition.close(); rmSync(root, { recursive: true, force: true }); rmSync(runtimeDir, { recursive: true, force: true }); }
});
