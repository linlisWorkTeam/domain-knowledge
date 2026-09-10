/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：声明语言工具链的独立材料、构建及原始执行报告边界。
 */
import type { BuildConstraints } from '../../domain/services/workbench/WorkbenchProject.ts';
import type { NativeDeclaration } from '../../domain/services/sourceScan/PublicInterface.ts';
export type { NativeDeclaration } from '../../domain/services/sourceScan/PublicInterface.ts';
export interface ToolchainFile { path: string; content: string }
export interface ToolchainCommandReport {
  exitCode: number | null; timedOut: boolean; outputLimitExceeded: boolean;
  durationMs: number; stdout: string; stderr: string;
}
export interface NativeToolchainInput {
  language: 'c' | 'cpp'; files: ToolchainFile[]; build: BuildConstraints; sanitizers?: boolean;
}
/** stdout和退出码是原始观察，不是可信用例数或发布门禁。 */
export interface NativeLanguageToolchain {
  compileAndRun(input: NativeToolchainInput & { entryPaths: string[]; arguments?: string[] }, signal?: AbortSignal): Promise<{ build: ToolchainCommandReport; execution: ToolchainCommandReport | null }>;
  publicInterface(input: NativeToolchainInput & { entryPath: string; symbols?: string[]; astFilter?: string }, signal?: AbortSignal): Promise<{ schemaVersion: 'native-interface-v1'; language: 'c' | 'cpp'; sourcePath: string; astFilter: string | null; declarations: NativeDeclaration[] }>;
}

/** 既有TypeScript模块输入，与原生输入共享案例执行端口，保持语言专属约束。 */
export interface TypeScriptModuleInput {
  label: string;
  snapshot: import('./ApplicationPorts.ts').ProjectSnapshot;
  generatedFiles: import('./ApplicationPorts.ts').GeneratedProjectFile[];
  moduleSuite: import('../../domain/agents/testGenAgent/ModuleBehaviorSuite.ts').ModuleBehaviorSuite;
  moduleContract?: { modulePath: string; exportName: string; signature: string };
}
export interface NativeCaseInput {
  language: 'c' | 'cpp'; input: NativeToolchainInput;
  contract: import('../../domain/services/evaluation/NativeBehaviorSuite.ts').NativeContract;
  test: import('../../domain/services/evaluation/NativeBehaviorSuite.ts').NativeBehaviorCase;
}
export interface TypeScriptCaseInput { language: 'typescript'; input: TypeScriptModuleInput }
export interface LanguageCaseReport<L extends string, T> {
  schemaVersion: 'language-case-report-v1'; language: L; passed: boolean; testsPassed: number; testsTotal: number; detail: T;
}
export type NativeCaseReport = LanguageCaseReport<'c' | 'cpp', import('./NativeEvaluationPorts.ts').NativeCaseObservation>;
export type TypeScriptCaseReport = LanguageCaseReport<'typescript', import('./ApplicationPorts.ts').ProjectEvaluation>;
export interface LanguageCaseToolchain {
  evaluate(input: NativeCaseInput, signal?: AbortSignal): Promise<NativeCaseReport>;
  evaluate(input: TypeScriptCaseInput, signal?: AbortSignal): Promise<TypeScriptCaseReport>;
}
