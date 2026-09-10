/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：以独立SQLite租约持久化五阶段协调，不占用阶段执行槽。
 */
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { WorkbenchPipelineStore } from '../../application/ports/WorkbenchPipelinePorts.ts';
import { PIPELINE_CONTRACT, type WorkbenchPipeline } from '../../domain/services/workbench/WorkbenchPipeline.ts';
import { canonicalJson } from '../../domain/services/workbench/StageTask.ts';
import { checkpointOwner, checkpointOwnerExited } from './CheckpointOwner.ts';
export class SqliteWorkbenchPipelines implements WorkbenchPipelineStore {
  private readonly db: DatabaseSync;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true }); this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS wb_pipelines(id TEXT PRIMARY KEY, record TEXT NOT NULL, lease_id TEXT, owner TEXT);
      CREATE TABLE IF NOT EXISTS wb_pipeline_events(sequence INTEGER PRIMARY KEY AUTOINCREMENT, pipeline_id TEXT NOT NULL, record TEXT NOT NULL);`);
  }
  private transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = work(); this.db.exec('COMMIT'); return result; } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  get(id: string): WorkbenchPipeline | null {
    const row = this.db.prepare('SELECT record FROM wb_pipelines WHERE id=?').get(id);
    return row ? JSON.parse(String(row.record)) : null;
  }
  private required(id: string) { const value = this.get(id); if (!value) throw new Error('PIPELINE_NOT_FOUND'); return value; }
  list(): WorkbenchPipeline[] { return this.db.prepare('SELECT record FROM wb_pipelines ORDER BY rowid DESC').all().map((row) => JSON.parse(String(row.record))); }
  private write(value: WorkbenchPipeline) {
    value.updatedAt = new Date().toISOString(); const record = canonicalJson(value);
    this.db.prepare('UPDATE wb_pipelines SET record=? WHERE id=?').run(record, value.pipelineId);
    this.db.prepare('INSERT INTO wb_pipeline_events(pipeline_id,record) VALUES(?,?)').run(value.pipelineId, record);
  }
  insert(value: WorkbenchPipeline): WorkbenchPipeline {
    return this.transaction(() => {
      const prior = this.get(value.pipelineId); if (prior) return prior;
      this.db.prepare('INSERT INTO wb_pipelines(id,record) VALUES(?,?)').run(value.pipelineId, canonicalJson(value)); this.write(value); return value;
    });
  }
  claim(id: string) {
    this.recover();
    return this.transaction(() => {
      const value = this.required(id);
      if (value.contractVersion !== PIPELINE_CONTRACT) throw new Error('PIPELINE_CONTRACT_INCOMPATIBLE');
      if (value.status !== 'PENDING') return null;
      const owner = checkpointOwner(); if (!owner) { value.status = 'PAUSED'; value.reasonCode = 'PIPELINE_OWNER_UNAVAILABLE'; this.write(value); return null; }
      const leaseId = randomUUID(); value.status = 'RUNNING'; value.reasonCode = null; this.write(value);
      this.db.prepare('UPDATE wb_pipelines SET lease_id=?,owner=? WHERE id=?').run(leaseId, JSON.stringify(owner), id);
      return { value, leaseId };
    });
  }
  save(value: WorkbenchPipeline, leaseId: string, release = false): void {
    this.transaction(() => {
      const row = this.db.prepare('SELECT lease_id FROM wb_pipelines WHERE id=?').get(value.pipelineId);
      if (row?.lease_id !== leaseId) throw new Error('PIPELINE_LEASE_LOST');
      const current = this.required(value.pipelineId);
      if (current.cancelRequested && !release) throw new Error('PIPELINE_CANCELLED');
      value.cancelRequested = current.cancelRequested;
      if (current.cancelRequested) { value.status = 'CANCELLED'; value.reasonCode = 'PIPELINE_CANCELLED'; }
      this.write(value);
      if (release) this.db.prepare('UPDATE wb_pipelines SET lease_id=NULL,owner=NULL WHERE id=?').run(value.pipelineId);
    });
  }
  cancel(id: string): WorkbenchPipeline {
    return this.transaction(() => {
      const value = this.required(id);
      if (value.contractVersion !== PIPELINE_CONTRACT) throw new Error('PIPELINE_CONTRACT_INCOMPATIBLE');
      if (!['PENDING', 'RUNNING'].includes(value.status)) return value;
      value.cancelRequested = true;
      if (value.status === 'PENDING') { value.status = 'CANCELLED'; value.reasonCode = 'PIPELINE_CANCELLED'; }
      this.write(value); return value;
    });
  }
  resume(id: string, inputDigest: string): WorkbenchPipeline {
    return this.transaction(() => {
      const value = this.required(id);
      if (value.contractVersion !== PIPELINE_CONTRACT) throw new Error('PIPELINE_CONTRACT_INCOMPATIBLE');
      if (value.inputDigest !== inputDigest) throw new Error('PIPELINE_INPUT_CHANGED');
      if (!['FAILED', 'PAUSED', 'CANCELLED'].includes(value.status)) throw new Error('PIPELINE_NOT_RESUMABLE');
      value.status = 'PENDING'; value.reasonCode = null; value.cancelRequested = false; value.resumeRequested = true; this.write(value); return value;
    });
  }
  recover(): void {
    this.transaction(() => {
      for (const row of this.db.prepare('SELECT id,record,owner FROM wb_pipelines WHERE lease_id IS NOT NULL').all()) {
        if (!checkpointOwnerExited(JSON.parse(String(row.owner)))) continue;
        const value = JSON.parse(String(row.record)) as WorkbenchPipeline;
        if (value.contractVersion !== PIPELINE_CONTRACT) continue;
        value.status = value.cancelRequested ? 'CANCELLED' : 'PAUSED'; value.reasonCode = value.cancelRequested ? 'PIPELINE_CANCELLED' : 'PIPELINE_PROCESS_EXITED';
        this.write(value); this.db.prepare('UPDATE wb_pipelines SET lease_id=NULL,owner=NULL WHERE id=?').run(String(row.id));
      }
    });
  }
  close() { this.db.close(); }
}
