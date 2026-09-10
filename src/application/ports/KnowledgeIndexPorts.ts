/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义可恢复的 YAML、Markdown 和卡片检索索引工件边界。
 */
import type { CardIndexEntry, CardIndexHeader } from '../../domain/services/knowledge/KnowledgeIndex.ts';
export interface KnowledgeIndexStore {
  get(cardId: string): CardIndexEntry | null;
  list(): CardIndexEntry[];
  save(entry: CardIndexEntry): void;
  render(header: CardIndexHeader, body: string): { yaml: string; markdown: string };
  write(cardId: string, markdown: string): void;
  exists(cardId: string, markdownDigest: string): boolean;
  close(): void;
}
