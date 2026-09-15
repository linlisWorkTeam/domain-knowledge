/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义项目固定输入、模块选择与声明式构建约束。
 */
import { sha256, type ArtifactRef } from '../Domain.ts';
import type { RepositoryAnalysis, RepositoryModule } from '../sourceScan/RepositoryAnalysis.ts';
import { canonicalJson } from './StageTask.ts';

export interface BuildConstraints {
  cCompiler: 'gcc' | 'clang'; cppCompiler: 'g++' | 'clang++';
  cStandard: 'c99' | 'c11' | 'c17'; cppStandard: 'c++11' | 'c++14' | 'c++17' | 'c++20';
  includeDirectories: string[]; definitions: string[];
}
export interface ProjectModuleDefinition { moduleId: string; directories: string[] }
export interface ProjectSource { path: string; objectId: string; kind: 'source' | 'build'; ref: ArtifactRef }
export interface WorkbenchProjectSnapshot {
  schemaVersion: 'workbench-project-v1'; projectId: string; snapshotId: string;
  repositoryId: string; directory: string; commit: string; sourceDigest: string;
  moduleDefinitions?: ProjectModuleDefinition[];
  modules: RepositoryModule[]; build: BuildConstraints; moduleBuilds?: Record<string, BuildConstraints>; sourceFiles: ProjectSource[];
  manifestRef: ArtifactRef; createdAt: string;
}
export function buildConstraints(input: unknown = {}): BuildConstraints {
  if (!input || Array.isArray(input) || typeof input !== 'object') throw new Error('PROJECT_BUILD_INVALID');
  const value = input as Record<string, unknown>;
  const defaults: BuildConstraints = { cCompiler: 'gcc', cppCompiler: 'g++', cStandard: 'c11', cppStandard: 'c++17', includeDirectories: [], definitions: [] };
  if (Object.keys(value).some((key) => !Object.hasOwn(defaults, key))) throw new Error('PROJECT_BUILD_INVALID');
  const result = { ...defaults, ...value } as BuildConstraints;
  if (!['gcc', 'clang'].includes(result.cCompiler) || !['g++', 'clang++'].includes(result.cppCompiler)
    || !['c99', 'c11', 'c17'].includes(result.cStandard) || !['c++11', 'c++14', 'c++17', 'c++20'].includes(result.cppStandard)) throw new Error('PROJECT_BUILD_INVALID');
  for (const key of ['includeDirectories', 'definitions'] as const) {
    const entries = result[key];
    if (!Array.isArray(entries) || entries.length > 64 || entries.some((entry) => typeof entry !== 'string' || entry.length > 256)) throw new Error('PROJECT_BUILD_INVALID');
    result[key] = [...new Set(entries)];
  }
  if (result.includeDirectories.some((path) => path !== '.' && (!/^[\w./-]+$/.test(path) || path.startsWith('/') || path.split('/').some((part) => !part || part === '..')))
    || result.definitions.some((value) => !/^[A-Za-z_][A-Za-z0-9_]*(?:=[A-Za-z0-9_+.-]+)?$/.test(value))) throw new Error('PROJECT_BUILD_INVALID');
  return result;
}
export function selectProjectModules(report: RepositoryAnalysis, moduleIds?: string[]): RepositoryModule[] {
  const ids = moduleIds ?? report.modules.filter((module) => module.selectedByDefault).map((module) => module.moduleId);
  if (!Array.isArray(ids) || !ids.length || ids.length > 1000 || ids.some((id) => typeof id !== 'string')) throw new Error('PROJECT_MODULES_INVALID');
  const modules = [...new Set(ids)].sort().map((id) => report.modules.find((module) => module.moduleId === id));
  if (modules.some((module) => !module || !module.selectedByDefault)) throw new Error('PROJECT_MODULE_UNSUPPORTED');
  return modules as RepositoryModule[];
}
/** 自定义模块仅从固定清单中选文件，不读取路径、符号链接或测试正文。 */
export function defineProjectModules(report: RepositoryAnalysis, input: unknown): { definitions: ProjectModuleDefinition[]; modules: RepositoryModule[] } {
  if (!Array.isArray(input) || !input.length || input.length > 200) throw new Error('PROJECT_MODULE_DEFINITION_INVALID');
  const definitions: ProjectModuleDefinition[] = input.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['moduleId', 'directories'].includes(key))
      || typeof value.moduleId !== 'string' || !/^[\p{L}\p{N}][\p{L}\p{N}_.-]{0,127}$/u.test(value.moduleId)
      || !Array.isArray(value.directories) || !value.directories.length || value.directories.length > 200
      || value.directories.some((path: unknown) => typeof path !== 'string' || !path || path.length > 1024 || (path !== '.' && (path.startsWith('/') || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..'))))) {
      throw new Error('PROJECT_MODULE_DEFINITION_INVALID');
    }
    return { moduleId: value.moduleId, directories: [...new Set<string>(value.directories)].sort() };
  }).sort((a, b) => a.moduleId.localeCompare(b.moduleId));
  if (new Set(definitions.map(item => item.moduleId)).size !== definitions.length) throw new Error('PROJECT_MODULE_DEFINITION_INVALID');
  const modules = definitions.map(definition => {
    const selected = (path: string) => definition.directories.some(directory => directory === '.' || path.startsWith(`${directory}/`));
    if (definition.directories.some(directory => directory !== '.' && !report.files.some(file => file.path.startsWith(`${directory}/`)))) throw new Error('PROJECT_MODULE_DIRECTORY_NOT_FOUND');
    const files = report.files.filter(file => file.kind === 'source' && selected(file.path));
    if (!files.length) throw new Error('PROJECT_MODULE_EMPTY');
    const implementations = files.filter(file => /\.(?:c|cpp|cc|cxx|ts|tsx)$/.test(file.path));
    const languages = new Set((implementations.length ? implementations : files).map(file => file.language));
    if (languages.size !== 1 || files.some(file => file.language === 'unsupported' || file.size > 1_048_576)) throw new Error('PROJECT_MODULE_UNSUPPORTED');
    const language = [...languages][0]!;
    if (!['c', 'cpp'].includes(language)) throw new Error('PROJECT_MODULE_UNSUPPORTED');
    return { moduleId: definition.moduleId, language, sourcePaths: files.map(file => file.path).sort(),
      testPaths: report.files.filter(file => file.kind === 'test' && selected(file.path)).map(file => file.path).sort(), selectedByDefault: true, reasons: [] };
  });
  return { definitions, modules };
}

