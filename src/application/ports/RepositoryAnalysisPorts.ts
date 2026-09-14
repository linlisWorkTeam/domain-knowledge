/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义固定提交的代码仓分析与环境报告，不向生成角色暴露参考实现。
 */
import type { RepositoryAnalysis } from '../../domain/sourceScan/RepositoryAnalysis.ts';
export type { RepositoryAnalysis, RepositoryFile, RepositoryModule, SourceLanguage } from '../../domain/sourceScan/RepositoryAnalysis.ts';
export interface RepositoryAnalyzer {
  analyze(directory: string, revision?: string, signal?: AbortSignal): Promise<RepositoryAnalysis>;
}
export interface RepositorySourceReader {
  readFiles(directory: string, commit: string, paths: string[], signal?: AbortSignal): Promise<Array<{ path: string; objectId: string; content: string }>>;
}
