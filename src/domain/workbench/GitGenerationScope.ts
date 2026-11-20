/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：比较固定 Git 输入并计算知识生成的模块范围。
 */
import { canonicalJson } from './StageTask.ts';
import { moduleBuild, type WorkbenchProjectSnapshot } from './WorkbenchProject.ts';

export interface GenerationScope { entryPath?: string; astFilter?: string; symbols?: string[] }

export function isGitRevision(revision: string): boolean {
  return /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(revision);
}

/** 比较已冻结文件的 Git blob 身份，支持增删改，重命名按删除和新增处理。 */
export function gitGenerationScope(
  base: WorkbenchProjectSnapshot,
  target: WorkbenchProjectSnapshot,
  baseScopes: Record<string, GenerationScope>,
  targetScopes: Record<string, GenerationScope>,
  configurationChanged: boolean,
) {
  if (base.projectId !== target.projectId || base.repositoryId !== target.repositoryId) {
    throw new Error('GENERATION_BASE_PROJECT_MISMATCH');
  }
  if (!isGitRevision(base.commit) || !isGitRevision(target.commit)) throw new Error('GENERATION_GIT_REQUIRED');

  const before = new Map(base.sourceFiles.map(file => [file.path, file]));
  const after = new Map(target.sourceFiles.map(file => [file.path, file]));
  const changedPaths = new Set([...new Set([...before.keys(), ...after.keys()])].filter(path => {
    const previous = before.get(path), current = after.get(path);
    return previous?.objectId !== current?.objectId || previous?.kind !== current?.kind;
  }));
  // 现有接口提取可读取整个快照，缺少完整 include 依赖图时共享输入保守扩大范围。
  const sharedInputsChanged = [...changedPaths].some(path =>
    before.get(path)?.kind === 'build' || after.get(path)?.kind === 'build' || !/\.(?:c|cc|cpp|cxx)$/i.test(path));
  const previousModules = new Map(base.modules.map(module => [module.moduleId, module]));
  const targetIds = new Set(target.modules.map(module => module.moduleId));
  const scopeFor = (scopes: Record<string, GenerationScope>, id: string) => Object.hasOwn(scopes, id) ? scopes[id] : {};
  const moduleIds = target.modules.filter(module => {
    const id = module.moduleId;
    const previous = previousModules.get(id);
    return configurationChanged || sharedInputsChanged || !previous || previous.language !== module.language
      || canonicalJson([...previous.sourcePaths].sort()) !== canonicalJson([...module.sourcePaths].sort())
      || module.sourcePaths.some(path => changedPaths.has(path))
      || canonicalJson(moduleBuild(base, id)) !== canonicalJson(moduleBuild(target, id))
      || canonicalJson(scopeFor(baseScopes, id)) !== canonicalJson(scopeFor(targetScopes, id));
  }).map(module => module.moduleId).sort();
  return {
    moduleIds,
    removedModuleIds: [...previousModules.keys()].filter(id => !targetIds.has(id)).sort(),
    changedFileCount: changedPaths.size,
    sharedInputsChanged,
    configurationChanged,
  };
}
