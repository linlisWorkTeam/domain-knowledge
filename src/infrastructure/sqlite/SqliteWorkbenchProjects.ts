/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：原子保存不可变项目输入，重复请求读取原快照。
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { WorkbenchProjectStore } from '../../application/ports/WorkbenchProjectPorts.ts';
import type { WorkbenchProjectSnapshot } from '../../domain/workbench/WorkbenchProject.ts';
export class SqliteWorkbenchProjects implements WorkbenchProjectStore {
  private readonly db: DatabaseSync;
  constructor(filename: string) {
    mkdirSync(dirname(filename), { recursive: true }); this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS wb_project_inputs(snapshot_id TEXT PRIMARY KEY,project_id TEXT NOT NULL,snapshot TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS wb_project_inputs_project ON wb_project_inputs(project_id);`);
  }
  save(snapshot: WorkbenchProjectSnapshot): WorkbenchProjectSnapshot {
    this.db.prepare('INSERT OR IGNORE INTO wb_project_inputs(snapshot_id,project_id,snapshot) VALUES(?,?,?)').run(snapshot.snapshotId, snapshot.projectId, JSON.stringify(snapshot));
    return this.get(snapshot.snapshotId)!;
  }
  get(snapshotId: string): WorkbenchProjectSnapshot | null {
    const row = this.db.prepare('SELECT snapshot FROM wb_project_inputs WHERE snapshot_id=?').get(snapshotId);
    return row ? JSON.parse(String(row.snapshot)) : null;
  }
  list(projectId?: string): WorkbenchProjectSnapshot[] {
    const rows = projectId === undefined ? this.db.prepare('SELECT snapshot FROM wb_project_inputs ORDER BY rowid DESC').all()
      : this.db.prepare('SELECT snapshot FROM wb_project_inputs WHERE project_id=? ORDER BY rowid DESC').all(projectId);
    return rows.map((row) => JSON.parse(String(row.snapshot)));
  }
  close(): void { this.db.close(); }
}
