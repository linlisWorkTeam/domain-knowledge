/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义源码分析事实及默认模块候选分组规则。
 */
export type SourceLanguage = 'c' | 'cpp' | 'typescript' | 'unsupported';
export interface RepositoryFile {
  path: string; objectId: string; size: number; language: SourceLanguage;
  kind: 'source' | 'test' | 'build' | 'example';
}
export interface RepositoryModule {
  moduleId: string; language: SourceLanguage; sourcePaths: string[]; testPaths: string[];
  selectedByDefault: boolean; reasons: string[];
}
export interface RepositoryAnalysis {
  schemaVersion: 'repository-analysis-v1'; repositoryId: string; directory: string;
  requestedRevision: string; commit: string; sourceDigest: string;
  files: RepositoryFile[]; modules: RepositoryModule[]; buildSystems: string[];
  tools: Array<{ name: string; available: boolean; version: string | null }>;
  resources: { availableMemoryBytes: number; availableDiskBytes: number };
  warnings: string[];
}

/** 同名源码和声明组成候选单元；该启发式不宣称已经完成 AST 或公开接口提取。 */
export function groupRepositoryModules(files: RepositoryFile[]): RepositoryModule[] {
  const groups = new Map<string, RepositoryFile[]>();
  for (const file of files.filter((entry) => entry.kind === 'source')) {
    const key = file.path.replace(/(?:\.d)?\.[^.]+$/, '');
    const group = groups.get(key) ?? []; group.push(file); groups.set(key, group);
  }
  return [...groups].map(([moduleId, group]) => {
    const language = group.find((file) => /\.(c|cpp|cc|cxx|ts|tsx)$/.test(file.path))?.language ?? group[0]!.language;
    const reasons = language === 'unsupported' ? ['LANGUAGE_NOT_SUPPORTED'] : [];
    if (new Set(group.filter((file) => /\.(c|cpp|cc|cxx|ts|tsx)$/.test(file.path)).map((file) => file.language)).size > 1) reasons.push('MIXED_LANGUAGE_MODULE');
    if (group.some((file) => file.size > 1_048_576)) reasons.push('SOURCE_FILE_TOO_LARGE');
    const name = moduleId.split('/').at(-1)!;
    return { moduleId, language, sourcePaths: group.map((file) => file.path),
      testPaths: files.filter((file) => file.kind === 'test' && file.path.split('/').at(-1)!.replace(/\.[^.]+$/, '').replace(/^(?:test|spec)[_.-]/, '').replace(/[_.-](?:test|spec)$/, '') === name).map((file) => file.path),
      selectedByDefault: reasons.length === 0, reasons };
  });
}
