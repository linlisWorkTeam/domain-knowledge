/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义五阶段协调记录和确定性推进条件。
 */
import { sha256 } from '../../Domain.ts';
import { canonicalJson, createStageTask, type StageInput, type StageTask, type StageStatus, type WorkbenchStage } from './StageTask.ts';
export const PIPELINE_CONTRACT = 'knowledge-pipeline-v1';
export interface WorkbenchPipeline {
  pipelineId: string; environmentDigest: string; contractVersion: string; inputDigest: string;
  status: StageStatus; reasonCode: string | null; cancelRequested: boolean; resumeRequested: boolean;
  children: Partial<Record<WorkbenchStage, StageTask>>; completed: WorkbenchStage[];
  currentStage: WorkbenchStage; createdAt: string; updatedAt: string;
}
export function createPipeline(input: StageInput, now: string, environmentDigest: string): WorkbenchPipeline {
  if (typeof environmentDigest !== 'string' || !environmentDigest || environmentDigest.length > 1024 || input.stage !== 'GENERATE') throw new Error('PIPELINE_INPUT_INVALID');
  const child = createStageTask(input, {}, now);
  const digest = sha256(canonicalJson({ contract: PIPELINE_CONTRACT, generation: child.inputDigest, environmentDigest }));
  return { pipelineId: `pipeline-${digest}`, environmentDigest, contractVersion: PIPELINE_CONTRACT, inputDigest: digest,
    status: 'PENDING', reasonCode: null, cancelRequested: false, resumeRequested: false, children: { GENERATE: child }, completed: [], currentStage: 'GENERATE', createdAt: now, updatedAt: now };
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
