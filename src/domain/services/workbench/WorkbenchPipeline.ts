/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义五阶段协调记录和确定性推进条件。
 */
import { assertPublicationRecord, type PublicationRecord } from './WorkbenchPublicationRecord.ts';
import { SOURCE_VERIFICATION_CONTRACT, sourceVerificationOutcome, type SourceCardResult } from '../knowledge/KnowledgeSourceVerification.ts';
import { SOURCE_REVISION_CONTRACT, SOURCE_CORRECTION_POLICY, sourceCorrectionCandidates } from '../knowledge/SourceRevision.ts';
import { sha256, type ArtifactRef } from '../../Domain.ts';
import { FIXED_EVALUATION_CONTRACT } from '../evaluation/NativeFixedEvaluation.ts';
import { canonicalJson, createStageTask, type StageInput, type StageTask, type StageStatus, type WorkbenchStage } from './StageTask.ts';
export const PIPELINE_CONTRACT = 'knowledge-pipeline-v17';
export interface IterationProgress { failed: string[]; total: number; passed: number }
export interface PipelineIteration { number: number; versionIds: string[]; reconstruction?: StageTask; evaluation?: StageTask; fixedEvaluation?: StageTask; revision?: StageTask; progress?: IterationProgress; sourceVerification?: StageTask; sourceRepairs?: string[]; unknownSections?: string[]; supplementSourceTaskId?: string }
export interface PipelineFixedSuite { moduleId: string; suiteRef: ArtifactRef }
export interface WorkbenchPipeline {
  publicationId?: string;
  fixedSuites?: PipelineFixedSuite[];
  iterations?: PipelineIteration[]; activeTaskId?: string; initialVersionIds?: string[];
  pipelineId: string; materialIds: string[]; environmentDigest: string; contractVersion: string; inputDigest: string;
  status: StageStatus; reasonCode: string | null; cancelRequested: boolean; resumeRequested: boolean;
  children: Partial<Record<WorkbenchStage, StageTask>>; completed: WorkbenchStage[];
  currentStage: WorkbenchStage; createdAt: string; updatedAt: string;
}
export function createPipeline(input: StageInput, now: string, environmentDigest: string, materialIds: string[] = [], initialVersionIds?: string[], fixedSuites: PipelineFixedSuite[] = []): WorkbenchPipeline {
  if (!Array.isArray(fixedSuites) || fixedSuites.length > 200 || fixedSuites.some(item => !item || typeof item.moduleId !== 'string' || !item.moduleId || !/^[a-f0-9]{64}$/.test(item.suiteRef?.sha256 ?? '')) || new Set(fixedSuites.map(item => item.moduleId)).size !== fixedSuites.length) throw new Error('PIPELINE_FIXED_INPUT_INVALID');
  const selectedFixed = [...fixedSuites].sort((a, b) => a.moduleId.localeCompare(b.moduleId));
  if (!Array.isArray(materialIds) || materialIds.length > 32 || materialIds.some((id) => typeof id !== 'string' || !id) || new Set(materialIds).size !== materialIds.length) throw new Error('PIPELINE_INPUT_INVALID');
  if (initialVersionIds && (!initialVersionIds.length || initialVersionIds.some(id => typeof id !== 'string' || !id) || new Set(initialVersionIds).size !== initialVersionIds.length)) throw new Error('PIPELINE_CARD_SELECTION_INVALID');
  const selectedVersions = initialVersionIds ? [...initialVersionIds].sort() : null;
  const selectedMaterials = [...materialIds].sort();
  if (typeof environmentDigest !== 'string' || !environmentDigest || environmentDigest.length > 1024 || input.stage !== 'GENERATE') throw new Error('PIPELINE_INPUT_INVALID');
  const child = createStageTask(input, {}, now);
  const digest = sha256(canonicalJson({ contract: PIPELINE_CONTRACT, generation: child.inputDigest, environmentDigest, materialIds: selectedMaterials, initialVersionIds: selectedVersions, fixedSuites: selectedFixed }));
  return { ...(selectedVersions ? { initialVersionIds: selectedVersions } : {}), fixedSuites: selectedFixed, materialIds: selectedMaterials, pipelineId: `pipeline-${digest}`, environmentDigest, contractVersion: PIPELINE_CONTRACT, inputDigest: digest,
    iterations: [], status: 'PENDING', reasonCode: null, cancelRequested: false, resumeRequested: false, children: { GENERATE: child }, completed: [], currentStage: 'GENERATE', createdAt: now, updatedAt: now };
}

