/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：逐卡逐章重读来源Review原始证据并要求正文完整覆盖。
 */
import type { ArtifactRef } from '../../domain/Domain.ts';
import type { AgentCommand, AgentResult } from '../../domain/agents/AgentContracts.ts';
import type { Output as ReviewOutput } from '../../domain/agents/reviewAgent/ReviewAgentContract.ts';
import { assertSourcePublicationSection } from '../../domain/services/knowledge/SourcePublication.ts';
import { sourceSectionsOutcome, type SourceCardBinding, type SourceCardOutcome } from '../../domain/services/knowledge/KnowledgeSourceVerification.ts';
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
  async verify(task: StageTask, cards: Array<SourceCardBinding & { bodyRef: ArtifactRef }>) {
    const { artifacts, contracts } = this.dependencies;
    const load = async <T>(ref: ArtifactRef): Promise<T> => {
      if (!ref || !await artifacts.verify(ref)) throw new Error('PUBLICATION_SOURCE_ARTIFACT_CORRUPT');
      return JSON.parse(Buffer.from(await artifacts.get(ref)).toString('utf8')) as T;
    };
    const results = task.result?.summary.cards as unknown as Array<SourceCardBinding & { sections: Section[] }>;
    if (!Array.isArray(results) || results.length !== cards.length) throw new Error('PUBLICATION_SOURCE_COVERAGE_INVALID');
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
