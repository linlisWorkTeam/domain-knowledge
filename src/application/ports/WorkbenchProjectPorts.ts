/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：声明固定项目输入的持久化端口。
 */
import type { WorkbenchProjectSnapshot } from '../../domain/workbench/WorkbenchProject.ts';
export interface WorkbenchProjectStore {
  save(snapshot: WorkbenchProjectSnapshot): WorkbenchProjectSnapshot;
  get(snapshotId: string): WorkbenchProjectSnapshot | null;
  list(projectId?: string): WorkbenchProjectSnapshot[];
  close(): void;
}
