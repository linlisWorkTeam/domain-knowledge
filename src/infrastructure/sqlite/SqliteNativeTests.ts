/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：保存不可变原生测试集，并用事务保护同参考输入的可信版本链。
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { NativeTestStore } from '../../application/ports/NativeEvaluationPorts.ts';
import type { NativeTestSet } from '../../domain/services/evaluation/NativeTestCache.ts';
import { canonicalJson } from '../../domain/services/workbench/StageTask.ts';
export class SqliteNativeTests implements NativeTestStore {
  private readonly db: DatabaseSync;
  constructor(filename: string) {
    mkdirSync(dirname(filename), { recursive: true }); this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS wb_native_test_sets(test_set_id TEXT PRIMARY KEY,cache_key TEXT NOT NULL,reference_key TEXT NOT NULL,status TEXT NOT NULL,record TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS wb_native_test_cache ON wb_native_test_sets(cache_key,status);
      CREATE TABLE IF NOT EXISTS wb_native_test_heads(reference_key TEXT PRIMARY KEY,test_set_id TEXT NOT NULL);`);
  }
  get(testSetId: string): NativeTestSet | null {
    const row = this.db.prepare('SELECT record FROM wb_native_test_sets WHERE test_set_id=?').get(testSetId);
    return row ? JSON.parse(String(row.record)) : null;
  }
  trusted(cacheKey: string): NativeTestSet | null {
    const row = this.db.prepare("SELECT record FROM wb_native_test_sets WHERE cache_key=? AND status='TRUSTED' ORDER BY rowid LIMIT 1").get(cacheKey);
    return row ? JSON.parse(String(row.record)) : null;
  }
  lineage(cardIds: string[]): NativeTestSet[] {
    const key = canonicalJson([...cardIds].sort());
    return this.db.prepare("SELECT record FROM wb_native_test_sets WHERE status='TRUSTED' ORDER BY rowid").all()
      .map((row) => JSON.parse(String(row.record)) as NativeTestSet)
      .filter((set) => canonicalJson([...set.binding.cardIds].sort()) === key);
  }
  head(referenceKey: string): NativeTestSet | null {
    const row = this.db.prepare('SELECT s.record FROM wb_native_test_heads h JOIN wb_native_test_sets s ON h.test_set_id=s.test_set_id WHERE h.reference_key=?').get(referenceKey);
    return row ? JSON.parse(String(row.record)) : null;
  }
  save(record: NativeTestSet): NativeTestSet {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.get(record.testSetId);
      if (existing) {
        if (canonicalJson({ ...existing, createdAt: '' }) !== canonicalJson({ ...record, createdAt: '' })) throw new Error('NATIVE_TEST_IMMUTABLE');
        this.db.exec('COMMIT'); return existing;
      }
      if (record.status === 'TRUSTED' && (this.head(record.referenceKey)?.testSetId ?? null) !== record.parentTestSetId) throw new Error('NATIVE_TEST_HEAD_CHANGED');
      this.db.prepare('INSERT INTO wb_native_test_sets VALUES(?,?,?,?,?)').run(record.testSetId, record.cacheKey, record.referenceKey, record.status, JSON.stringify(record));
      if (record.status === 'TRUSTED') this.db.prepare('INSERT INTO wb_native_test_heads VALUES(?,?) ON CONFLICT(reference_key) DO UPDATE SET test_set_id=excluded.test_set_id').run(record.referenceKey, record.testSetId);
      this.db.exec('COMMIT'); return record;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close(): void { this.db.close(); }
}
