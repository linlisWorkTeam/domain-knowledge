/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：独立执行原生案例并校验观察协议，门禁比较由Domain决定。
 */
import type { NativeLanguageToolchain, NativeToolchainInput } from '../../../application/ports/LanguageToolchainPorts.ts';
import type { NativeCaseObservation } from '../../../application/ports/NativeEvaluationPorts.ts';
export type { NativeCaseObservation } from '../../../application/ports/NativeEvaluationPorts.ts';
import { compareNativeObservations, type NativeBehaviorCase, type NativeContract, type NativeScalar } from '../../../domain/evaluation/NativeBehaviorSuite.ts';
import { nativeCaseHarness } from './NativeCaseHarness.ts';
export function parseNativeObservation(stdout: string, test: NativeBehaviorCase): Record<string, NativeScalar> {
  const fail = (): never => { throw new Error('NATIVE_OBSERVATION_INVALID'); };
  const lines = stdout.split('\n');
  if (lines.shift() !== 'WB_NATIVE_V1' || lines.pop() !== '' || lines.length !== test.observations.length) return fail();
  const output: Record<string, NativeScalar> = {};
  for (let index = 0; index < lines.length; index++) {
    const observation = test.observations[index]!; const line = lines[index]!;
    const tag = { integer: 'i', unsigned: 'u', number: 'n', boolean: 'b', string: 's' }[observation.kind];
    if (!line.startsWith(`${tag}:`)) return fail(); const raw = line.slice(2);
    let value: NativeScalar;
    if (tag === 'i' || tag === 'u') {
      if (!/^-?(?:0|[1-9][0-9]{0,19})$/.test(raw)) return fail();
      const number = BigInt(raw);
      if (number < (tag === 'u' ? 0n : -9223372036854775808n) || number > (tag === 'u' ? 18446744073709551615n : 9223372036854775807n)) return fail();
      value = number.toString();
    } else if (tag === 'n') {
      if (!/^-?(?:\d+(?:\.\d*)?)(?:e[+-]?\d+)?$/i.test(raw) || !Number.isFinite(Number(raw))) return fail();
      value = Number(raw);
    } else if (tag === 'b') { if (raw !== '0' && raw !== '1') return fail(); value = raw === '1'; }
    else {
      if (!/^(?:[a-f0-9]{2}){0,4096}$/.test(raw)) return fail();
      try { value = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(raw, 'hex')); } catch { return fail(); }
    }
    output[observation.name] = value;
  }
  return output;
}
export class NativeCaseExecutor {
  readonly native: NativeLanguageToolchain;
  constructor(native: NativeLanguageToolchain) { this.native = native; }
  async execute(input: NativeToolchainInput, contract: NativeContract, test: NativeBehaviorCase, signal?: AbortSignal): Promise<NativeCaseObservation> {
    if (input.language !== contract.language) throw new Error('NATIVE_CONTRACT_LANGUAGE_MISMATCH');
    const path = `__workbench_case.${input.language === 'c' ? 'c' : 'cpp'}`;
    if (input.files.some((file) => file.path === path)) throw new Error('NATIVE_HARNESS_PATH_CONFLICT');
    const harness = nativeCaseHarness(test, contract);
    const report = await this.native.compileAndRun({ ...input, sanitizers: true, files: [...input.files, { path, content: harness }], entryPaths: [...contract.entryPaths, path] }, signal);
    const failed = (reasonCode: string): NativeCaseObservation => ({ caseId: test.caseId, status: 'FAILED', reasonCode, actual: null, mismatches: [], report });
    if (report.build.exitCode !== 0 || report.build.timedOut || report.build.outputLimitExceeded) return failed('NATIVE_CASE_BUILD_FAILED');
    const execution = report.execution;
    if (!execution || execution.exitCode !== 0 || execution.timedOut || execution.outputLimitExceeded) return failed('NATIVE_CASE_EXECUTION_FAILED');
    let actual: Record<string, NativeScalar>;
    try { actual = parseNativeObservation(execution.stdout, test); } catch { return failed('NATIVE_OBSERVATION_INVALID'); }
    const mismatches = compareNativeObservations(test, actual);
    return { caseId: test.caseId, status: mismatches.length ? 'FAILED' : 'PASSED', reasonCode: mismatches.length ? 'NATIVE_BEHAVIOR_MISMATCH' : null, actual, mismatches, report };
  }
}
