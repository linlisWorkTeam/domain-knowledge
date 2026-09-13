/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：检查补证候选是否定位冻结的目标章节，不把引用命中认作语义证据。
 */
import type { NativeBehaviorSuite } from './NativeBehaviorSuite.ts';
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
