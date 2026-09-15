/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：将可信行为失败绑定当前知识章节，不把失败直接判定为知识错误。
 */
import { sha256 } from '../Domain.ts';
import { canonicalJson } from '../workbench/StageTask.ts';
import { markdownSections } from '../knowledge/KnowledgeSections.ts';
import { compareNativeObservations, type NativeBehaviorSuite, type NativeScalar } from './NativeBehaviorSuite.ts';
import { nativeOracleTrusted, type NativeTestSet } from './NativeTestCache.ts';
export const NATIVE_REVISION_EVIDENCE = 'native-revision-evidence-v1';
interface Card { cardId: string; versionId: string; body: string; bodyDigest: string }
interface Observation { caseId: string; status: 'PASSED' | 'FAILED'; actual: Record<string, NativeScalar> | null; reasonCode?: string | null }
interface Report { testSetId: string; cases: Array<Observation & { input: NativeBehaviorSuite['cases'][number] }> }
/** 失败只产生 Review 候选；没有当前章节或真实行为观察时不授权修改正文。 */
export function nativeRevisionEvidence(set: NativeTestSet, suite: NativeBehaviorSuite, oracle: Observation[], report: Report, cards: Card[]) {
  if (set.status !== 'TRUSTED' || !nativeOracleTrusted(suite, oracle)) throw new Error('REVISION_REFERENCE_NOT_TRUSTED');
  if (report.testSetId !== set.testSetId || report.cases.length !== suite.cases.length
    || new Set(report.cases.map((item) => item.caseId)).size !== suite.cases.length
    || suite.cases.some((test) => canonicalJson(report.cases.find((item) => item.caseId === test.caseId)?.input ?? null) !== canonicalJson(test))) throw new Error('REVISION_REPORT_BINDING_INVALID');
  if (new Set(cards.map((card) => card.cardId)).size !== cards.length || cards.length !== set.binding.cardIds.length
    || cards.some((card) => sha256(card.body) !== card.bodyDigest
      || set.binding.knowledgeBodyDigests[set.binding.cardIds.indexOf(card.cardId)] !== card.bodyDigest)) throw new Error('REVISION_KNOWLEDGE_BINDING_INVALID');
  const candidates = new Map<string, { cardId: string; versionId: string; bodyDigest: string; sections: Array<{ sectionId: string; heading: string; text: string; caseIds: string[] }> }>();
  const unresolved: Array<{ caseId: string; sectionId?: string; reason: string }> = [];
  let failed = 0;
  for (const test of suite.cases) {
    const observed = report.cases.find((item) => item.caseId === test.caseId)!;
    const mismatches = observed.actual === null ? [] : compareNativeObservations(test, observed.actual);
    if (observed.status === 'PASSED' && !mismatches.length && observed.actual !== null) continue;
    failed++;
    if (observed.status !== 'FAILED' || observed.reasonCode !== 'NATIVE_BEHAVIOR_MISMATCH' || observed.actual === null || !mismatches.length) {
      unresolved.push({ caseId: test.caseId, reason: 'NO_CONFIRMED_BEHAVIOR_OBSERVATION' }); continue;
    }
    if (!test.sections.length) unresolved.push({ caseId: test.caseId, reason: 'CURRENT_SECTION_REQUIRED' });
    for (const sectionId of test.sections) {
      const bindings = set.sectionBindings.filter((item) => item.sectionId === sectionId);
      const binding = bindings.length === 1 ? bindings[0] : undefined;
      const card = cards.find((item) => sectionId.startsWith(`${item.cardId}#`));
      const heading = card ? sectionId.slice(card.cardId.length + 1) : '';
      const sections = card ? markdownSections(card.body).filter((item) => item.heading === heading) : [];
      if (!card || !binding?.matchesInput || binding.versionId !== card.versionId || sections.length !== 1) {
        unresolved.push({ caseId: test.caseId, sectionId, reason: 'CURRENT_SECTION_REQUIRED' }); continue;
      }
      const candidate = candidates.get(card.cardId) ?? { cardId: card.cardId, versionId: card.versionId, bodyDigest: card.bodyDigest, sections: [] };
      const section = candidate.sections.find((item) => item.sectionId === sectionId);
      if (section) section.caseIds.push(test.caseId);
      else candidate.sections.push({ sectionId, heading, text: sections[0]!.text, caseIds: [test.caseId] });
      candidates.set(card.cardId, candidate);
    }
  }
  return { schemaVersion: NATIVE_REVISION_EVIDENCE, testSetId: set.testSetId, failed,
    candidates: [...candidates.values()], unresolved, knowledgeErrorProven: false, revisionAuthorized: false,
    nextAction: candidates.size ? 'REVIEW_CURRENT_SECTIONS' : failed ? 'RESOLVE_DIAGNOSTIC' : 'NO_BEHAVIOR_REVISION_REQUIRED' };
}
