/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：启动与调度前只读检查持久删除意图，读取失败时不放行运行。
 */
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
export function deletionRecoveryPending(filename: string): boolean {
  if (!existsSync(filename)) return false;
  let database: DatabaseSync | undefined;
  try {
    database = new DatabaseSync(filename, { readOnly: true });
    return !!database.prepare("SELECT 1 FROM deletion_recovery_intents WHERE phase IS NULL OR phase <> 'COMPLETE' LIMIT 1").get();
  } catch { return true; }
  finally { database?.close(); }
}

/** 维护开始前还须检查持久租约，不能只依据本进程的 Promise 数量判断空闲。 */
export function deletionWorkbenchExecutionsIdle(workbenchPath: string): boolean {
  const databases: DatabaseSync[] = [];
  try {
    const workbench = new DatabaseSync(workbenchPath, { readOnly: true }); databases.push(workbench);
    for (const query of [
      "SELECT 1 FROM wb_stage_tasks WHERE lease_id IS NOT NULL OR status IS NULL OR status NOT IN ('SUCCEEDED','FAILED','PAUSED','CANCELLED') LIMIT 1",
      "SELECT 1 FROM wb_pipelines WHERE lease_id IS NOT NULL OR json_extract(record,'$.status') IS NULL OR json_extract(record,'$.status') NOT IN ('SUCCEEDED','FAILED','PAUSED','CANCELLED') LIMIT 1",
      "SELECT 1 FROM wb_batches WHERE lease_id IS NOT NULL OR json_extract(value,'$.status') IS NULL OR json_extract(value,'$.status') NOT IN ('READY','SUCCEEDED','FAILED','PAUSED','CANCELLED') LIMIT 1",
    ]) if (workbench.prepare(query).get()) return false;
    return true;
  } catch { return false; }
  finally { for (const database of databases) database.close(); }
}
