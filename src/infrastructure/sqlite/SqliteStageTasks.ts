/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：以 SQLite 事务持久化五阶段任务、累计预算和可恢复子步骤。
 */
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { StageTaskStore } from '../../application/ports/StageTaskPorts.ts';
import {
  STAGE_CONTRACT, assertStageBudget, assertStageResumable, canonicalJson,
  type JsonValue, type StageCheckpoint, type StageEvent, type StageResult, type StageTask, type StageUsage,
} from '../../domain/workbench/StageTask.ts';
import { checkpointOwner, checkpointOwnerExited } from './CheckpointOwner.ts';

/** 原子状态迁移及全库单执行槽；不会依据过期时间抢占仍活着的进程。 */
export class SqliteStageTasks implements StageTaskStore {
  private readonly db: DatabaseSync;
  private readonly clock: () => string;
  constructor(filename: string, clock = () => new Date().toISOString()) {
    mkdirSync(dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.clock = clock;
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS wb_stage_tasks (
        task_id TEXT PRIMARY KEY, status TEXT NOT NULL, lease_id TEXT, owner TEXT, snapshot TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS wb_stage_single_lease ON wb_stage_tasks((1)) WHERE lease_id IS NOT NULL;
      DROP INDEX IF EXISTS wb_stage_single_running;
      CREATE TABLE IF NOT EXISTS wb_stage_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, kind TEXT NOT NULL,
        detail TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS wb_stage_event_task ON wb_stage_events(task_id, sequence);
      CREATE TABLE IF NOT EXISTS wb_stage_checkpoints (
        task_id TEXT NOT NULL, step_key TEXT NOT NULL, snapshot TEXT NOT NULL, PRIMARY KEY(task_id, step_key)
      );
      CREATE TABLE IF NOT EXISTS wb_stage_usage (
        task_id TEXT NOT NULL, operation_id TEXT NOT NULL, delta TEXT NOT NULL, PRIMARY KEY(task_id, operation_id)
      );`);
  }
  private transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = work(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  private required(taskId: string): StageTask {
    const task = this.get(taskId);
    if (!task) throw new Error('STAGE_TASK_NOT_FOUND');
    return task;
  }
  private assertLease(taskId: string, leaseId: string): StageTask {
    const row = this.db.prepare('SELECT lease_id, snapshot FROM wb_stage_tasks WHERE task_id=?').get(taskId);
    if (!row || row.lease_id !== leaseId) throw new Error('STAGE_LEASE_LOST');
    const task = JSON.parse(String(row.snapshot)) as StageTask;
    if (task.status !== 'RUNNING') throw new Error('STAGE_LEASE_LOST');
    return task;
  }
  private save(task: StageTask): void {
    task.revision += 1;
    task.updatedAt = this.clock();
    this.db.prepare('UPDATE wb_stage_tasks SET status=?, snapshot=? WHERE task_id=?')
      .run(task.status, canonicalJson(task), task.taskId);
  }
  private append(taskId: string, kind: string, detail: JsonValue): void {
    this.db.prepare('INSERT INTO wb_stage_events(task_id,kind,detail,created_at) VALUES(?,?,?,?)')
      .run(taskId, kind, canonicalJson(detail), this.clock());
  }
  /** 重复创建只返回原始快照，不覆盖状态、预算或原始创建时间。 */
  insert(task: StageTask): StageTask {
    return this.transaction(() => {
      const previous = this.get(task.taskId);
      if (previous) {
        if (previous.inputDigest !== task.inputDigest) throw new Error('STAGE_IDEMPOTENCY_CONFLICT');
        return previous;
      }
      this.db.prepare('INSERT INTO wb_stage_tasks(task_id,status,snapshot) VALUES(?,?,?)')
        .run(task.taskId, task.status, canonicalJson(task));
      this.append(task.taskId, 'CREATED', { inputDigest: task.inputDigest, contractVersion: task.contractVersion });
      return this.required(task.taskId);
    });
  }
  get(taskId: string): StageTask | null {
    const row = this.db.prepare('SELECT snapshot FROM wb_stage_tasks WHERE task_id=?').get(taskId);
    return row ? JSON.parse(String(row.snapshot)) as StageTask : null;
  }
  list(projectId?: string): StageTask[] {
    return this.db.prepare('SELECT snapshot FROM wb_stage_tasks ORDER BY rowid DESC').all()
      .map((row) => JSON.parse(String(row.snapshot)) as StageTask)
      .filter((task) => !projectId || task.input.projectId === projectId);
  }
  claim(taskId: string): { task: StageTask; leaseId: string } | null {
    this.recoverOrphans();
    return this.transaction(() => {
      const task = this.required(taskId);
      if (task.contractVersion !== STAGE_CONTRACT) throw new Error('STAGE_CONTRACT_INCOMPATIBLE');
      if (task.status !== 'PENDING') return null;
      if (this.db.prepare("SELECT task_id FROM wb_stage_tasks WHERE lease_id IS NOT NULL").get()) return null;
      assertStageBudget(task, {});
      const owner = checkpointOwner();
      if (!owner) throw new Error('STAGE_OWNER_UNAVAILABLE');
      const leaseId = randomUUID();
      task.status = 'RUNNING'; task.attempt += 1; task.reasonCode = null;
      this.save(task);
      this.db.prepare('UPDATE wb_stage_tasks SET lease_id=?, owner=? WHERE task_id=?')
        .run(leaseId, JSON.stringify(owner), taskId);
      this.append(taskId, 'STARTED', { attempt: task.attempt });
      return { task, leaseId };
    });
  }
  resume(taskId: string, expectedInputDigest: string): StageTask {
    return this.transaction(() => {
      const task = this.required(taskId);
      assertStageResumable(task, expectedInputDigest);
      task.status = 'PENDING'; task.cancelRequested = false; task.reasonCode = null;
      this.save(task); this.append(taskId, 'RESUMED', { attempt: task.attempt, inputDigest: task.inputDigest });
      return task;
    });
  }
  cancel(taskId: string): StageTask {
    return this.transaction(() => {
      const task = this.required(taskId);
      if (!['PENDING', 'RUNNING'].includes(task.status) || task.cancelRequested) return task;
      task.cancelRequested = true;
      if (task.status === 'PENDING') { task.status = 'CANCELLED'; task.reasonCode = 'STAGE_CANCELLED'; }
      this.save(task); this.append(taskId, 'CANCEL_REQUESTED', {});
      return task;
    });
  }
  pausePending(taskId: string, reasonCode: string): StageTask {
    return this.transaction(() => {
      const task = this.required(taskId);
      if (task.contractVersion !== STAGE_CONTRACT) throw new Error('STAGE_CONTRACT_INCOMPATIBLE');
      if (task.status !== 'PENDING') return task;
      task.status = 'PAUSED'; task.reasonCode = reasonCode;
      this.save(task); this.append(taskId, 'PAUSED', { reasonCode });
      return task;
    });
  }
  finish(taskId: string, leaseId: string, status: 'SUCCEEDED' | 'FAILED' | 'PAUSED' | 'CANCELLED', result: StageResult | null, reasonCode: string | null): StageTask {
    return this.transaction(() => {
      const task = this.assertLease(taskId, leaseId);
      if (status === 'SUCCEEDED' && !result) throw new Error('STAGE_RESULT_REQUIRED');
      task.status = task.cancelRequested ? 'CANCELLED' : status;
      task.result = task.status === 'SUCCEEDED' ? result : null;
      task.reasonCode = task.cancelRequested ? 'STAGE_CANCELLED' : reasonCode;
      this.save(task);
      this.db.prepare('UPDATE wb_stage_tasks SET lease_id=NULL,owner=NULL WHERE task_id=?').run(taskId);
      this.append(taskId, task.status, { reasonCode: task.reasonCode });
      return task;
    });
  }
  /** 调用前预留以 operationId 幂等；真实重试必须使用新的 attempt/operation 身份。 */
  addUsage(taskId: string, leaseId: string, operationId: string, delta: Partial<StageUsage>): StageTask {
    return this.transaction(() => {
      const task = this.assertLease(taskId, leaseId);
      if (!operationId || operationId.length > 1024) throw new Error('STAGE_USAGE_INVALID');
      const encoded = canonicalJson(delta);
      const previous = this.db.prepare('SELECT delta FROM wb_stage_usage WHERE task_id=? AND operation_id=?').get(taskId, operationId);
      if (previous) {
        if (previous.delta !== encoded) throw new Error('STAGE_USAGE_CONFLICT');
        return task;
      }
      assertStageBudget(task, delta);
      for (const key of Object.keys(delta) as (keyof StageUsage)[]) {
        if (!Number.isSafeInteger(task.usage[key] + delta[key]!)) throw new Error('STAGE_USAGE_INVALID');
        task.usage[key] += delta[key]!;
      }
      this.db.prepare('INSERT INTO wb_stage_usage(task_id,operation_id,delta) VALUES(?,?,?)').run(taskId, operationId, encoded);
      this.save(task); this.append(taskId, 'USAGE', { operationId, ...delta });
      return task;
    });
  }
  /** 实际耗时即使超过预算也必须入账，不能因门禁拒绝而丢失已发生用量。 */
  elapsed(taskId: string, leaseId: string, deltaMs: number): StageTask {
    return this.transaction(() => {
      const task = this.assertLease(taskId, leaseId);
      if (!Number.isSafeInteger(deltaMs) || deltaMs < 0) throw new Error('STAGE_USAGE_INVALID');
      task.usage.elapsedMs += deltaMs; this.save(task);
      return task;
    });
  }
  checkpoint(taskId: string, leaseId: string, key: string, result: StageResult): StageCheckpoint {
    return this.transaction(() => {
      this.assertLease(taskId, leaseId);
      const row = this.db.prepare('SELECT snapshot FROM wb_stage_checkpoints WHERE task_id=? AND step_key=?').get(taskId, key);
      if (row) {
        const previous = JSON.parse(String(row.snapshot)) as StageCheckpoint;
        if (canonicalJson(previous.result) !== canonicalJson(result)) throw new Error('STAGE_CHECKPOINT_CONFLICT');
        return previous;
      }
      const checkpoint = { key, result, createdAt: this.clock() };
      this.db.prepare('INSERT INTO wb_stage_checkpoints(task_id,step_key,snapshot) VALUES(?,?,?)')
        .run(taskId, key, canonicalJson(checkpoint));
      this.append(taskId, 'CHECKPOINT', { key });
      return checkpoint;
    });
  }
  checkpoints(taskId: string): StageCheckpoint[] {
    return this.db.prepare('SELECT snapshot FROM wb_stage_checkpoints WHERE task_id=? ORDER BY rowid').all(taskId)
      .map((row) => JSON.parse(String(row.snapshot)) as StageCheckpoint);
  }
  event(taskId: string, leaseId: string, kind: string, detail: JsonValue): void {
    this.transaction(() => { this.assertLease(taskId, leaseId); this.append(taskId, kind, detail); });
  }
  events(taskId: string, after = 0): StageEvent[] {
    return this.db.prepare('SELECT * FROM wb_stage_events WHERE task_id=? AND sequence>? ORDER BY sequence').all(taskId, after)
      .map((row) => ({ sequence: Number(row.sequence), taskId, kind: String(row.kind),
        detail: JSON.parse(String(row.detail)) as JsonValue, createdAt: String(row.created_at) }));
  }
  recoverOrphans(): number {
    return this.transaction(() => {
      let count = 0;
      for (const row of this.db.prepare("SELECT task_id,owner FROM wb_stage_tasks WHERE lease_id IS NOT NULL").all()) {
        if (!checkpointOwnerExited(JSON.parse(String(row.owner ?? 'null')))) continue;
        const task = this.required(String(row.task_id));
        if (task.contractVersion !== STAGE_CONTRACT) {
          // 回收技术租约，不改写旧契约的执行快照或审计事实。
          this.db.prepare('UPDATE wb_stage_tasks SET lease_id=NULL,owner=NULL WHERE task_id=?').run(task.taskId);
          count += 1; continue;
        }
        task.status = task.cancelRequested ? 'CANCELLED' : 'PAUSED';
        task.reasonCode = task.cancelRequested ? 'STAGE_CANCELLED' : 'STAGE_PROCESS_EXITED';
        this.save(task);
        this.db.prepare('UPDATE wb_stage_tasks SET lease_id=NULL,owner=NULL WHERE task_id=?').run(task.taskId);
        this.append(task.taskId, 'OWNER_EXITED', { reasonCode: task.reasonCode }); count += 1;
      }
      return count;
    });
  }
  close(): void { this.db.close(); }
}
