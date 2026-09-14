/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：原子分配可读批次号，并按项目模块串行领取执行。
 */
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { BATCH_CONTRACT, appendBatchRound, batchDate, batchName, batchSchedule, type WorkbenchBatch } from '../../domain/workbench/WorkbenchBatch.ts';
import { checkpointOwner, checkpointOwnerExited } from './CheckpointOwner.ts';
import { canonicalJson } from '../../domain/workbench/StageTask.ts';
import type { BatchCreation, WorkbenchBatchStore } from '../../application/ports/WorkbenchBatchPorts.ts';
export class SqliteWorkbenchBatches implements WorkbenchBatchStore {
  private readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS wb_batches(batch_id TEXT PRIMARY KEY,project_id TEXT NOT NULL,module_id TEXT NOT NULL,value TEXT NOT NULL,lease_id TEXT);
      CREATE UNIQUE INDEX IF NOT EXISTS wb_batches_module_lease ON wb_batches(project_id,module_id) WHERE lease_id IS NOT NULL;
      CREATE TABLE IF NOT EXISTS wb_batch_commands(command_id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,batch_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS wb_batch_controls(command_id TEXT PRIMARY KEY,batch_id TEXT NOT NULL,action TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS wb_batch_round_commands(command_id TEXT PRIMARY KEY,batch_id TEXT NOT NULL,round_number INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS wb_batch_sequences(name TEXT NOT NULL,day TEXT NOT NULL,value INTEGER NOT NULL,PRIMARY KEY(name,day));`);
    if (!this.db.prepare('PRAGMA table_info(wb_batches)').all().some(row => row.name === 'owner')) this.db.exec('ALTER TABLE wb_batches ADD COLUMN owner TEXT');
  }
  private transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = work(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  get(batchId: string): WorkbenchBatch | null {
    const row = this.db.prepare('SELECT value FROM wb_batches WHERE batch_id=?').get(batchId);
    return row ? JSON.parse(String(row.value)) : null;
  }
  list(projectId?: string): WorkbenchBatch[] {
    const rows = projectId === undefined ? this.db.prepare('SELECT value FROM wb_batches ORDER BY rowid DESC').all()
      : this.db.prepare('SELECT value FROM wb_batches WHERE project_id=? ORDER BY rowid DESC').all(projectId);
    return rows.map(row => JSON.parse(String(row.value)));
  }
  create(input: BatchCreation, commandId: string, now: string): WorkbenchBatch {
    if (!commandId || commandId.length > 256 || !input.projectId || !input.snapshotId || !input.moduleId) throw new Error('BATCH_INPUT_INVALID');
    const schedule = batchSchedule(input.schedule), fingerprint = canonicalJson({ ...input, schedule });
    return this.transaction(() => {
      const previous = this.db.prepare('SELECT fingerprint,batch_id FROM wb_batch_commands WHERE command_id=?').get(commandId);
      if (previous) { if (previous.fingerprint !== fingerprint) throw new Error('IDEMPOTENCY_CONFLICT'); return this.get(String(previous.batch_id))!; }
      const name = input.moduleId.replaceAll('/', '-'), day = batchDate(now);
      const sequence = Number(this.db.prepare('SELECT value FROM wb_batch_sequences WHERE name=? AND day=?').get(name, day)?.value ?? 0) + 1;
      const batchId = batchName(input.moduleId, now, sequence);
      let batch: WorkbenchBatch = { contractVersion: BATCH_CONTRACT, batchId, ...input, schedule,
        nextRunAt: schedule.enabled ? now : null, status: 'READY', rounds: [], createdAt: now, updatedAt: now };
      if (schedule.enabled) batch = appendBatchRound(batch, now);
      this.db.prepare('INSERT INTO wb_batches(batch_id,project_id,module_id,value) VALUES(?,?,?,?)').run(batchId, input.projectId, input.moduleId, JSON.stringify(batch));
      this.db.prepare('INSERT INTO wb_batch_sequences(name,day,value) VALUES(?,?,?) ON CONFLICT(name,day) DO UPDATE SET value=excluded.value').run(name, day, sequence);
      this.db.prepare('INSERT INTO wb_batch_commands(command_id,fingerprint,batch_id) VALUES(?,?,?)').run(commandId, fingerprint, batchId);
      return batch;
    });
  }
  enqueue(batchId: string, now: string, commandId?: string): WorkbenchBatch {
    return this.transaction(() => {
      const current = this.get(batchId); if (!current) throw new Error('BATCH_NOT_FOUND');
      if (commandId) {
        const replay = this.db.prepare('SELECT batch_id FROM wb_batch_round_commands WHERE command_id=?').get(commandId);
        if (replay) { if (replay.batch_id !== batchId) throw new Error('IDEMPOTENCY_CONFLICT'); return current; }
      }
      const batch = appendBatchRound(current, now);
      if (commandId) this.db.prepare('INSERT INTO wb_batch_round_commands(command_id,batch_id,round_number) VALUES(?,?,?)').run(commandId, batchId, batch.rounds.length);
      this.db.prepare('UPDATE wb_batches SET value=? WHERE batch_id=?').run(JSON.stringify(batch), batchId);
      return batch;
    });
  }
  claim(batchId: string, now: string) {
    this.recover(now);
    return this.transaction(() => {
      const batch = this.get(batchId);
      if (!batch || batch.status !== 'QUEUED' || this.db.prepare('SELECT 1 FROM wb_batches WHERE project_id=? AND module_id=? AND lease_id IS NOT NULL').get(batch.projectId, batch.moduleId)) return null;
      const round = batch.rounds.at(-1); if (!round || round.status !== 'QUEUED') throw new Error('BATCH_ROUND_INVALID');
      const owner = checkpointOwner(); if (!owner) throw new Error('BATCH_OWNER_UNAVAILABLE');
      const leaseId = randomUUID(); batch.status = 'RUNNING'; batch.updatedAt = now; round.status = 'RUNNING'; round.startedAt ??= now;
      this.db.prepare('UPDATE wb_batches SET value=?,lease_id=?,owner=? WHERE batch_id=?').run(JSON.stringify(batch), leaseId, JSON.stringify(owner), batchId);
      return { batch, leaseId };
    });
  }
  save(batch: WorkbenchBatch, leaseId: string, release: boolean): void {
    this.transaction(() => {
      const current = this.get(batch.batchId);
      if (!current || current.projectId !== batch.projectId || current.moduleId !== batch.moduleId || current.snapshotId !== batch.snapshotId
        || current.contractVersion !== batch.contractVersion || current.createdAt !== batch.createdAt) throw new Error('BATCH_INPUT_CHANGED');
      const last = batch.rounds.at(-1);
      if (!last || batch.rounds.length !== current.rounds.length || last.executionKey !== current.rounds.at(-1)?.executionKey
        || JSON.stringify(batch.rounds.slice(0, -1)) !== JSON.stringify(current.rounds.slice(0, -1))
        || (release && ['RUNNING', 'QUEUED'].includes(last.status))) throw new Error('BATCH_ROUND_INVALID');
      if (current.cancelRequested) { batch.cancelRequested = true; batch.schedule = current.schedule; batch.nextRunAt = null; }
      const result = this.db.prepare('UPDATE wb_batches SET value=?,lease_id=?,owner=CASE WHEN ? THEN NULL ELSE owner END WHERE batch_id=? AND lease_id=?').run(JSON.stringify(batch), release ? null : leaseId, release ? 1 : 0, batch.batchId, leaseId);
      if (result.changes !== 1) throw new Error('BATCH_LEASE_LOST');
    });
  }
  private replayControl(commandId: string | undefined, batchId: string, action: string): boolean {
    if (!commandId) return false;
    const row = this.db.prepare('SELECT batch_id,action FROM wb_batch_controls WHERE command_id=?').get(commandId);
    if (row) { if (row.batch_id !== batchId || row.action !== action) throw new Error('IDEMPOTENCY_CONFLICT'); return true; }
    this.db.prepare('INSERT INTO wb_batch_controls(command_id,batch_id,action) VALUES(?,?,?)').run(commandId, batchId, action); return false;
  }
  resume(batchId: string, now: string, commandId?: string): WorkbenchBatch {
    return this.transaction(() => {
      const batch = this.get(batchId); if (!batch) throw new Error('BATCH_NOT_FOUND');
      if (this.replayControl(commandId, batchId, 'resume')) return batch;
      const round = batch.rounds.at(-1);
      if (!round || !['PAUSED', 'FAILED', 'CANCELLED'].includes(batch.status) || !['PAUSED', 'FAILED', 'CANCELLED'].includes(round.status)) throw new Error('BATCH_NOT_RESUMABLE');
      batch.status = 'QUEUED'; batch.cancelRequested = false; batch.updatedAt = now;
      round.status = 'QUEUED'; round.resumeRequested = true; round.completedAt = null;
      this.db.prepare('UPDATE wb_batches SET value=? WHERE batch_id=? AND lease_id IS NULL').run(JSON.stringify(batch), batchId);
      return batch;
    });
  }
  cancel(batchId: string, now: string, commandId?: string): WorkbenchBatch {
    return this.transaction(() => {
      const batch = this.get(batchId); if (!batch) throw new Error('BATCH_NOT_FOUND');
      if (this.replayControl(commandId, batchId, 'cancel')) return batch;
      batch.cancelRequested = true; batch.schedule = { enabled: false, intervalMinutes: null }; batch.nextRunAt = null; batch.updatedAt = now;
      if (batch.status !== 'RUNNING') {
        batch.status = 'CANCELLED'; const round = batch.rounds.at(-1);
        if (round?.status === 'QUEUED') { round.status = 'CANCELLED'; round.completedAt = now; round.reasonCode = 'BATCH_CANCELLED'; }
      }
      this.db.prepare('UPDATE wb_batches SET value=? WHERE batch_id=?').run(JSON.stringify(batch), batchId); return batch;
    });
  }
  recover(now: string): void {
    this.transaction(() => {
      for (const row of this.db.prepare('SELECT batch_id,value,owner FROM wb_batches WHERE lease_id IS NOT NULL').all()) {
        if (!row.owner || !checkpointOwnerExited(JSON.parse(String(row.owner)))) continue;
        const batch = JSON.parse(String(row.value)) as WorkbenchBatch;
        if (batch.contractVersion !== BATCH_CONTRACT) continue;
        batch.status = 'QUEUED'; batch.updatedAt = now;
        const round = batch.rounds.at(-1); if (!round) throw new Error('BATCH_ROUND_INVALID');
        round.status = 'QUEUED'; round.reasonCode = 'BATCH_PROCESS_EXITED';
        this.db.prepare('UPDATE wb_batches SET value=?,lease_id=NULL,owner=NULL WHERE batch_id=?').run(JSON.stringify(batch), String(row.batch_id));
      }
    });
  }
  close(): void { this.db.close(); }
}
