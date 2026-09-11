/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：交叉校验同版本发布证据，不把任务成功或凭据本身当作已发布。
 */
import { sha256 } from '../../Domain.ts';
import { sourceVerificationOutcome, type SourceCardBinding, type SourceCardResult } from '../knowledge/KnowledgeSourceVerification.ts';
import { pipelineFixedFailure, pipelineSourceFailure, pipelineStageFailure, type PipelineFixedSuite } from './WorkbenchPipeline.ts';
import { canonicalJson, createStageTask, STAGE_CONTRACT, type StageTask, type JsonValue } from './StageTask.ts';
export const PUBLICATION_EVIDENCE_CONTRACT = 'workbench-publication-evidence-v2';
export interface PublicationEvidence {
  reconstruction: StageTask; evaluation: StageTask; fixedEvaluation: StageTask; sourceVerification: StageTask;
  cards: SourceCardBinding[]; sourceModules: Record<string, string>; fixedSuites: PipelineFixedSuite[];
}
function requireEvidence(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new Error(`PUBLICATION_${reason}`);
}
function sameSet(a: string[], b: string[]) {
  return a.length > 0 && a.every(item => typeof item === 'string' && item.length > 0)
    && new Set(a).size === a.length && new Set(b).size === b.length && canonicalJson([...a].sort()) === canonicalJson([...b].sort());
}
function modules(task: StageTask): Array<Record<string, JsonValue>> {
  const value = task.result?.summary.modules;
  requireEvidence(Array.isArray(value) && value.length > 0 && value.every(item => item && typeof item === 'object' && !Array.isArray(item) && typeof item.moduleId === 'string' && item.moduleId.length > 0), 'MODULES_INVALID');
  return value as Array<Record<string, JsonValue>>;
}
/** 调用方必须从可信存储重读输入；返回值未校验CAS、未执行发布事务。 */
export function publicationEvidence(input: PublicationEvidence) {
  const { reconstruction: code, evaluation, fixedEvaluation: fixed, sourceVerification: source, cards, sourceModules, fixedSuites } = input;
  const tasks = [code, evaluation, fixed, source];
  for (const task of tasks) {
    requireEvidence(task.status === 'SUCCEEDED' && task.result && !task.cancelRequested && task.reasonCode === null, 'STAGE_NOT_SUCCEEDED');
    requireEvidence(task.contractVersion === STAGE_CONTRACT, 'CONTRACT_INCOMPATIBLE');
    const identity = createStageTask(task.input, task.limits, task.createdAt);
    requireEvidence(identity.taskId === task.taskId && identity.inputDigest === task.inputDigest, 'STAGE_IDENTITY_CHANGED');
    requireEvidence(task.input.projectId === code.input.projectId && task.input.sourceRevision === code.input.sourceRevision
      && task.input.sourceDigest === code.input.sourceDigest && task.input.configurationDigest === code.input.configurationDigest
      && typeof code.input.parameters.snapshotId === 'string' && code.input.parameters.snapshotId.length > 0
      && task.input.parameters.snapshotId === code.input.parameters.snapshotId
      && sameSet(task.input.cardVersionIds, code.input.cardVersionIds), 'VERSION_BINDING_CHANGED');
  }
  requireEvidence(code.input.stage === 'FLYWHEEL' && code.input.parameters.operation === undefined && !pipelineStageFailure(code), 'RECONSTRUCTION_REJECTED');
  requireEvidence(evaluation.input.stage === 'EVALUATE' && evaluation.input.parameters.operation === undefined && !pipelineStageFailure(evaluation), 'BEHAVIOR_REJECTED');
  const codeDigest = sha256(canonicalJson(code.result));
  for (const task of [evaluation, fixed]) requireEvidence(task.input.parameters.reconstructionTaskId === code.taskId
    && task.input.parameters.reconstructionDigest === codeDigest && task.result!.summary.reconstructionTaskId === code.taskId, 'RECONSTRUCTION_BINDING_CHANGED');
  requireEvidence(!pipelineFixedFailure(fixed, code.taskId), 'FIXED_REJECTED');
  requireEvidence(!pipelineSourceFailure(source) && source.input.parameters.evaluationTaskId === evaluation.taskId
    && source.input.parameters.evaluationDigest === sha256(canonicalJson(evaluation.result)), 'SOURCE_REJECTED');
  requireEvidence(sameSet(cards.map(card => card.versionId), code.input.cardVersionIds) && sameSet(Object.keys(sourceModules), code.input.cardVersionIds)
    && Object.values(sourceModules).every(id => typeof id === 'string' && id.length > 0), 'CARD_COVERAGE_INVALID');
  requireEvidence(sourceVerificationOutcome(cards, source.result!.summary.cards as unknown as SourceCardResult[]) === 'SOURCE_MATCHED', 'SOURCE_BODY_CHANGED');
  const codeModules = modules(code); const expected = codeModules.map(module => String(module.moduleId ?? ''));
  requireEvidence(sameSet(expected, cards.map(card => sourceModules[card.versionId]!).filter((id, i, all) => all.indexOf(id) === i)), 'MODULE_COVERAGE_INVALID');
  requireEvidence(codeModules.every(module => Array.isArray(module.cardVersionIds) && sameSet(module.cardVersionIds as string[], cards.filter(card => sourceModules[card.versionId] === module.moduleId).map(card => card.versionId))), 'MODULE_CARD_BINDING_CHANGED');
  for (const task of [evaluation, fixed]) {
    const results = modules(task);
    requireEvidence(sameSet(expected, results.map(module => String(module.moduleId ?? ''))), 'MODULE_COVERAGE_INVALID');
    requireEvidence(results.every(module => Number.isSafeInteger(module.total) && Number(module.total) > 0 && module.passed === module.total), 'CASE_COVERAGE_INVALID');
  }
  requireEvidence(sameSet(expected, fixedSuites.map(suite => suite.moduleId)), 'FIXED_SUITE_COVERAGE_INVALID');
  const refs = fixed.input.parameters.suiteRefs;
  requireEvidence(refs && typeof refs === 'object' && !Array.isArray(refs), 'FIXED_SUITE_BINDING_CHANGED');
  for (const suite of fixedSuites) requireEvidence(/^[a-f0-9]{64}$/.test(suite.suiteRef.sha256)
    && canonicalJson(refs[suite.moduleId]) === canonicalJson(suite.suiteRef), 'FIXED_SUITE_BINDING_CHANGED');
  const evidence = { schemaVersion: PUBLICATION_EVIDENCE_CONTRACT, projectId: code.input.projectId,
    snapshotId: code.input.parameters.snapshotId, sourceRevision: code.input.sourceRevision, sourceDigest: code.input.sourceDigest,
    configurationDigest: code.input.configurationDigest, sourceModules, cards: [...cards].sort((a, b) => a.cardId.localeCompare(b.cardId)),
    fixedSuites: [...fixedSuites].sort((a, b) => a.moduleId.localeCompare(b.moduleId)),
    tasks: tasks.map(task => ({ taskId: task.taskId, inputDigest: task.inputDigest, resultDigest: sha256(canonicalJson(task.result)) })) };
  return { ...evidence, evidenceDigest: sha256(canonicalJson(evidence)), publicationVerified: false as const };
}
