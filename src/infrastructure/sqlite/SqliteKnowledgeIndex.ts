/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：持久化可重建索引与稳定文件名的 YAML Markdown 工件。
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { stringify } from 'yaml';
import { sha256 } from '../../domain/Domain.ts';
import type { CardIndexEntry, CardIndexHeader } from '../../domain/knowledge/KnowledgeIndex.ts';
import type { KnowledgeIndexStore } from '../../application/ports/KnowledgeIndexPorts.ts';

export function knowledgeIndexFilename(cardId: string): string {
  const encoded = encodeURIComponent(cardId);
  return `${encoded.length <= 180 ? encoded : `card-${sha256(cardId)}`}.md`;
}

/** SQLite 只存索引与审计引用；磁盘 Markdown 可从内容寻址工件恢复。 */
export class SqliteKnowledgeIndex implements KnowledgeIndexStore {
  private readonly db: DatabaseSync;
  private readonly directory: string;
  constructor(filename: string, directory: string) {
    mkdirSync(dirname(filename), { recursive: true }); mkdirSync(directory, { recursive: true });
    this.directory = directory; this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS wb_card_index(card_id TEXT PRIMARY KEY, snapshot TEXT NOT NULL);`);
  }
  private path(cardId: string): string {
    // 外部导入的旧 cardId 可能不是文件名；仍仅按稳定身份编码，不使用标题或版本号。
    return join(this.directory, knowledgeIndexFilename(cardId));
  }
  get(cardId: string): CardIndexEntry | null {
    const row = this.db.prepare('SELECT snapshot FROM wb_card_index WHERE card_id=?').get(cardId);
    return row ? JSON.parse(String(row.snapshot)) as CardIndexEntry : null;
  }
  list(): CardIndexEntry[] {
    return this.db.prepare('SELECT snapshot FROM wb_card_index ORDER BY card_id').all().map((row) => JSON.parse(String(row.snapshot)) as CardIndexEntry);
  }
  save(entry: CardIndexEntry): void {
    this.db.prepare('INSERT INTO wb_card_index(card_id,snapshot) VALUES(?,?) ON CONFLICT(card_id) DO UPDATE SET snapshot=excluded.snapshot')
      .run(entry.cardId, JSON.stringify(entry));
  }
  render(header: CardIndexHeader, body: string): { yaml: string; markdown: string } {
    const yaml = stringify(header, { lineWidth: 0 });
    return { yaml, markdown: `---\n${yaml}---\n\n${body}` };
  }
  write(cardId: string, markdown: string): void {
    const path = this.path(cardId); const temporary = `${path}.${randomUUID()}.tmp`;
    try { writeFileSync(temporary, markdown, { flag: 'wx', mode: 0o600 }); renameSync(temporary, path); }
    finally { rmSync(temporary, { force: true }); }
  }
  exists(cardId: string, markdownDigest: string): boolean {
    try { return sha256(readFileSync(this.path(cardId))) === markdownDigest; } catch { return false; }
  }
  close(): void { this.db.close(); }
}
