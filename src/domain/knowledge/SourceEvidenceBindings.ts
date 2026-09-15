/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：显式区分仓库清单摘要与单文件内容摘要，为来源核验提供冻结对应关系。
 */
import type { WorkbenchProjectSnapshot } from '../workbench/WorkbenchProject.ts';
export const SOURCE_EVIDENCE_POLICY = 'source-evidence-bindings-v1';
export function sourceEvidenceBindings(policy: unknown, project: WorkbenchProjectSnapshot, moduleId: string) {
  if (policy === undefined) return undefined;
  if (policy !== SOURCE_EVIDENCE_POLICY) throw new Error('SOURCE_EVIDENCE_POLICY_INVALID');
  const module = project.modules.find(module => module.moduleId === moduleId);
  const files = project.sourceFiles.filter(file => file.kind === 'source' && module?.sourcePaths.includes(file.path));
  if (!module || !files.length) throw new Error('SOURCE_EVIDENCE_MODULE_INVALID');
  return { schemaVersion: SOURCE_EVIDENCE_POLICY, snapshotId: project.snapshotId, commit: project.commit,
    repositoryFileManifest: { sourceDigest: project.sourceDigest, manifestRef: structuredClone(project.manifestRef) },
    sourceFiles: files.map(file => ({ path: file.path, objectId: file.objectId, artifactRef: structuredClone(file.ref) })),
    explanation: 'sourceDigest 标识仓库分析的文件清单，不是某一个源码文件的内容哈希。正文若列出源码工件 sha256，应与相应 sourceFiles[].artifactRef.sha256 比较；清单摘要与单文件摘要不同本身不表示来源冲突。仍须检查路径、提交及具体摘要断言，不能忽略实际不匹配。' };
}
