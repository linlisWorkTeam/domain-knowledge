/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：追加保存不可变外部材料快照，复用仓库事务数据库。
 */
import type { DatabaseSync } from 'node:sqlite';
import type { ExternalMaterial } from '../../domain/services/association/ExternalMaterial.ts';
import type { ExternalMaterialStore } from '../../application/ports/ExternalMaterialPorts.ts';
export class SqliteExternalMaterials implements ExternalMaterialStore {
  private readonly db: DatabaseSync;
  constructor(db: DatabaseSync) { this.db = db; db.exec('CREATE TABLE IF NOT EXISTS wb_external_materials(id TEXT PRIMARY KEY, record TEXT NOT NULL)'); }
  get(id: string): ExternalMaterial | null { const row = this.db.prepare('SELECT record FROM wb_external_materials WHERE id=?').get(id); return row ? JSON.parse(String(row.record)) as ExternalMaterial : null; }
  list(): ExternalMaterial[] { return this.db.prepare('SELECT record FROM wb_external_materials ORDER BY rowid DESC').all().map((row) => JSON.parse(String(row.record)) as ExternalMaterial); }
  insert(value: ExternalMaterial): ExternalMaterial { this.db.prepare('INSERT OR IGNORE INTO wb_external_materials(id,record) VALUES(?,?)').run(value.materialId, JSON.stringify(value)); return this.get(value.materialId)!; }
}
