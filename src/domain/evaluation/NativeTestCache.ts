/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义原生可信用例身份与参考晋升规则，知识变化不修改旧预期。
 */
import { sha256, type ArtifactRef } from '../Domain.ts';
import { canonicalJson } from '../workbench/StageTask.ts';
import { compareNativeObservations, type NativeBehaviorSuite, type NativeScalar } from './NativeBehaviorSuite.ts';
export interface NativeTestBinding {
  gateDigest?: string; cardIds: string[]; knowledgeBodyDigests: string[]; referenceDigest: string; interfaceDigest: string; policyDigest: string; toolchainDigest: string;
}
export interface NativeTestSet {
  inheritedTestSetIds?: string[]; testSetId: string; cacheKey: string; referenceKey: string; parentTestSetId: string | null;
  originVersionIds: string[]; sourceRevision: string; projectSnapshotId: string; binding: NativeTestBinding; status: 'TRUSTED' | 'REJECTED';
  suiteRef: ArtifactRef; oracleRef: ArtifactRef; referenceRef: ArtifactRef; fingerprintRef: ArtifactRef; createdAt: string;
  sectionBindings: Array<{ sectionId: string; versionId: string; matchesInput: boolean }>;
}
export function nativeTestKeys(binding: NativeTestBinding): { cacheKey: string; referenceKey: string } {
  const { knowledgeBodyDigests, cardIds, gateDigest, ...reference } = binding;
  if (!Array.isArray(knowledgeBodyDigests) || !knowledgeBodyDigests.length || knowledgeBodyDigests.length > 200
    || !Array.isArray(cardIds) || cardIds.length !== knowledgeBodyDigests.length || new Set(cardIds).size !== cardIds.length
    || cardIds.some((id) => typeof id !== 'string' || !/^[A-Za-z0-9:_-]{1,160}$/.test(id))
    || (gateDigest !== undefined && !/^[a-f0-9]{64}$/.test(gateDigest))
    || [...knowledgeBodyDigests, ...Object.values(reference)].some((digest) => typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest))) throw new Error('NATIVE_TEST_BINDING_INVALID');
  return { cacheKey: sha256(canonicalJson({ ...reference, ...(gateDigest ? { gateDigest } : {}), knowledge: cardIds.map((cardId, index) => ({ cardId, bodyDigest: knowledgeBodyDigests[index] })).sort((a, b) => a.cardId.localeCompare(b.cardId)) })),
    referenceKey: sha256(canonicalJson({ ...reference, cardIds: [...cardIds].sort() })) };
}
export function nativeOracleTrusted(suite: NativeBehaviorSuite, observations: Array<{ caseId: string; status: 'PASSED' | 'FAILED'; actual: Record<string, NativeScalar> | null }>): boolean {
  return suite.cases.length > 0 && observations.length === suite.cases.length && new Set(observations.map((item) => item.caseId)).size === observations.length
    && suite.cases.every((test) => {
      const observation = observations.find((item) => item.caseId === test.caseId);
      return observation?.status === 'PASSED' && observation.actual !== null && compareNativeObservations(test, observation.actual).length === 0;
    });
}
