/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：通过独立持久化协调记录串联现有五阶段用例。
 */
import { PIPELINE_CONTRACT, createPipeline, pipelineStageFailure, pipelineRevisionFailure, pipelineStagnant, pipelineSourceFailure, pipelineSourceRepairs, pipelineSourceStagnant, type WorkbenchPipeline, type PipelineIteration } from '../../domain/services/workbench/WorkbenchPipeline.ts';
import { WORKBENCH_STAGES, canonicalJson, createStageTask, type StageInput, type StageTask, type WorkbenchStage } from '../../domain/services/workbench/StageTask.ts';
import type { ExternalMaterialStore } from '../ports/ExternalMaterialPorts.ts';
import type { WorkbenchPipelineStore } from '../ports/WorkbenchPipelinePorts.ts';
import type { WorkbenchStages } from './WorkbenchStages.ts';
import type { WorkbenchGeneration, GenerationScope } from './WorkbenchGeneration.ts';
import type { WorkbenchReconstruction } from './WorkbenchReconstruction.ts';
import type { WorkbenchKnowledgeRevision } from './WorkbenchKnowledgeRevision.ts';
import type { WorkbenchSourceVerification } from './WorkbenchSourceVerification.ts';
import type { WorkbenchSourceRevision } from './WorkbenchSourceRevision.ts';
import type { WorkbenchEvaluation } from './WorkbenchEvaluation.ts';
import type { KnowledgeIndexService } from './KnowledgeIndex.ts';
import type { WorkbenchAssociations } from './WorkbenchAssociations.ts';
export class WorkbenchPipelines {
  readonly dependencies: { materials: Pick<ExternalMaterialStore, 'get'>; environment(snapshotId: string, signal?: AbortSignal): Promise<string>; store: WorkbenchPipelineStore; stages: WorkbenchStages; generation: Pick<WorkbenchGeneration, 'prepare'>;
    reconstruction: Pick<WorkbenchReconstruction, 'prepare'>; evaluation: Pick<WorkbenchEvaluation, 'prepare'> & Partial<Pick<WorkbenchEvaluation, 'progress'>>; revision?: Pick<WorkbenchKnowledgeRevision, 'prepare'>; sourceVerification?: Pick<WorkbenchSourceVerification, 'prepare'>; sourceRevision?: Pick<WorkbenchSourceRevision, 'prepare'>; index: Pick<KnowledgeIndexService, 'prepare'> & Partial<Pick<KnowledgeIndexService, 'currentVersions'>>; associations: Pick<WorkbenchAssociations, 'prepare'> };
  private readonly pending = new Map<string, Promise<void>>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly errors = new Map<string, unknown>();
  private closing = false;
  constructor(dependencies: WorkbenchPipelines['dependencies']) { this.dependencies = dependencies; }
  get(id: string) { const value = this.dependencies.store.get(id); if (!value) throw new Error('PIPELINE_NOT_FOUND'); return value; }
  detail(id: string) {
    const pipeline = this.get(id);
    const references = [...WORKBENCH_STAGES.flatMap(stage => pipeline.children[stage] ? [pipeline.children[stage]!] : []),
      ...(pipeline.iterations ?? []).flatMap(round => [round.reconstruction, round.evaluation, round.revision, round.sourceVerification].filter((task): task is StageTask => Boolean(task)))];
    const tasks = [...new Map(references.map(child => [child.taskId, this.dependencies.stages.store.get(child.taskId) ?? child])).values()];
    return { pipeline, tasks, checkpoints: Object.fromEntries(tasks.map((task) => [task.taskId, this.dependencies.stages.store.checkpoints(task.taskId)])), publicationVerified: false,
      usage: tasks.reduce((sum, task) => ({ modelCalls: sum.modelCalls + task.usage.modelCalls, tokens: sum.tokens + task.usage.tokens,
        reservedTokens: sum.reservedTokens + task.usage.reservedTokens, elapsedMs: sum.elapsedMs + task.usage.elapsedMs }), { modelCalls: 0, tokens: 0, reservedTokens: 0, elapsedMs: 0 }) };
  }
  async start(snapshotId: string, scopes: Record<string, GenerationScope> = {}, materialIds: string[] = []) {
    if (!Array.isArray(materialIds) || materialIds.length > 32 || materialIds.some((id) => typeof id !== 'string' || !id) || new Set(materialIds).size !== materialIds.length) throw new Error('PIPELINE_INPUT_INVALID');
    const selectedMaterials = [...materialIds].sort();
    for (const id of selectedMaterials) if (!this.dependencies.materials.get(id)) throw new Error('MATERIAL_NOT_FOUND');
    if (this.closing) throw new Error('PIPELINE_SHUTDOWN');
    const input = await this.dependencies.generation.prepare(snapshotId, scopes);
    const environment = await this.dependencies.environment(snapshotId);
    if (this.closing) throw new Error('PIPELINE_SHUTDOWN');
    const generated = this.dependencies.stages.store.get(createStageTask(input, {}, new Date().toISOString()).taskId);
    let initialVersionIds: string[] | undefined;
    if (generated?.status === 'SUCCEEDED' && this.dependencies.index.currentVersions) {
      const baseIds = (generated.result!.summary.cards as Array<{ versionId: string }>).map(card => card.versionId).sort();
      const selected = this.dependencies.index.currentVersions(snapshotId, baseIds);
      if (JSON.stringify(selected) !== JSON.stringify(baseIds)) initialVersionIds = selected;
    }
    const value = this.dependencies.store.insert(createPipeline(input, new Date().toISOString(), environment, selectedMaterials, initialVersionIds));
    if (value.status === 'PENDING') this.schedule(value.pipelineId, false);
    return value;
  }
  resume(id: string, digest: string) {
    if (this.closing) throw new Error('PIPELINE_SHUTDOWN');
    const value = this.dependencies.store.resume(id, digest); this.schedule(id, true); return value;
  }
  cancel(id: string) {
    const value = this.dependencies.store.cancel(id);
    if (value.cancelRequested) {
      const childId = value.activeTaskId ?? value.children[value.currentStage]?.taskId; const current = childId && this.dependencies.stages.store.get(childId);
      if (current && ['PENDING', 'RUNNING'].includes(current.status)) this.dependencies.stages.cancel(current.taskId);
      this.controllers.get(id)?.abort(new Error('PIPELINE_CANCELLED'));
    }
    return value;
  }
  recover() {
    this.dependencies.store.recover();
    for (const value of this.dependencies.store.list()) if (value.status === 'PENDING' && value.contractVersion === PIPELINE_CONTRACT) this.schedule(value.pipelineId, false);
  }
  private schedule(id: string, resume: boolean) {
    if (this.pending.has(id) || this.closing) return;
    const promise = this.run(id, resume).finally(() => this.pending.delete(id)); this.pending.set(id, promise);
    void promise.catch((error) => this.errors.set(id, error));
  }
  private async nextInput(value: WorkbenchPipeline, stage: WorkbenchStage, signal: AbortSignal): Promise<StageInput> {
    const { stages, index, reconstruction, evaluation, associations } = this.dependencies;
    const generation = stages.get(value.children.GENERATE!.taskId);
    const cards = generation.result!.summary.cards as Array<{ versionId: string }>;
    const versions = value.iterations?.at(-1)?.versionIds ?? value.initialVersionIds ?? cards.map((card) => card.versionId);
    if (stage === 'INDEX') return index.prepare(versions);
    if (stage === 'FLYWHEEL') return reconstruction.prepare(String(generation.input.parameters.snapshotId), versions, { configurationDigest: generation.input.configurationDigest, signal });
    if (stage === 'EVALUATE') return evaluation.prepare(value.children.FLYWHEEL!.taskId);
    if (stage === 'ASSOCIATE') return associations.prepare(versions, value.materialIds);
    throw new Error('PIPELINE_STAGE_INVALID');
  }
  private async run(id: string, resume: boolean) {
    const { store, stages } = this.dependencies;
    const lease = store.claim(id); if (!lease) return;
    const value = lease.value; const controller = new AbortController(); this.controllers.set(id, controller);
    const check = () => { if (store.get(id)?.cancelRequested) controller.abort(new Error('PIPELINE_CANCELLED')); controller.signal.throwIfAborted(); };
    const timer = setInterval(() => { try { check(); } catch (error) { controller.abort(error); } }, 100);
    try {
      const environment = await this.dependencies.environment(String(value.children.GENERATE!.input.parameters.snapshotId), controller.signal);
      if (environment !== value.environmentDigest) throw new Error('PIPELINE_ENVIRONMENT_CHANGED');
      const stop = (task: StageTask, reason: string) => {
        value.status = task.status === 'CANCELLED' ? 'CANCELLED' : task.status === 'FAILED' ? 'FAILED' : 'PAUSED';
        value.reasonCode = reason; store.save(value, lease.leaseId, true);
      };
      const freeze = async (input: StageInput) => {
        check();
        if (await this.dependencies.environment(String(value.children.GENERATE!.input.parameters.snapshotId), controller.signal) !== value.environmentDigest) throw new Error('PIPELINE_ENVIRONMENT_CHANGED');
        check(); return createStageTask(input, {}, new Date().toISOString());
      };
      const execute = async (child: StageTask) => {
        check(); value.activeTaskId = child.taskId; value.currentStage = child.input.stage; store.save(value, lease.leaseId); check();
        let task = stages.store.get(child.taskId) ?? stages.start(child.input, child.limits);
        if (task.inputDigest !== child.inputDigest) throw new Error('PIPELINE_INPUT_CHANGED');
        if ((resume || value.resumeRequested) && ['FAILED', 'PAUSED', 'CANCELLED'].includes(task.status)) task = stages.resume(task.taskId, child.inputDigest);
        task = await stages.wait(task.taskId, controller.signal); check(); return task;
      };
      for (const stage of ['GENERATE', 'INDEX'] as const) {
        if (value.completed.includes(stage)) continue;
        if (!value.children[stage]) { value.children[stage] = await freeze(await this.nextInput(value, stage, controller.signal)); store.save(value, lease.leaseId); }
        const task = await execute(value.children[stage]!); const reason = pipelineStageFailure(task);
        if (reason) { stop(task, reason); return; }
        value.completed.push(stage); store.save(value, lease.leaseId);
      }
      if (!value.iterations) throw new Error('PIPELINE_RECORD_INVALID');
      if (!value.completed.includes('EVALUATE')) {
        const generation = stages.get(value.children.GENERATE!.taskId);
        const snapshotId = String(generation.input.parameters.snapshotId);
        if (!value.iterations.length) { value.iterations.push({ number: 1, versionIds: value.initialVersionIds ?? (generation.result!.summary.cards as Array<{ versionId: string }>).map(card => card.versionId) }); store.save(value, lease.leaseId); }
        for (;;) {
          check(); const round: PipelineIteration = value.iterations.at(-1)!;
          if (!round.reconstruction) {
            this.dependencies.index.prepare(round.versionIds);
            const previous = value.iterations.at(-2);
            round.reconstruction = await freeze(await this.dependencies.reconstruction.prepare(snapshotId, round.versionIds, {
              configurationDigest: generation.input.configurationDigest, signal: controller.signal,
              ...(previous?.evaluation && previous.progress?.failed.length ? { retryEvaluationTaskId: previous.evaluation.taskId } : {}) }));
            value.children.FLYWHEEL = round.reconstruction; store.save(value, lease.leaseId);
          }
          const code = await execute(round.reconstruction); const codeReason = pipelineStageFailure(code);
          if (codeReason) { stop(code, codeReason); return; }
          if (!value.completed.includes('FLYWHEEL')) { value.completed.push('FLYWHEEL'); store.save(value, lease.leaseId); }
          if (!round.evaluation) { round.evaluation = await freeze(await this.dependencies.evaluation.prepare(code.taskId)); value.children.EVALUATE = round.evaluation; store.save(value, lease.leaseId); }
          const evaluated = await execute(round.evaluation); const reason = pipelineStageFailure(evaluated);
          if (evaluated.status === 'SUCCEEDED' && this.dependencies.evaluation.progress && !round.progress) {
            round.progress = await this.dependencies.evaluation.progress(evaluated.taskId); store.save(value, lease.leaseId);
          }
          let prepareRevision: () => Promise<StageInput>; let sourceRepair = false;
          if (!reason) {
            if (!this.dependencies.sourceVerification) throw new Error('PIPELINE_SOURCE_VERIFICATION_REQUIRED');
            if (!round.sourceVerification) {
              const sourceInput = await this.dependencies.sourceVerification.prepare(evaluated.taskId);
              if (canonicalJson([...sourceInput.cardVersionIds].sort()) !== canonicalJson([...round.versionIds].sort())
                || sourceInput.projectId !== evaluated.input.projectId || sourceInput.parameters.snapshotId !== evaluated.input.parameters.snapshotId
                || sourceInput.parameters.evaluationTaskId !== evaluated.taskId || sourceInput.configurationDigest !== evaluated.input.configurationDigest
                || sourceInput.sourceDigest !== evaluated.input.sourceDigest || sourceInput.sourceRevision !== evaluated.input.sourceRevision) throw new Error('PIPELINE_SOURCE_INPUT_CHANGED');
              round.sourceVerification = await freeze(sourceInput); store.save(value, lease.leaseId);
            }
            const verified = await execute(round.sourceVerification); const sourceReason = pipelineSourceFailure(verified);
            if (!sourceReason) { value.completed.push('EVALUATE'); store.save(value, lease.leaseId); break; }
            if (sourceReason !== 'PIPELINE_SOURCE_MISMATCH') { stop(verified, sourceReason); return; }
            if (pipelineSourceStagnant(value.iterations)) { stop(verified, 'PIPELINE_NO_SOURCE_PROGRESS'); return; }
            if (!this.dependencies.sourceRevision) throw new Error('PIPELINE_SOURCE_REVISION_REQUIRED');
            sourceRepair = true; prepareRevision = () => this.dependencies.sourceRevision!.prepare(verified.taskId);
          } else {
            if (reason !== 'PIPELINE_BEHAVIOR_FAILED' || !this.dependencies.revision) { stop(evaluated, reason); return; }
            if (!round.progress) throw new Error('PIPELINE_PROGRESS_UNAVAILABLE');
            if (pipelineStagnant(value.iterations)) { stop(evaluated, 'PIPELINE_NO_BEHAVIOR_PROGRESS'); return; }
            prepareRevision = () => this.dependencies.revision!.prepare(evaluated.taskId);
          }
          if (!round.revision) { round.revision = await freeze(await prepareRevision()); store.save(value, lease.leaseId); }
          const revised = await execute(round.revision); const revisionReason = pipelineRevisionFailure(revised);
          if (revisionReason) { stop(revised, revisionReason); return; }
          if (sourceRepair && !round.sourceRepairs) { round.sourceRepairs = pipelineSourceRepairs(revised); store.save(value, lease.leaseId); }
          const versions = revised.result!.summary.versionIds;
          if (!Array.isArray(versions) || versions.length !== round.versionIds.length || !versions.every(id => typeof id === 'string')) throw new Error('PIPELINE_REVISION_INPUT_INVALID');
          value.iterations.push({ number: round.number + 1, versionIds: versions as string[] }); store.save(value, lease.leaseId);
        }
      }
      if (!value.completed.includes('ASSOCIATE')) {
        if (!value.children.ASSOCIATE) { value.children.ASSOCIATE = await freeze(await this.nextInput(value, 'ASSOCIATE', controller.signal)); store.save(value, lease.leaseId); }
        const task = await execute(value.children.ASSOCIATE); const reason = pipelineStageFailure(task);
        if (reason) { stop(task, reason); return; }
        value.completed.push('ASSOCIATE'); store.save(value, lease.leaseId);
      }
      value.status = 'SUCCEEDED'; value.reasonCode = null; store.save(value, lease.leaseId, true);
    } catch (error) {
      const reason = controller.signal.aborted ? controller.signal.reason : error;
      value.reasonCode = reason instanceof Error ? /^([A-Z][A-Z0-9_]+)(?::|$)/.exec(reason.message)?.[1] ?? 'PIPELINE_EXECUTION_FAILED' : 'PIPELINE_EXECUTION_FAILED';
      if (value.reasonCode === 'PIPELINE_CANCELLED') {
        const childId = value.activeTaskId ?? value.children[value.currentStage]?.taskId; const current = childId && stages.store.get(childId);
        if (current && ['PENDING', 'RUNNING'].includes(current.status)) { stages.cancel(current.taskId); await stages.wait(current.taskId); }
      }
      value.status = value.reasonCode === 'PIPELINE_CANCELLED' ? 'CANCELLED' : 'PAUSED'; store.save(value, lease.leaseId, true);
    } finally { clearInterval(timer); this.controllers.delete(id); }
  }
  async wait(id: string) {
    for (;;) { if (this.errors.has(id)) throw this.errors.get(id); const value = this.get(id);
      if (!['PENDING', 'RUNNING'].includes(value.status)) return value;
      await new Promise((resolve) => setTimeout(resolve, 50)); }
  }
  get idle() { return this.pending.size === 0; }
  async shutdown() {
    this.closing = true; for (const controller of this.controllers.values()) controller.abort(new Error('PIPELINE_SHUTDOWN'));
    await Promise.allSettled(this.pending.values());
  }
}
