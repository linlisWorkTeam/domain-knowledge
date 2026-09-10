/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：声明原生观察、工具链身份与不可变测试集持久化端口。
 */
import type { NativeBehaviorCase, NativeContract, NativeScalar } from '../../domain/services/evaluation/NativeBehaviorSuite.ts';
import type { NativeTestSet } from '../../domain/services/evaluation/NativeTestCache.ts';
import type { BuildConstraints } from '../../domain/services/workbench/WorkbenchProject.ts';
import type { NativeLanguageToolchain, NativeToolchainInput } from './LanguageToolchainPorts.ts';
export interface NativeCaseObservation {
  caseId: string; status: 'PASSED' | 'FAILED'; reasonCode: string | null;
  actual: Record<string, NativeScalar> | null; mismatches: string[];
  report: Awaited<ReturnType<NativeLanguageToolchain['compileAndRun']>>;
}
export interface NativeCaseRunner {
  execute(input: NativeToolchainInput, contract: NativeContract, test: NativeBehaviorCase, signal?: AbortSignal): Promise<NativeCaseObservation>;
}
export interface NativeFingerprintRecord {
  schemaVersion: 'native-toolchain-v1'; language: 'c' | 'cpp'; build: BuildConstraints;
  architecture: string; files: Array<{ path: string; resolved: string; sha256: string }>; digest: string;
}
export type NativeSnapshotter = (language: 'c' | 'cpp', build: BuildConstraints, signal?: AbortSignal) => Promise<NativeFingerprintRecord>;
export interface NativeTestStore {
  get(testSetId: string): NativeTestSet | null;
  trusted(cacheKey: string): NativeTestSet | null;
  lineage(cardIds: string[]): NativeTestSet[];
  head(referenceKey: string): NativeTestSet | null;
  save(record: NativeTestSet): NativeTestSet;
}