export function pipelineFixedFailure(task: StageTask, reconstructionTaskId: string): string | null {
  if (task.status !== 'SUCCEEDED') return task.reasonCode ?? `STAGE_${task.status}`;
  const summary = task.result?.summary;
  if (task.input.stage !== 'EVALUATE' || task.input.parameters.operation !== 'FIXED_NATIVE_EVALUATION'
    || task.input.parameters.fixedEvaluationContract !== FIXED_EVALUATION_CONTRACT || task.input.parameters.reconstructionTaskId !== reconstructionTaskId
    || summary?.reconstructionTaskId !== reconstructionTaskId || summary.publicationVerified !== false
    || !Array.isArray(summary.modules) || !summary.modules.length) return 'PIPELINE_FIXED_RESULT_INVALID';
  const modules = summary.modules as Array<{ moduleId: string; status: string; referencePassed: boolean; interfaceCompatible: boolean; passed: number; total: number }>;
  if (modules.some(module => !module || typeof module.moduleId !== 'string') || new Set(modules.map(module => module.moduleId)).size !== modules.length) return 'PIPELINE_FIXED_RESULT_INVALID';
  const suites = task.input.parameters.suiteRefs;
  if (!suites || Array.isArray(suites) || typeof suites !== 'object' || Object.keys(suites).length !== modules.length || modules.some(module => !Object.hasOwn(suites, module.moduleId))) return 'PIPELINE_FIXED_RESULT_INVALID';
  return modules.every(module => module.status === 'FIXED_PASSED' && module.referencePassed === true && module.interfaceCompatible === true
    && Number.isSafeInteger(module.total) && module.total > 0 && module.passed === module.total) ? null : 'PIPELINE_FIXED_FAILED';
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
/** 可修订不等于来源门禁通过；未知但无明确纠正时停止。 */
export function pipelineSourceRepairable(task: StageTask): boolean {
  const reason = pipelineSourceFailure(task);
  if (reason === 'PIPELINE_SOURCE_MISMATCH') return true;
  if (reason !== 'PIPELINE_SOURCE_UNRESOLVED') return false;
  try { return sourceCorrectionCandidates(task.result!.summary.cards as unknown as Parameters<typeof sourceCorrectionCandidates>[0], SOURCE_CORRECTION_POLICY).length > 0; }
  catch { return false; }
}
/** Only frozen unknown sections can trigger supplementation; malformed findings still stop. */
export function pipelineUnknownSections(task: StageTask): string[] {
  if (pipelineSourceFailure(task) !== 'PIPELINE_SOURCE_UNRESOLVED') return [];
  const cards = task.result!.summary.cards as unknown as Array<SourceCardResult & { sections?: Array<SourceCardResult & { section?: string; unresolved?: string[] }> }>;
  const unknown: string[] = [];
  for (const card of cards) {
    if (!Array.isArray(card.sections) || !card.sections.length) return [];
    const headings = new Set<string>();
    for (const section of card.sections) {
      if (!section || typeof section.section !== 'string' || !section.section || headings.has(section.section)
        || section.cardId !== card.cardId || section.versionId !== card.versionId || section.moduleId !== card.moduleId || section.bodyDigest !== card.bodyDigest) return [];
      headings.add(section.section);
      if (section.outcome === 'UNRESOLVED') {
        if (!section.unresolved?.length) return [];
        unknown.push(`${card.cardId}#${section.section}`);
      }
    }
  }
  return [...new Set(unknown)].sort();
}
export function pipelineSupplementStagnant(iterations: PipelineIteration[]): boolean {
  const history = iterations.flatMap(round => round.unknownSections ? [round.unknownSections] : []);
  let best = new Set(history[0] ?? []), unchanged = 0;
  for (const sections of history.slice(1)) {
    const current = new Set(sections);
    if (current.size < best.size && [...current].every(section => best.has(section))) { best = current; unchanged = 0; }
    else unchanged++;
  }
  return unchanged >= 3;
}
/** 仅允许成功保存并索引的局部修订继续重建；风险仍阻止关联和发布。 */
export function pipelineSourceRevisionFailure(task: StageTask): string | null {
  const reason = pipelineRevisionFailure(task);
  if (reason !== 'PIPELINE_REVISION_UNRESOLVED') return reason;
  const summary = task.result?.summary;
  if (task.status !== 'SUCCEEDED' || task.input.parameters.operation !== 'KNOWLEDGE_SOURCE_REVISION'
    || task.input.parameters.revisionContract !== SOURCE_REVISION_CONTRACT || task.input.parameters.sourceCorrectionPolicy !== SOURCE_CORRECTION_POLICY
    || summary?.outcome !== 'UNRESOLVED' || summary.indexed !== true || summary.sourceVerificationTaskId !== task.input.parameters.sourceVerificationTaskId
    || !Array.isArray(summary.cards) || !summary.cards.length || !Array.isArray(summary.updatedVersionIds) || !Array.isArray(summary.versionIds)) return reason;
  const results = summary.cards as Array<{ baseVersionId: string; versionId?: string; quality?: string; outcome: string; unresolved?: string[] }>;
  if (results.some(card => !card || !task.input.cardVersionIds.includes(card.baseVersionId)) || new Set(results.map(card => card.baseVersionId)).size !== results.length) return reason;
  const cards = results.filter(card => card.outcome === 'REVISED');
  if (!cards.length || results.some(card => card.outcome !== 'REVISED' && (card.outcome !== 'UNRESOLVED' || card.versionId != null || card.quality != null || !card.unresolved?.length))
    || cards.some(card => card.quality !== 'ACCEPTED' || typeof card.versionId !== 'string' || !card.versionId || card.versionId === card.baseVersionId)
    || new Set(summary.versionIds).size !== task.input.cardVersionIds.length
    || canonicalJson([...summary.updatedVersionIds].sort()) !== canonicalJson(cards.map(card => card.versionId).sort())
    || canonicalJson(summary.versionIds) !== canonicalJson(task.input.cardVersionIds.map(id => cards.find(card => card.baseVersionId === id)?.versionId ?? id))) return reason;
  return null;
}
/** 仅记录真正保存且通过源码复核的章节；新正文摘要不能重置进展。 */
export function pipelineSourceRepairs(task: StageTask): string[] {
  const cards = task.result?.summary.cards;
  if (task.input.parameters.operation !== 'KNOWLEDGE_SOURCE_REVISION' || task.input.parameters.revisionContract !== SOURCE_REVISION_CONTRACT || pipelineSourceRevisionFailure(task) || !Array.isArray(cards)) throw new Error('PIPELINE_SOURCE_REPAIR_INVALID');
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

export function assertPipelinePublication(pipeline: WorkbenchPipeline, publication: PublicationRecord): void {
  assertPublicationRecord(publication);
  const round = pipeline.iterations?.at(-1);
  if (pipeline.contractVersion !== PIPELINE_CONTRACT || !pipeline.fixedSuites?.length || !round
    || !round.reconstruction || !round.evaluation || !round.fixedEvaluation || !round.sourceVerification
    || publication.status !== 'COMMITTED' || publication.projectId !== round.reconstruction.input.projectId
    || canonicalJson([...publication.versionIds].sort()) !== canonicalJson([...round.versionIds].sort())
    || (pipeline.publicationId && pipeline.publicationId !== publication.publicationId)) throw new Error('PIPELINE_PUBLICATION_BINDING_INVALID');
}
