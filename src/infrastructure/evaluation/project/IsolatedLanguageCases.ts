/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：将多语言案例交给既有隔离执行器，保留原始报告和门禁语义。
 */
import type { ArtifactStore } from '../../../application/ports/ApplicationPorts.ts';
import type { LanguageCaseToolchain, NativeCaseInput, TypeScriptCaseInput, NativeCaseReport, TypeScriptCaseReport } from '../../../application/ports/LanguageToolchainPorts.ts';
import type { NativeCaseRunner } from '../../../application/ports/NativeEvaluationPorts.ts';
import { evaluateModuleSuite } from './ModuleCaseExecutor.ts';
import { NativeCaseExecutor } from './NativeCaseExecutor.ts';
import { NativeToolchain } from './NativeToolchain.ts';
export class IsolatedLanguageCases implements LanguageCaseToolchain, NativeCaseRunner {
  readonly artifacts: ArtifactStore;
  readonly native: NativeCaseRunner;
  readonly typescript: typeof evaluateModuleSuite;
  constructor(artifacts: ArtifactStore, native: NativeCaseRunner = new NativeCaseExecutor(new NativeToolchain()), typescript = evaluateModuleSuite) {
    this.artifacts = artifacts; this.native = native; this.typescript = typescript;
  }
  evaluate(input: NativeCaseInput, signal?: AbortSignal): Promise<NativeCaseReport>;
  evaluate(input: TypeScriptCaseInput, signal?: AbortSignal): Promise<TypeScriptCaseReport>;
  async evaluate(request: NativeCaseInput | TypeScriptCaseInput, signal?: AbortSignal): Promise<NativeCaseReport | TypeScriptCaseReport> {
    if (request.language === 'typescript') {
      const detail = await this.typescript(this.artifacts, request.input, signal);
      return { schemaVersion: 'language-case-report-v1', language: request.language, passed: detail.passed,
        testsPassed: detail.testsPassed, testsTotal: detail.testsTotal, detail };
    }
    if (!['c', 'cpp'].includes(request.language) || request.input.language !== request.language || request.contract.language !== request.language) throw new Error('LANGUAGE_CASE_INPUT_INVALID');
    const detail = await this.native.execute(request.input, request.contract, request.test, signal);
    return { schemaVersion: 'language-case-report-v1', language: request.language, passed: detail.status === 'PASSED',
      testsPassed: detail.status === 'PASSED' ? 1 : 0, testsTotal: 1, detail };
  }
  async execute(...args: Parameters<NativeCaseRunner['execute']>) {
    const [input, contract, test, signal] = args;
    return (await this.evaluate({ language: input.language, input, contract, test }, signal)).detail;
  }
}
