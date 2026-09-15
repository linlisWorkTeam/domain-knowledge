/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：检查补证候选是否定位冻结的目标章节，不把引用命中认作语义证据。
 */
import { assertNativeBehaviorSuite, type NativeContract, type NativeBehaviorSuite } from './NativeBehaviorSuite.ts';
export const NATIVE_SUPPLEMENT_TARGET_POLICY = 'native-supplement-targets-v1';
export interface NativeSupplementTargets {
  contract: typeof NATIVE_SUPPLEMENT_TARGET_POLICY;
  sectionIds: string[];
}
export function nativeSupplementTargets(sectionIds: string[]): NativeSupplementTargets {
  if (!sectionIds.length || sectionIds.some(id => typeof id !== 'string' || !/^[^#\s]+#\S.*$/.test(id) || id !== id.trim())) {
    throw new Error('NATIVE_SUPPLEMENT_TARGETS_INVALID');
  }
  return { contract: NATIVE_SUPPLEMENT_TARGET_POLICY, sectionIds: [...new Set(sectionIds)].sort() };
}
export function nativeSupplementTargetCoverage(targets: NativeSupplementTargets, suite: NativeBehaviorSuite) {
  if (targets.contract !== NATIVE_SUPPLEMENT_TARGET_POLICY) throw new Error('NATIVE_SUPPLEMENT_TARGET_POLICY_INCOMPATIBLE');
  const normalized = nativeSupplementTargets(targets.sectionIds);
  if (JSON.stringify(normalized.sectionIds) !== JSON.stringify(targets.sectionIds)) throw new Error('NATIVE_SUPPLEMENT_TARGETS_INVALID');
  const citations = new Set(suite.cases.flatMap(item => item.sections));
  const matchedSectionIds = targets.sectionIds.filter(id => citations.has(id));
  const unmatchedSectionIds = targets.sectionIds.filter(id => !citations.has(id));
  return { contract: targets.contract, matchedSectionIds, unmatchedSectionIds,
    candidateEligible: matchedSectionIds.length > 0, semanticCoverageProven: false as const,
    matches: suite.cases.map(item => ({ caseId: item.caseId, sectionIds: targets.sectionIds.filter(id => item.sections.includes(id)) })) };
}

/** 外部提供的声明式候选只携带测试输入与预期，不接受运行报告或可信标志。 */
export const NATIVE_SUPPLIED_CANDIDATES = 'native-supplied-candidates-v1';
export interface NativeSuppliedCandidates {
  schemaVersion: typeof NATIVE_SUPPLIED_CANDIDATES;
  modules: Array<{ moduleId: string; suite: NativeBehaviorSuite }>;
}
export function readNativeSuppliedCandidates(value: unknown, modules: Array<{ moduleId: string; contract: NativeContract; sectionIds: string[] }>): NativeSuppliedCandidates {
  const fail = (): never => { throw new Error('NATIVE_SUPPLIED_CANDIDATES_INVALID'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const input = value as NativeSuppliedCandidates;
  if (Object.keys(input).sort().join(',') !== 'modules,schemaVersion' || input.schemaVersion !== NATIVE_SUPPLIED_CANDIDATES
    || !Array.isArray(input.modules) || !input.modules.length || input.modules.length > modules.length) return fail();
  const seen = new Set<string>();
  for (const item of input.modules) {
    if (!item || typeof item !== 'object' || Object.keys(item).sort().join(',') !== 'moduleId,suite' || seen.has(item.moduleId)) return fail();
    seen.add(item.moduleId);
    const module = modules.find(module => module.moduleId === item.moduleId);
    if (!module) return fail();
    assertNativeBehaviorSuite(item.suite, module.contract);
    if (item.suite.cases.some(test => test.sections.some(section => !module.sectionIds.includes(section)))) return fail();
  }
  return { schemaVersion: NATIVE_SUPPLIED_CANDIDATES, modules: [...input.modules].sort((a, b) => a.moduleId.localeCompare(b.moduleId)) };
}
