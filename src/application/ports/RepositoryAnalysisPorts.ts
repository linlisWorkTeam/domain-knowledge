/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义固定提交的代码仓分析与环境报告，不向生成角色暴露参考实现。
 */
import type { RepositoryAnalysis } from '../../domain/services/sourceScan/RepositoryAnalysis.ts';
export type { RepositoryAnalysis, RepositoryFile, RepositoryModule, SourceLanguage } from '../../domain/services/sourceScan/RepositoryAnalysis.ts';
export interface RepositoryAnalyzer {
  analyze(directory: string, revision?: string, signal?: AbortSignal): Promise<RepositoryAnalysis>;
}
