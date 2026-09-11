/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：声明独立发布审计和可恢复文件导出的边界。
 */
import type { PublicationRecord } from '../../domain/services/workbench/WorkbenchPublicationRecord.ts';
export interface WorkbenchPublicationStore {
  insert(record: PublicationRecord): PublicationRecord;
  get(id: string): PublicationRecord | null;
  list(projectId?: string): PublicationRecord[];
  commit(id: string): PublicationRecord;
  fail(id: string, code: string): void;
  close(): void;
}
export interface WorkbenchPublicationFiles {
  publish(record: PublicationRecord): Promise<void>;
  verify(record: PublicationRecord): Promise<boolean>;
}
