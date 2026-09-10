/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义五阶段协调记录和确定性推进条件。
 */
import { SOURCE_VERIFICATION_CONTRACT, sourceVerificationOutcome, type SourceCardResult } from '../knowledge/KnowledgeSourceVerification.ts';
import { SOURCE_REVISION_CONTRACT } from '../knowledge/SourceRevision.ts';
import { sha256 } from '../../Domain.ts';
import { canonicalJson, createStageTask, type StageInput, type StageTask, type StageStatus, type WorkbenchStage } from './StageTask.ts';
export const PIPELINE_CONTRACT = 'knowledge-pipeline-v11';
export interface IterationProgress { failed: string[]; total: number; passed: number }
export interface PipelineIteration { number: number; versionIds: string[]; reconstruction?: StageTask; evaluation?: StageTask; revision?: StageTask; progress?: IterationProgress; sourceVerification?: StageTask; sourceRepairs?: string[] }
export interface WorkbenchPipeline {
  iterations?: PipelineIteration[]; activeTaskId?: string; initialVersionIds?: string[];
  pipelineId: string; materialIds: string[]; environmentDigest: string; contractVersion: string; inputDigest: string;
  status: StageStatus; reasonCode: string | null; cancelRequested: boolean; resumeRequested: boolean;
  children: Partial<Record<WorkbenchStage, StageTask>>; completed: WorkbenchStage[];
  currentStage: WorkbenchStage; createdAt: string; updatedAt: string;
}
export function createPipeline(input: StageInput, now: string, environmentDigest: string, materialIds: string[] = [], initialVersionIds?: string[]): WorkbenchPipeline {
  if (!Array.isArray(materialIds) || materialIds.length > 32 || materialIds.some((id) => typeof id !== 'string' || !id) || new Set(materialIds).size !== materialIds.length) throw new Error('PIPELINE_INPUT_INVALID');
  if (initialVersionIds && (!initialVersionIds.length || initialVersionIds.some(id => typeof id !== 'string' || !id) || new Set(initialVersionIds).size !== initialVersionIds.length)) throw new Error('PIPELINE_CARD_SELECTION_INVALID');
  const selectedVersions = initialVersionIds ? [...initialVersionIds].sort() : null;
  const selectedMaterials = [...materialIds].sort();
  if (typeof environmentDigest !== 'string' || !environmentDigest || environmentDigest.length > 1024 || input.stage !== 'GENERATE') throw new Error('PIPELINE_INPUT_INVALID');
  const child = createStageTask(input, {}, now);
  const digest = sha256(canonicalJson({ contract: PIPELINE_CONTRACT, generation: child.inputDigest, environmentDigest, materialIds: selectedMaterials, initialVersionIds: selectedVersions }));
  return { ...(selectedVersions ? { initialVersionIds: selectedVersions } : {}), materialIds: selectedMaterials, pipelineId: `pipeline-${digest}`, environmentDigest, contractVersion: PIPELINE_CONTRACT, inputDigest: digest,
    iterations: [], status: 'PENDING', reasonCode: null, cancelRequested: false, resumeRequested: false, children: { GENERATE: child }, completed: [], currentStage: 'GENERATE', createdAt: now, updatedAt: now };
}
export function pipelineStageFailure(task: StageTask): string | null {
  if (task.status !== 'SUCCEEDED') return task.reasonCode ?? `STAGE_${task.status}`;
  const summary = task.result?.summary;
  if (!summary) return 'PIPELINE_RESULT_MISSING';
  if (task.input.stage === 'GENERATE' && (!Array.isArray(summary.cards) || !summary.cards.length)) return 'PIPELINE_CARDS_MISSING';
  if (task.input.stage === 'INDEX' && Number(summary.failed ?? 0) > 0) return 'PIPELINE_INDEX_FAILED';
  if (task.input.stage === 'FLYWHEEL' || task.input.stage === 'EVALUATE') {
    const modules = summary.modules as unknown as Array<{ interfaceComparison?: { compatible?: boolean }; interfaceCompatible?: boolean; status?: string }>;
    if (!Array.isArray(modules) || !modules.length) return 'PIPELINE_RESULT_MISSING';
    if (task.input.stage === 'FLYWHEEL' && modules.some((item) => item.interfaceComparison?.compatible !== true)) return 'PIPELINE_INTERFACE_MISMATCH';
    if (task.input.stage === 'EVALUATE' && (!Number.isInteger(summary.requestedModules) || Number(summary.requestedModules) < 1 || summary.completedModules !== summary.requestedModules || modules.length !== summary.requestedModules || modules.some((item) => item.status !== 'BEHAVIOR_PASSED' || item.interfaceCompatible !== true))) return 'PIPELINE_BEHAVIOR_FAILED';
  }
  return null;
}