export function createProjectSnapshot(input: Omit<WorkbenchProjectSnapshot, 'schemaVersion' | 'projectId' | 'snapshotId' | 'createdAt'>, now: string): WorkbenchProjectSnapshot {
  if (input.moduleBuilds && canonicalJson(projectModuleBuilds(input.moduleBuilds, input.modules, buildConstraints(input.build))) !== canonicalJson(input.moduleBuilds)) throw new Error('PROJECT_MODULE_BUILD_INVALID');
  const identity = { schemaVersion: 'workbench-project-v1' as const, ...input };
  return { ...identity, projectId: `project-${sha256(input.repositoryId).slice(0, 32)}`,
    snapshotId: `project-input-${sha256(canonicalJson(identity))}`, createdAt: now };
}

export function projectModuleBuilds(input: unknown, modules: RepositoryModule[], defaults: BuildConstraints): Record<string, BuildConstraints> | undefined {
  if (input === undefined) return undefined;
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('PROJECT_MODULE_BUILD_INVALID');
  const entries = Object.entries(input);
  if (entries.length > modules.length) throw new Error('PROJECT_MODULE_BUILD_INVALID');
  const result: Record<string, BuildConstraints> = {};
  for (const [id, value] of entries.sort(([a], [b]) => a.localeCompare(b))) {
    if (!modules.some(module => module.moduleId === id) || !value || typeof value !== 'object' || Array.isArray(value)) throw new Error('PROJECT_MODULE_BUILD_INVALID');
    Object.defineProperty(result, id, { value: buildConstraints({ ...defaults, ...value }), enumerable: true });
  }
  return entries.length ? result : undefined;
}
export function moduleBuild(project: Pick<WorkbenchProjectSnapshot, 'build' | 'moduleBuilds'>, moduleId: string): BuildConstraints {
  return buildConstraints(project.moduleBuilds && Object.hasOwn(project.moduleBuilds, moduleId) ? project.moduleBuilds[moduleId] : project.build);
}
export function moduleFingerprintKey(project: Pick<WorkbenchProjectSnapshot, 'moduleBuilds'>, moduleId: string, language: string): string {
  return project.moduleBuilds && Object.keys(project.moduleBuilds).length ? `module-${sha256(moduleId)}` : language;
}
