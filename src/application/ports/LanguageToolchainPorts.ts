/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：声明语言工具链的独立材料、构建及原始执行报告边界。
 */
import type { BuildConstraints } from '../../domain/services/workbench/WorkbenchProject.ts';
export interface ToolchainFile { path: string; content: string }
export interface ToolchainCommandReport {
  exitCode: number | null; timedOut: boolean; outputLimitExceeded: boolean;
  durationMs: number; stdout: string; stderr: string;
}
export interface NativeToolchainInput {
  language: 'c' | 'cpp'; files: ToolchainFile[]; build: BuildConstraints;
}
export interface NativeDeclaration {
  kind: string; name: string; type?: string;
  static?: boolean;
  parameters?: Array<{ name: string; type: string }>;
  fields?: Array<{ name: string; type: string }>;
  values?: Array<{ name: string; value: string }>;
  members?: NativeDeclaration[];
}
/** stdout和退出码是原始观察，不是可信用例数或发布门禁。 */
export interface NativeLanguageToolchain {
  compileAndRun(input: NativeToolchainInput & { entryPaths: string[]; arguments?: string[] }, signal?: AbortSignal): Promise<{ build: ToolchainCommandReport; execution: ToolchainCommandReport | null }>;
  publicInterface(input: NativeToolchainInput & { entryPath: string; symbols: string[]; astFilter?: string }, signal?: AbortSignal): Promise<{ schemaVersion: 'native-interface-v1'; language: 'c' | 'cpp'; sourcePath: string; astFilter: string | null; declarations: NativeDeclaration[] }>;
}
