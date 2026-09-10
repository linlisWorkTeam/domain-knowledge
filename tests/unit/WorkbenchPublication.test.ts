/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证发布证据不可跨源码、代码、卡片或测试集拼接。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256 } from '../../src/domain/Domain.ts';
import { publicationEvidence, type PublicationEvidence } from '../../src/domain/services/workbench/WorkbenchPublication.ts';
import { createStageTask, canonicalJson, type StageTask, type StageInput, type StageResult } from '../../src/domain/services/workbench/StageTask.ts';
import { SOURCE_VERIFICATION_CONTRACT } from '../../src/domain/services/knowledge/KnowledgeSourceVerification.ts';
const ref = (text: string) => ({ artifactId: `sha256:${sha256(text)}`, sha256: sha256(text), size: text.length, mediaType: 'application/json' });
function fixture(): PublicationEvidence {
  const base: StageInput = { projectId: 'project', stage: 'FLYWHEEL', sourceRevision: 'commit', sourceDigest: sha256('source'), configurationDigest: sha256('configuration'), cardVersionIds: ['version'], parameters: { snapshotId: 'snapshot' } };
  const done = (input: StageInput, summary: StageResult['summary']): StageTask => ({ ...createStageTask(input, {}, 'now'), status: 'SUCCEEDED', result: { artifactRefs: [], summary } });
  const reconstruction = done(base, { modules: [{ moduleId: 'module', cardVersionIds: ['version'], interfaceComparison: { compatible: true } }] });
  const params = { snapshotId: 'snapshot', reconstructionTaskId: reconstruction.taskId, reconstructionDigest: sha256(canonicalJson(reconstruction.result)) };
  const evaluation = done({ ...base, stage: 'EVALUATE', parameters: params }, { reconstructionTaskId: reconstruction.taskId, requestedModules: 1, completedModules: 1,
    modules: [{ moduleId: 'module', status: 'BEHAVIOR_PASSED', interfaceCompatible: true, passed: 2, total: 2 }] });
  const suiteRef = ref('fixed');
  const fixedEvaluation = done({ ...base, stage: 'EVALUATE', parameters: { ...params, operation: 'FIXED_NATIVE_EVALUATION', fixedEvaluationContract: 'fixed-native-evaluation-v1', suiteRefs: { module: suiteRef } } },
    { reconstructionTaskId: reconstruction.taskId, publicationVerified: false, modules: [{ moduleId: 'module', status: 'FIXED_PASSED', interfaceCompatible: true, referencePassed: true, passed: 2, total: 2 }] });
  const cards = [{ cardId: 'card', versionId: 'version', moduleId: 'module', bodyDigest: sha256('body') }];
  const sourceVerification = done({ ...base, stage: 'EVALUATE', parameters: { snapshotId: 'snapshot', operation: 'KNOWLEDGE_SOURCE_VERIFICATION', verificationContract: SOURCE_VERIFICATION_CONTRACT,
    evaluationTaskId: evaluation.taskId, evaluationDigest: sha256(canonicalJson(evaluation.result)) } },
    { snapshotId: 'snapshot', evaluationTaskId: evaluation.taskId, publicationVerified: false, outcome: 'SOURCE_MATCHED', cards: cards.map(card => ({ ...card, outcome: 'SOURCE_MATCHED' })) });
  return { reconstruction, evaluation, fixedEvaluation, sourceVerification, cards, fixedSuites: [{ moduleId: 'module', suiteRef }] };
}
function reidentify(task: StageTask) { const identity = createStageTask(task.input, task.limits, task.createdAt); task.taskId = identity.taskId; task.inputDigest = identity.inputDigest; }
test('joint evidence binds successful stages but never claims transaction publication', () => {
  const input = fixture(); const result = publicationEvidence(input);
  assert.equal(result.publicationVerified, false); assert.equal(result.tasks.length, 4);
  assert.equal(result.evidenceDigest, publicationEvidence(structuredClone(input)).evidenceDigest);
});
test('individually successful evidence cannot cross version, source, configuration or reconstruction boundaries', () => {
  const mutations: Array<(input: PublicationEvidence) => void> = [
    input => { input.fixedEvaluation.input.cardVersionIds = ['another']; reidentify(input.fixedEvaluation); },
    input => { input.evaluation.input.sourceDigest = sha256('other'); reidentify(input.evaluation); },
    input => { input.sourceVerification.input.configurationDigest = sha256('other'); reidentify(input.sourceVerification); },
    input => { input.fixedEvaluation.input.parameters.reconstructionTaskId = 'other'; reidentify(input.fixedEvaluation); },
    input => { input.sourceVerification.input.parameters.evaluationDigest = sha256('other'); reidentify(input.sourceVerification); },
    input => { input.cards[0]!.bodyDigest = sha256('changed body'); },
    input => { input.fixedSuites[0]!.suiteRef = ref('changed suite'); },
    input => { input.evaluation.input.parameters.snapshotId = 'other'; },
  ];
  for (const mutate of mutations) { const input = fixture(); mutate(input); assert.throws(() => publicationEvidence(input)); }
});
test('complete labels cannot conceal incomplete cases, missing modules or failed stages', () => {
  for (const field of ['evaluation', 'fixedEvaluation', 'sourceVerification'] as const) {
    const input = fixture(); input[field].status = 'FAILED'; assert.throws(() => publicationEvidence(input), /PUBLICATION_STAGE_NOT_SUCCEEDED/);
  }
  for (const mutate of [
    (input: PublicationEvidence) => { input.fixedSuites = []; },
    (input: PublicationEvidence) => { input.cards.push({ ...input.cards[0]! }); },
    (input: PublicationEvidence) => { const module = (input.fixedEvaluation.result!.summary.modules as Array<Record<string, unknown>>)[0]!; module.passed = 1; },
    (input: PublicationEvidence) => { const module = (input.fixedEvaluation.result!.summary.modules as Array<Record<string, unknown>>)[0]!; module.moduleId = 'wrong'; },
    (input: PublicationEvidence) => { const module = (input.fixedEvaluation.result!.summary.modules as Array<Record<string, unknown>>)[0]!; module.referencePassed = false; },
  ]) { const input = fixture(); mutate(input); assert.throws(() => publicationEvidence(input)); }
});
