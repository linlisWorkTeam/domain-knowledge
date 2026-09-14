/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：让业务读取排除已删除执行，同时兼容尚无删除记录的旧只读数据库。
 */
import type { DatabaseSync } from 'node:sqlite';
export function visibleExecutionSql(database: DatabaseSync, table: string, column: string): string {
  if (!['runs', 'wb_batches', 'wb_pipelines', 'wb_stage_tasks'].includes(table)
    || !/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(column)) throw new Error('DELETION_QUERY_INVALID');
  if (!database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='deletion_execution_tombstones'").get()) return '1=1';
  return `NOT EXISTS(SELECT 1 FROM deletion_execution_tombstones AS deleted_execution
    WHERE deleted_execution.table_name='${table}' AND deleted_execution.execution_id=${column})`;
}
