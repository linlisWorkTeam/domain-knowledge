/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：合并历史可信门禁，保留所有不同输入与预期并提供稳定摘要。
 */
import { sha256 } from '../Domain.ts';
import { canonicalJson } from '../workbench/StageTask.ts';
import type { NativeBehaviorCase, NativeBehaviorSuite } from './NativeBehaviorSuite.ts';
/** 容量不足保留所需容量，供候选拒绝反馈；不能删除历史门禁来腾出空间。 */
export class NativeTrustedGateLimit extends Error {
  readonly maximumCases = 64;
  readonly requiredCases: number;
  constructor(requiredCases: number) { super('NATIVE_TRUSTED_GATE_LIMIT'); this.requiredCases = requiredCases; }
}
export function nativeTrustedGates(suites: NativeBehaviorSuite[]) {
  const unique = new Map<string, NativeBehaviorCase>();
  for (const suite of suites) for (const sample of suite.cases) {
    const { caseId: _id, ...content } = sample;
    const key = canonicalJson(content);
    if (!unique.has(key)) unique.set(key, structuredClone(sample));
  }
  if (unique.size > 64) throw new NativeTrustedGateLimit(unique.size);
  const entries = [...unique].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const names = new Set<string>();
  for (const [key, sample] of entries) {
    if (names.has(sample.caseId)) sample.caseId = `gate_${sha256(key)}`;
    if (names.has(sample.caseId)) throw new Error('NATIVE_TRUSTED_GATE_ID_CONFLICT');
    names.add(sample.caseId);
  }
  return { suite: { schemaVersion: 'native-cases-v1', cases: entries.map(([, sample]) => sample) } as NativeBehaviorSuite,
    digest: sha256(canonicalJson({ contract: 'native-trusted-gates-v1', cases: entries.map(([key]) => key) })) };
}

/** Supplementation must not turn a renamed assertion into permission to change its oracle. */
export function nativeSupplementGates(history: NativeBehaviorSuite[], candidate: NativeBehaviorSuite) {
  const expectations = new Map<string, string>();
  const identity = (sample: NativeBehaviorCase) => canonicalJson({ variables: sample.variables, calls: sample.calls, observations: sample.observations });
  for (const suite of history) for (const sample of suite.cases) {
    const key = identity(sample), expected = canonicalJson(sample.expected);
    if (expectations.has(key) && expectations.get(key) !== expected) throw new Error('NATIVE_TRUSTED_EXPECTATION_CONFLICT');
    expectations.set(key, expected);
  }
  for (const sample of candidate.cases) {
    const key = identity(sample), expected = canonicalJson(sample.expected);
    if (expectations.has(key) && expectations.get(key) !== expected) throw new Error('NATIVE_SUPPLEMENT_EXPECTATION_CONFLICT');
    expectations.set(key, expected);
  }
  return nativeTrustedGates([...history, candidate]);
}
