/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证发布证据不可跨源码、代码、卡片或测试集拼接。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256 } from '../../src/domain/Domain.ts';
import { publicationEvidence, type PublicationEvidence } from '../../src/domain/workbench/WorkbenchPublication.ts';
import { createStageTask, canonicalJson, type StageTask, type StageInput, type StageResult } from '../../src/domain/workbench/StageTask.ts';
import { publicationFixture as fixture, publicationRef as ref } from '../helpers/WorkbenchPublicationFixture.ts';
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
    input => { input.sourceModules.version = 'other-module'; },
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
