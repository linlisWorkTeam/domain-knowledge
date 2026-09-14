/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：冻结模块与构建输入，先存源码工件再原子提交项目快照。
 */
import { defineProjectModules, projectModuleBuilds, buildConstraints, createProjectSnapshot, selectProjectModules, type ProjectSource } from '../../domain/workbench/WorkbenchProject.ts';
import type { ArtifactStore } from '../ports/ApplicationPorts.ts';
import type { RepositorySourceReader } from '../ports/RepositoryAnalysisPorts.ts';
import type { WorkbenchProjectStore } from '../ports/WorkbenchProjectPorts.ts';
import type { RepositoryAnalysisService } from './RepositoryAnalysis.ts';
export class WorkbenchProjects {
  readonly store: WorkbenchProjectStore;
  private readonly analysis: RepositoryAnalysisService;
  private readonly reader: RepositorySourceReader;
  private readonly artifacts: ArtifactStore;
  constructor(store: WorkbenchProjectStore, analysis: RepositoryAnalysisService,
    reader: RepositorySourceReader, artifacts: ArtifactStore) {
    this.store = store; this.analysis = analysis; this.reader = reader; this.artifacts = artifacts;
  }
  async create(request: { directory: string; revision?: string; moduleIds?: string[]; moduleDefinitions?: unknown; build?: unknown; moduleBuilds?: unknown }, signal?: AbortSignal) {
    const build = buildConstraints(request.build);
    const report = await this.analysis.analyze(request.directory, request.revision, signal);
    if (request.moduleDefinitions !== undefined && request.moduleIds !== undefined) throw new Error('PROJECT_MODULE_DEFINITION_INVALID');
    const custom = request.moduleDefinitions === undefined ? undefined : defineProjectModules(report, request.moduleDefinitions);
    const modules = custom?.modules ?? selectProjectModules(report, request.moduleIds);
    const moduleBuilds = projectModuleBuilds(request.moduleBuilds, modules, build);
    const paths = [...new Set([...modules.flatMap((module) => module.sourcePaths), ...report.files.filter((file) => file.kind === 'build').map((file) => file.path)])].sort();
    const files = await this.reader.readFiles(report.directory, report.commit, paths, signal);
    const sourceFiles: ProjectSource[] = [];
    for (const file of files) {
      signal?.throwIfAborted();
      const original = report.files.find((entry) => entry.path === file.path);
      if (!original || original.objectId !== file.objectId || !['source', 'build'].includes(original.kind)) throw new Error('PROJECT_SOURCE_CHANGED');
      sourceFiles.push({ path: file.path, objectId: file.objectId, kind: original.kind as 'source' | 'build',
        ref: await this.artifacts.put(Buffer.from(file.content), 'text/plain; charset=utf-8') });
    }
    if (files.length !== paths.length) throw new Error('PROJECT_SOURCE_INCOMPLETE');
    signal?.throwIfAborted();
    return this.store.save(createProjectSnapshot({ repositoryId: report.repositoryId, directory: report.directory,
      commit: report.commit, sourceDigest: report.sourceDigest, manifestRef: report.manifestRef, modules, ...(custom ? { moduleDefinitions: custom.definitions } : {}), build, ...(moduleBuilds ? { moduleBuilds } : {}), sourceFiles }, new Date().toISOString()));
  }
}
