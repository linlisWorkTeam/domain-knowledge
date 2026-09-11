/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：原子持久化发布准备、提交和错误审计，保持重复调用幂等。
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { WorkbenchPublicationStore } from '../../application/ports/WorkbenchPublicationPorts.ts';
import { assertPublicationRecord, type PublicationRecord } from '../../domain/services/workbench/WorkbenchPublicationRecord.ts';
export class SqliteWorkbenchPublications implements WorkbenchPublicationStore {
  private readonly db: DatabaseSync;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true }); this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS wb_publications(id TEXT PRIMARY KEY, project_id TEXT NOT NULL, record TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS wb_publication_events(sequence INTEGER PRIMARY KEY AUTOINCREMENT, publication_id TEXT NOT NULL, record TEXT NOT NULL);`);
  }
  private tx<T>(work: () => T): T { this.db.exec('BEGIN IMMEDIATE'); try { const result = work(); this.db.exec('COMMIT'); return result; } catch (error) { this.db.exec('ROLLBACK'); throw error; } }
  get(id: string): PublicationRecord | null { const row = this.db.prepare('SELECT record FROM wb_publications WHERE id=?').get(id); return row ? JSON.parse(String(row.record)) : null; }
  list(projectId?: string): PublicationRecord[] {
    return (projectId ? this.db.prepare('SELECT record FROM wb_publications WHERE project_id=? ORDER BY rowid DESC').all(projectId)
      : this.db.prepare('SELECT record FROM wb_publications ORDER BY rowid DESC').all()).map(row => JSON.parse(String(row.record)));
  }
  private save(value: PublicationRecord) { const record = JSON.stringify(value); this.db.prepare('UPDATE wb_publications SET record=? WHERE id=?').run(record, value.publicationId); this.db.prepare('INSERT INTO wb_publication_events(publication_id,record) VALUES(?,?)').run(value.publicationId, record); }
  insert(value: PublicationRecord) {
    assertPublicationRecord(value);
    if (value.status !== 'PREPARED') throw new Error('PUBLICATION_STATE_INVALID');
    return this.tx(() => { const prior = this.get(value.publicationId); if (prior) return prior;
      this.db.prepare('INSERT INTO wb_publications(id,project_id,record) VALUES(?,?,?)').run(value.publicationId, value.projectId, JSON.stringify(value)); this.save(value); return value; });
  }
  commit(id: string) { return this.tx(() => { const value = this.get(id); if (!value) throw new Error('PUBLICATION_NOT_FOUND'); assertPublicationRecord(value);
    if (value.status === 'COMMITTED') return value;
    value.status = 'COMMITTED'; value.lastError = null; value.updatedAt = new Date().toISOString(); this.save(value); return value; }); }
  fail(id: string, code: string) { this.tx(() => { const value = this.get(id); if (!value || value.status === 'COMMITTED' || value.lastError === code) return;
    value.lastError = code; value.updatedAt = new Date().toISOString(); this.save(value); }); }
  close() { this.db.close(); }
}
