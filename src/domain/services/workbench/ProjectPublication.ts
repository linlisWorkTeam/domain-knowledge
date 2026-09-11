/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：重算项目快照身份并核对固定分析清单及源文件覆盖。
 */
import { canonicalJson } from './StageTask.ts';
import { createProjectSnapshot, type WorkbenchProjectSnapshot } from './WorkbenchProject.ts';
import type { RepositoryAnalysis } from '../sourceScan/RepositoryAnalysis.ts';
export type ProjectPublicationManifest = Pick<RepositoryAnalysis, 'schemaVersion' | 'repositoryId' | 'directory' | 'commit' | 'sourceDigest' | 'files' | 'modules'>;
export function assertProjectPublication(snapshot: WorkbenchProjectSnapshot, manifest: ProjectPublicationManifest) {
  const { schemaVersion, projectId, snapshotId, createdAt, ...input } = snapshot;
  const identity = createProjectSnapshot(input, createdAt);
  if (schemaVersion !== identity.schemaVersion || projectId !== identity.projectId || snapshotId !== identity.snapshotId) throw new Error('PUBLICATION_PROJECT_IDENTITY_CHANGED');
  if (manifest.schemaVersion !== 'repository-analysis-v1' || manifest.repositoryId !== snapshot.repositoryId || manifest.directory !== snapshot.directory
    || manifest.commit !== snapshot.commit || manifest.sourceDigest !== snapshot.sourceDigest || !Array.isArray(manifest.files) || !Array.isArray(manifest.modules)
    || new Set(manifest.files.map(file => file.path)).size !== manifest.files.length) throw new Error('PUBLICATION_PROJECT_MANIFEST_CHANGED');
  for (const module of snapshot.modules) {
    const original = manifest.modules.find(item => item.moduleId === module.moduleId);
    if (!original || canonicalJson(original) !== canonicalJson(module)) throw new Error('PUBLICATION_PROJECT_MODULE_CHANGED');
  }
  const paths = [...new Set([...snapshot.modules.flatMap(module => module.sourcePaths), ...manifest.files.filter(file => file.kind === 'build').map(file => file.path)])].sort();
  if (!paths.length || new Set(snapshot.sourceFiles.map(file => file.path)).size !== snapshot.sourceFiles.length
    || canonicalJson(snapshot.sourceFiles.map(file => file.path).sort()) !== canonicalJson(paths)) throw new Error('PUBLICATION_PROJECT_FILES_CHANGED');
  for (const file of snapshot.sourceFiles) {
    const original = manifest.files.find(item => item.path === file.path);
    if (!original || original.objectId !== file.objectId || original.kind !== file.kind || original.size !== file.ref.size) throw new Error('PUBLICATION_PROJECT_FILES_CHANGED');
  }
}
