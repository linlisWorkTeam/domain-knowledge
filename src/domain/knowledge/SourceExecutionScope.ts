/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：绑定参考测试实际使用的构建与工具链，只声明本次配置范围。
 */
import { sha256 } from '../Domain.ts';
import { nativeTestKeys, type NativeTestSet } from '../evaluation/NativeTestCache.ts';
import { buildConstraints, type BuildConstraints } from '../workbench/WorkbenchProject.ts';
import { canonicalJson } from '../workbench/StageTask.ts';
export const SOURCE_EXECUTION_SCOPE = 'source-execution-scope-v1';
interface ReferenceBuild { language: 'c' | 'cpp'; build: BuildConstraints; sanitizers: boolean }
interface ToolchainRecord { schemaVersion: string; language: 'c' | 'cpp'; build: BuildConstraints; architecture: string; digest: string }
/** Application must verify the referenced CAS artifacts and their trusted oracle before calling. */
export function sourceExecutionScope(set: NativeTestSet, reference: ReferenceBuild, toolchain: ToolchainRecord, expectedBuild: BuildConstraints) {
  const keys = nativeTestKeys(set.binding);
  if (set.status !== 'TRUSTED' || keys.cacheKey !== set.cacheKey || keys.referenceKey !== set.referenceKey
    || sha256(JSON.stringify(reference)) !== set.binding.referenceDigest
    || toolchain.schemaVersion !== 'native-toolchain-v1' || toolchain.digest !== set.binding.toolchainDigest
    || !['c', 'cpp'].includes(reference.language) || reference.language !== toolchain.language
    || !toolchain.architecture?.trim() || reference.sanitizers !== true
    || canonicalJson(reference.build) !== canonicalJson(buildConstraints(expectedBuild))
    || canonicalJson(toolchain.build) !== canonicalJson(reference.build)) throw new Error('SOURCE_EXECUTION_BINDING_INVALID');
  return { schemaVersion: SOURCE_EXECUTION_SCOPE, testSetId: set.testSetId, sourceRevision: set.sourceRevision,
    projectSnapshotId: set.projectSnapshotId, language: reference.language, build: structuredClone(reference.build),
    architecture: toolchain.architecture, toolchainDigest: toolchain.digest,
    referenceRef: structuredClone(set.referenceRef), fingerprintRef: structuredClone(set.fingerprintRef),
    configurationCoverage: 'SINGLE_FROZEN_BUILD' as const, allMacroCombinationsVerified: false as const,
    compilerPredefinedMacrosEnumerated: false as const, publicationVerified: false as const };
}
