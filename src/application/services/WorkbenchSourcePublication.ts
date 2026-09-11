/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：逐卡逐章重读来源Review原始证据并要求正文完整覆盖。
 */
import { sha256, type ArtifactRef } from '../../domain/Domain.ts';
import type { AgentCommand, AgentResult } from '../../domain/agents/AgentContracts.ts';
import type { Output as ReviewOutput } from '../../domain/agents/reviewAgent/ReviewAgentContract.ts';
import { assertSourcePublicationSection } from '../../domain/services/knowledge/SourcePublication.ts';
import type { WorkbenchProjectSnapshot } from '../../domain/services/workbench/WorkbenchProject.ts';
import type { NativeTestSet } from '../../domain/services/evaluation/NativeTestCache.ts';
import type { NativeBehaviorSuite } from '../../domain/services/evaluation/NativeBehaviorSuite.ts';
import { SOURCE_VERIFICATION_CONTRACT, sourceSectionObservations, sourceSectionsOutcome, type SourceCardBinding, type SourceCardOutcome } from '../../domain/services/knowledge/KnowledgeSourceVerification.ts';
import { markdownSections } from '../../domain/services/knowledge/KnowledgeSections.ts';
import { canonicalJson, type StageTask } from '../../domain/services/workbench/StageTask.ts';
import type { AgentContractValidator, ArtifactStore } from '../ports/ApplicationPorts.ts';
interface Section extends SourceCardBinding {
  section: string; outcome: SourceCardOutcome; carriedForward?: boolean; originEvidence?: unknown;
  reviewRef: ArtifactRef; reviewResultRef: ArtifactRef; referenceRef: ArtifactRef; referenceObservationsRef: ArtifactRef; criteriaRef: ArtifactRef;
}
export class WorkbenchSourcePublication {
  readonly dependencies: { artifacts: Pick<ArtifactStore, 'get' | 'verify'>; contracts: AgentContractValidator };
  constructor(dependencies: WorkbenchSourcePublication['dependencies']) { this.dependencies = dependencies; }
  async verify(task: StageTask, cards: Array<SourceCardBinding & { bodyRef: ArtifactRef }>, project: WorkbenchProjectSnapshot, sourceModules: Record<string, string>, sets: Array<{ moduleId: string; set: NativeTestSet }>) {
    const { artifacts, contracts } = this.dependencies;
    const load = async <T>(ref: ArtifactRef): Promise<T> => {
      if (!ref || !await artifacts.verify(ref)) throw new Error('PUBLICATION_SOURCE_ARTIFACT_CORRUPT');
      return JSON.parse(Buffer.from(await artifacts.get(ref)).toString('utf8')) as T;
    };
    const results = task.result?.summary.cards as unknown as Array<SourceCardBinding & { sections: Section[] }>;
    if (!Array.isArray(results) || results.length !== cards.length || new Set(results.map(card => card.versionId)).size !== results.length || new Set(cards.map(card => card.versionId)).size !== cards.length) throw new Error('PUBLICATION_SOURCE_COVERAGE_INVALID');
    for (const card of cards) {
      if (!await artifacts.verify(card.bodyRef)) throw new Error('PUBLICATION_SOURCE_ARTIFACT_CORRUPT');
      const body = Buffer.from(await artifacts.get(card.bodyRef)).toString('utf8');
      const result = results.find(item => item.versionId === card.versionId);
      if (!result || !Array.isArray(result.sections) || sourceSectionsOutcome(body, result.sections) !== 'SOURCE_MATCHED') throw new Error('PUBLICATION_SOURCE_COVERAGE_INVALID');
      const headings = markdownSections(body).map(item => item.heading);
      const { bodyRef: _bodyRef, ...binding } = card;
      for (const section of result.sections) {
        if (section.carriedForward || section.originEvidence || canonicalJson({ cardId: section.cardId, versionId: section.versionId, moduleId: section.moduleId, bodyDigest: section.bodyDigest }) !== canonicalJson(binding)) throw new Error('PUBLICATION_SOURCE_SECTION_CHANGED');
        for (const ref of [section.reviewRef, section.reviewResultRef, section.referenceRef, section.referenceObservationsRef, section.criteriaRef]) {
          if (!ref || !task.result!.artifactRefs.some(item => item.sha256 === ref.sha256)) throw new Error('PUBLICATION_SOURCE_ARTIFACT_UNBOUND');
        }
        const module = project.modules.find(item => item.moduleId === sourceModules[card.versionId]);
        const set = sets.find(item => item.moduleId === sourceModules[card.versionId])?.set;
        if (!module || !set) throw new Error('PUBLICATION_SOURCE_MODULE_UNBOUND');
        const sources = project.sourceFiles.filter(file => file.kind === 'source' && module.sourcePaths.includes(file.path));
        const reference = await load<{ schemaVersion: string; sourceRevision: string; sourceDigest: string; files: Array<{ path: string; content: string }> }>(section.referenceRef);
        if (!sources.length || reference.schemaVersion !== SOURCE_VERIFICATION_CONTRACT || reference.sourceRevision !== project.commit
          || reference.sourceDigest !== project.sourceDigest || !Array.isArray(reference.files)
          || canonicalJson(reference.files.map(file => ({ path: file.path, digest: sha256(file.content) })).sort((a, b) => a.path.localeCompare(b.path)))
            !== canonicalJson(sources.map(file => ({ path: file.path, digest: file.ref.sha256 })).sort((a, b) => a.path.localeCompare(b.path)))) throw new Error('PUBLICATION_SOURCE_REFERENCE_CHANGED');
        const suite = await load<NativeBehaviorSuite>(set.suiteRef);
        const oracle = await load<Parameters<typeof sourceSectionObservations>[1]>(set.oracleRef);
        const observations = await load<unknown>(section.referenceObservationsRef);
        const expectedObservations = { schemaVersion: 'native-source-review-evidence-v3', sourceRevision: project.commit, sourceDigest: project.sourceDigest,
          suiteRef: set.suiteRef, oracleRef: set.oracleRef, ...sourceSectionObservations(suite, oracle, card.cardId, section.section) };
        // 真实参考观察可能含大整数及完整suite，比较JSON内容而非受256KiB输入上限限制的canonicalJson。
        if (JSON.stringify(observations) !== JSON.stringify(expectedObservations)) throw new Error('PUBLICATION_SOURCE_OBSERVATIONS_CHANGED');
        const raw = await load<ReviewOutput>(section.reviewRef), envelope = await load<AgentResult>(section.reviewResultRef);
        contracts.assertResult(envelope);
        const command = await load<AgentCommand>(envelope.commandRef); contracts.assertCommand(command);
        const criteria = await load<Record<string, unknown>>(section.criteriaRef);
        assertSourcePublicationSection({ taskId: task.taskId, card: binding, body, section: section.section, first: headings[0] === section.section,
          raw, rawRef: section.reviewRef, result: envelope, command, criteria, criteriaRef: section.criteriaRef,
          referenceRef: section.referenceRef, observationsRef: section.referenceObservationsRef });
      }
    }
  }
}
