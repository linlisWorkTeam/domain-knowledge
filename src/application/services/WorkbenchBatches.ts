/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：将固定模块批次交给五阶段执行器，保留轮次身份与恢复记录。
 */
import { createProjectSnapshot } from '../../domain/workbench/WorkbenchProject.ts';
import { batchSchedule, nextBatchRun, type WorkbenchBatch } from '../../domain/workbench/WorkbenchBatch.ts';
import type { WorkbenchBatchStore } from '../ports/WorkbenchBatchPorts.ts';
import type { WorkbenchProjectStore } from '../ports/WorkbenchProjectPorts.ts';
import type { WorkbenchPipelines } from './WorkbenchPipelines.ts';
export class WorkbenchBatches {
  readonly store: WorkbenchBatchStore;
  private readonly projects: WorkbenchProjectStore;
  private readonly pipelines: Pick<WorkbenchPipelines, 'start' | 'get' | 'resume' | 'cancel' | 'wait'>;
  private readonly clock: () => string;
  private readonly pending = new Map<string, Promise<void>>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private closing = false;
  lastError: string | null = null;
  constructor(input: { store: WorkbenchBatchStore; projects: WorkbenchProjectStore; pipelines: WorkbenchBatches['pipelines']; clock?: () => string }) {
    this.store = input.store; this.projects = input.projects; this.pipelines = input.pipelines; this.clock = input.clock ?? (() => new Date().toISOString());
  }
  create(input: { snapshotId: string; moduleId: string; schedule: unknown }, commandId: string) {
    const project = this.projects.get(input.snapshotId); if (!project) throw new Error('PROJECT_INPUT_NOT_FOUND');
    const module = project.modules.find(item => item.moduleId === input.moduleId); if (!module) throw new Error('PROJECT_MODULES_INVALID');
    const { schemaVersion: _schema, projectId: _projectId, snapshotId: _snapshotId, createdAt: _created, moduleBuilds: _moduleBuilds, ...source } = project;
    const selected = this.projects.save(createProjectSnapshot({ ...source, modules: [module],
      ...(project.moduleDefinitions ? { moduleDefinitions: project.moduleDefinitions.filter(item => item.moduleId === module.moduleId) } : {}),
      ...(project.moduleBuilds && Object.hasOwn(project.moduleBuilds, module.moduleId) ? { moduleBuilds: { [module.moduleId]: project.moduleBuilds[module.moduleId] } } : {}),
      sourceFiles: project.sourceFiles.filter(file => file.kind === 'build' || module.sourcePaths.includes(file.path)),
    }, this.clock()));
    const batch = this.store.create({ projectId: selected.projectId, snapshotId: selected.snapshotId, moduleId: module.moduleId, schedule: batchSchedule(input.schedule) }, commandId, this.clock());
    this.tick(); return batch;
  }
  enqueue(id: string, commandId?: string) { const batch = this.store.enqueue(id, this.clock(), commandId); this.tick(); return batch; }
  resume(id: string, commandId?: string) { const batch = this.store.resume(id, this.clock(), commandId); this.tick(); return batch; }
  cancel(id: string, commandId?: string) {
    const batch = this.store.cancel(id, this.clock(), commandId); const pipelineId = batch.rounds.at(-1)?.pipelineId;
    if (pipelineId && batch.cancelRequested && batch.status === 'RUNNING') this.pipelines.cancel(pipelineId);
    return batch;
  }
  start() {
    if (this.timer || this.closing) return;
    this.store.recover(this.clock()); this.tick();
    this.timer = setInterval(() => this.tick(), 1000); this.timer.unref();
  }
  tick() {
    if (this.closing) return;
    try {
      const now = this.clock(); this.store.recover(now);
      for (let batch of this.store.list().reverse()) {
        if (this.pending.has(batch.batchId)) continue;
        // 失败或质量暂停需要处理，不以自动频率创建新轮来绕过失败及用量记录。
        if (batch.schedule.enabled && ['READY', 'SUCCEEDED'].includes(batch.status) && batch.nextRunAt && batch.nextRunAt <= now) batch = this.store.enqueue(batch.batchId, now);
        if (batch.status !== 'QUEUED') continue;
        const lease = this.store.claim(batch.batchId, now); if (!lease) continue;
        const promise = this.run(lease.batch, lease.leaseId).finally(() => this.pending.delete(batch.batchId));
        this.pending.set(batch.batchId, promise);
        void promise.catch(() => { this.lastError = 'BATCH_PERSISTENCE_FAILED'; });
      }
    } catch { this.lastError = 'BATCH_SCHEDULER_UNAVAILABLE'; }
  }
  private async run(batch: WorkbenchBatch, leaseId: string) {
    const round = batch.rounds.at(-1)!;
    let monitor: ReturnType<typeof setInterval> | null = null;
    try {
      if (batch.cancelRequested) throw new Error('BATCH_CANCELLED');
      let pipeline = round.pipelineId ? this.pipelines.get(round.pipelineId) : await this.pipelines.start(batch.snapshotId, {}, [], [], round.executionKey);
      round.pipelineId = pipeline.pipelineId; this.store.save(batch, leaseId, false);
      if (['PAUSED', 'FAILED', 'CANCELLED'].includes(pipeline.status) && (round.resumeRequested || ['PIPELINE_PROCESS_EXITED', 'PIPELINE_SHUTDOWN'].includes(pipeline.reasonCode ?? ''))) pipeline = this.pipelines.resume(pipeline.pipelineId, pipeline.inputDigest);
      round.resumeRequested = false; this.store.save(batch, leaseId, false);
      if (this.store.get(batch.batchId)?.cancelRequested) this.pipelines.cancel(pipeline.pipelineId);
      monitor = setInterval(() => {
        try { if (this.store.get(batch.batchId)?.cancelRequested) this.pipelines.cancel(pipeline.pipelineId); }
        catch { this.lastError = 'BATCH_CANCEL_FAILED'; }
      }, 250);
      const result = await this.pipelines.wait(pipeline.pipelineId);
      round.status = result.status === 'SUCCEEDED' ? 'SUCCEEDED' : result.status === 'CANCELLED' ? 'CANCELLED' : result.status === 'FAILED' ? 'FAILED' : 'PAUSED';
      round.reasonCode = result.reasonCode; batch.status = round.status;
    } catch (error) {
      const code = error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : 'BATCH_EXECUTION_FAILED';
      round.status = code === 'BATCH_CANCELLED' ? 'CANCELLED' : 'PAUSED'; round.reasonCode = code; batch.status = round.status;
    } finally {
      if (monitor) clearInterval(monitor);
      round.completedAt = this.clock(); batch.updatedAt = round.completedAt;
      batch.nextRunAt = batch.status === 'SUCCEEDED' ? nextBatchRun(batch.schedule, batch.updatedAt) : null;
      this.store.save(batch, leaseId, true);
    }
  }
  stop() { this.closing = true; if (this.timer) clearInterval(this.timer); this.timer = null; }
  get idle() { return this.pending.size === 0; }
  async shutdown() { this.stop(); await Promise.allSettled(this.pending.values()); }
}
