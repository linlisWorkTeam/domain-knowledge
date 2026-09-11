/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义项目固定输入、模块选择与声明式构建约束。
 */
import { sha256, type ArtifactRef } from '../../Domain.ts';
import type { RepositoryAnalysis, RepositoryModule } from '../sourceScan/RepositoryAnalysis.ts';
import { canonicalJson } from './StageTask.ts';

export interface BuildConstraints {
  cCompiler: 'gcc' | 'clang'; cppCompiler: 'g++' | 'clang++';
  cStandard: 'c99' | 'c11' | 'c17'; cppStandard: 'c++11' | 'c++14' | 'c++17' | 'c++20';
  includeDirectories: string[]; definitions: string[];
}
export interface ProjectSource { path: string; objectId: string; kind: 'source' | 'build'; ref: ArtifactRef }
export interface WorkbenchProjectSnapshot {
  schemaVersion: 'workbench-project-v1'; projectId: string; snapshotId: string;
  repositoryId: string; directory: string; commit: string; sourceDigest: string;
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