/** 新增通过用例或文本变化不能掩盖旧失败；仅严格缩小失败集合算改进。 */
export function pipelineStagnant(iterations: PipelineIteration[]): boolean {
  let unchanged = 0;
  const lastPassed = iterations.findLastIndex(item => item.progress?.failed.length === 0);
  const progress = iterations.slice(lastPassed + 1).flatMap(item => item.progress ? [item.progress] : []);
  let best = new Set(progress[0]?.failed ?? []);
  for (const item of progress.slice(1)) {
    const after = new Set(item.failed);
    if (after.size < best.size && [...after].every(key => best.has(key))) { best = after; unchanged = 0; }
    else unchanged++;
  }
  return unchanged >= 3;
}
export function pipelineRevisionFailure(task: StageTask): string | null {
  if (task.status !== 'SUCCEEDED') return task.reasonCode ?? `STAGE_${task.status}`;
  const outcome = task.result?.summary.outcome;
  return outcome === 'REVISED_INDEXED' || outcome === 'NO_REVISION' ? null
    : outcome === 'QUALITY_REJECTED' ? 'PIPELINE_REVISION_QUALITY_REJECTED' : 'PIPELINE_REVISION_UNRESOLVED';
}

/** 完整来源覆盖是独立门禁，不能用任务执行成功替代逐卡结论。 */
export function pipelineSourceFailure(task: StageTask): string | null {
  if (task.status !== 'SUCCEEDED') return task.reasonCode ?? `STAGE_${task.status}`;
  const summary = task.result?.summary;
  if (!summary || task.input.stage !== 'EVALUATE' || task.input.parameters.operation !== 'KNOWLEDGE_SOURCE_VERIFICATION'
    || task.input.parameters.verificationContract !== SOURCE_VERIFICATION_CONTRACT || summary.publicationVerified !== false
    || summary.evaluationTaskId !== task.input.parameters.evaluationTaskId || summary.snapshotId !== task.input.parameters.snapshotId
    || !Array.isArray(summary.cards)) return 'PIPELINE_SOURCE_RESULT_INVALID';
  const cards = summary.cards as unknown as SourceCardResult[];
  if (cards.some(card => !card || typeof card !== 'object')) return 'PIPELINE_SOURCE_RESULT_INVALID';
  if (canonicalJson(cards.map(card => card.versionId).sort()) !== canonicalJson([...task.input.cardVersionIds].sort())) return 'PIPELINE_SOURCE_RESULT_INVALID';
  try {
    const outcome = sourceVerificationOutcome(cards, cards);
    if (outcome !== summary.outcome) return 'PIPELINE_SOURCE_RESULT_INVALID';
    return outcome === 'SOURCE_MATCHED' ? null : outcome === 'SOURCE_MISMATCH' ? 'PIPELINE_SOURCE_MISMATCH' : 'PIPELINE_SOURCE_UNRESOLVED';
  } catch { return 'PIPELINE_SOURCE_RESULT_INVALID'; }
}
/** 仅记录真正保存且通过源码复核的章节；新正文摘要不能重置进展。 */
export function pipelineSourceRepairs(task: StageTask): string[] {
  const cards = task.result?.summary.cards;
  if (task.input.parameters.operation !== 'KNOWLEDGE_SOURCE_REVISION' || task.input.parameters.revisionContract !== SOURCE_REVISION_CONTRACT || pipelineRevisionFailure(task) || !Array.isArray(cards)) throw new Error('PIPELINE_SOURCE_REPAIR_INVALID');
  return [...new Set(cards.flatMap(value => {
    const card = value as { cardId?: string; heading?: string; quality?: string; outcome?: string; versionId?: string };
    if (!card || typeof card !== 'object') throw new Error('PIPELINE_SOURCE_REPAIR_INVALID');
    return card.quality === 'ACCEPTED' && card.outcome === 'REVISED' && card.versionId && card.cardId && card.heading ? [canonicalJson([card.cardId, card.heading])] : [];
  }))].sort();
}
export function pipelineSourceStagnant(iterations: PipelineIteration[]): boolean {
  const seen = new Set<string>(); let unchanged = 0;
  for (const round of iterations) {
    if (!round.sourceRepairs) continue;
    if (round.sourceRepairs.some(key => !seen.has(key))) unchanged = 0; else unchanged++;
    for (const key of round.sourceRepairs) seen.add(key);
  }
  return unchanged >= 3;
}
