/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：通过独立持久化协调记录串联现有五阶段用例。
 */
import { PIPELINE_CONTRACT, createPipeline, pipelineStageFailure, type WorkbenchPipeline } from '../../domain/services/workbench/WorkbenchPipeline.ts';
import { WORKBENCH_STAGES, createStageTask, type StageInput, type StageTask, type WorkbenchStage } from '../../domain/services/workbench/StageTask.ts';
import type { WorkbenchPipelineStore } from '../ports/WorkbenchPipelinePorts.ts';
import type { WorkbenchStages } from './WorkbenchStages.ts';
import type { WorkbenchGeneration, GenerationScope } from './WorkbenchGeneration.ts';
import type { WorkbenchReconstruction } from './WorkbenchReconstruction.ts';
import type { WorkbenchEvaluation } from './WorkbenchEvaluation.ts';
import type { KnowledgeIndexService } from './KnowledgeIndex.ts';
import type { WorkbenchAssociations } from './WorkbenchAssociations.ts';
export class WorkbenchPipelines {
  readonly dependencies: { environment(snapshotId: string, signal?: AbortSignal): Promise<string>; store: WorkbenchPipelineStore; stages: WorkbenchStages; generation: Pick<WorkbenchGeneration, 'prepare'>;
    reconstruction: Pick<WorkbenchReconstruction, 'prepare'>; evaluation: Pick<WorkbenchEvaluation, 'prepare'>; index: Pick<KnowledgeIndexService, 'prepare'>; associations: Pick<WorkbenchAssociations, 'prepare'> };
  private readonly pending = new Map<string, Promise<void>>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly errors = new Map<string, unknown>();
  private closing = false;
  constructor(dependencies: WorkbenchPipelines['dependencies']) { this.dependencies = dependencies; }
  get(id: string) { const value = this.dependencies.store.get(id); if (!value) throw new Error('PIPELINE_NOT_FOUND'); return value; }
  detail(id: string) {
    const pipeline = this.get(id);
    const tasks = WORKBENCH_STAGES.flatMap((stage) => {
      const child = pipeline.children[stage]; return child ? [this.dependencies.stages.store.get(child.taskId) ?? child] : [];
    });
    return { pipeline, tasks, checkpoints: Object.fromEntries(tasks.map((task) => [task.taskId, this.dependencies.stages.store.checkpoints(task.taskId)])), publicationVerified: false,
      usage: tasks.reduce((sum, task) => ({ modelCalls: sum.modelCalls + task.usage.modelCalls, tokens: sum.tokens + task.usage.tokens,
        reservedTokens: sum.reservedTokens + task.usage.reservedTokens, elapsedMs: sum.elapsedMs + task.usage.elapsedMs }), { modelCalls: 0, tokens: 0, reservedTokens: 0, elapsedMs: 0 }) };
  }
  async start(snapshotId: string, scopes: Record<string, GenerationScope> = {}) {
    if (this.closing) throw new Error('PIPELINE_SHUTDOWN');
    const input = await this.dependencies.generation.prepare(snapshotId, scopes);
    const environment = await this.dependencies.environment(snapshotId);
    if (this.closing) throw new Error('PIPELINE_SHUTDOWN');
    const value = this.dependencies.store.insert(createPipeline(input, new Date().toISOString(), environment));
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
      const child = value.children[value.currentStage]; const current = child && this.dependencies.stages.store.get(child.taskId);
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
    const versions = cards.map((card) => card.versionId);
    if (stage === 'INDEX') return index.prepare(versions);
    if (stage === 'FLYWHEEL') return reconstruction.prepare(String(generation.input.parameters.snapshotId), versions, { configurationDigest: generation.input.configurationDigest, signal });
    if (stage === 'EVALUATE') return evaluation.prepare(value.children.FLYWHEEL!.taskId);
    if (stage === 'ASSOCIATE') return associations.prepare(versions);
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
      for (const stage of WORKBENCH_STAGES) {
        if (value.completed.includes(stage)) continue;
        check(); value.currentStage = stage; store.save(value, lease.leaseId);
        let child = value.children[stage];
        if (!child) {
          if (await this.dependencies.environment(String(value.children.GENERATE!.input.parameters.snapshotId), controller.signal) !== value.environmentDigest) throw new Error('PIPELINE_ENVIRONMENT_CHANGED');
          const input = await this.nextInput(value, stage, controller.signal); check();
          if (input.stage !== stage) throw new Error('PIPELINE_STAGE_INVALID');
          child = createStageTask(input, {}, new Date().toISOString()); value.children[stage] = child; store.save(value, lease.leaseId);
        }
        check();
        if (child.input.stage !== stage) throw new Error('PIPELINE_STAGE_INVALID');
        let task = stages.store.get(child.taskId) ?? stages.start(child.input, child.limits);
        if (task.inputDigest !== child.inputDigest) throw new Error('PIPELINE_INPUT_CHANGED');
        if ((resume || value.resumeRequested) && ['FAILED', 'PAUSED', 'CANCELLED'].includes(task.status)) task = stages.resume(task.taskId, child.inputDigest);
        task = await stages.wait(task.taskId, controller.signal); check();
        const reason = pipelineStageFailure(task);
        if (reason) { value.status = task.status === 'CANCELLED' ? 'CANCELLED' : task.status === 'FAILED' ? 'FAILED' : 'PAUSED'; value.reasonCode = reason; store.save(value, lease.leaseId, true); return; }
        value.completed.push(stage); store.save(value, lease.leaseId);
      }
      value.status = 'SUCCEEDED'; value.reasonCode = null; store.save(value, lease.leaseId, true);
    } catch (error) {
      const reason = controller.signal.aborted ? controller.signal.reason : error;
      value.reasonCode = reason instanceof Error ? /^([A-Z][A-Z0-9_]+)(?::|$)/.exec(reason.message)?.[1] ?? 'PIPELINE_EXECUTION_FAILED' : 'PIPELINE_EXECUTION_FAILED';
      if (value.reasonCode === 'PIPELINE_CANCELLED') {
        const child = value.children[value.currentStage]; const current = child && stages.store.get(child.taskId);
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
