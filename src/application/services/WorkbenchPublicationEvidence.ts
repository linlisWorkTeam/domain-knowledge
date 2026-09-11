/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：从持久化任务和卡片准备可审计发布证据，不授予已发布状态。
 */
import { assertFixedPublicationObservations } from '../../domain/services/evaluation/NativeFixedEvaluation.ts';
import type { NativeBehaviorSuite } from '../../domain/services/evaluation/NativeBehaviorSuite.ts';
import { canonicalJson } from '../../domain/services/workbench/StageTask.ts';
import type { ArtifactRef } from '../../domain/Domain.ts';
import type { ArtifactStore, FlywheelRepository } from '../ports/ApplicationPorts.ts';
import type { StageTask } from '../../domain/services/workbench/StageTask.ts';
import type { PipelineFixedSuite } from '../../domain/services/workbench/WorkbenchPipeline.ts';
import { publicationEvidence } from '../../domain/services/workbench/WorkbenchPublication.ts';
export interface PublicationTaskIds { reconstruction: string; evaluation: string; fixedEvaluation: string; sourceVerification: string }
export class WorkbenchPublicationEvidence {
  readonly dependencies: {
    stages: { get(id: string): StageTask };
    repository: Pick<FlywheelRepository, 'getKnowledgeVersion'>;
    artifacts: Pick<ArtifactStore, 'get' | 'put' | 'verify'>;
  };
  constructor(dependencies: WorkbenchPublicationEvidence['dependencies']) { this.dependencies = dependencies; }
  async prepare(ids: PublicationTaskIds, fixedSuites: PipelineFixedSuite[]) {
    const { stages, repository, artifacts } = this.dependencies;
    const reconstruction = stages.get(ids.reconstruction); const evaluation = stages.get(ids.evaluation);
    const fixedEvaluation = stages.get(ids.fixedEvaluation); const sourceVerification = stages.get(ids.sourceVerification);
    const bodies: ArtifactRef[] = [];
    const cards = reconstruction.input.cardVersionIds.map(id => {
      const card = repository.getKnowledgeVersion(id);
      if (!card || card.versionId !== id || card.metadata.projectSnapshotId !== reconstruction.input.parameters.snapshotId
        || typeof card.metadata.cardId !== 'string' || typeof card.metadata.sourceModule !== 'string') throw new Error('PUBLICATION_CARD_BINDING_CHANGED');
      bodies.push(card.bodyRef);
      return { cardId: card.metadata.cardId, versionId: id, moduleId: card.metadata.sourceModule, bodyDigest: card.bodyRef.sha256 };
    });
    const evidence = publicationEvidence({ reconstruction, evaluation, fixedEvaluation, sourceVerification, cards, fixedSuites });
    const queue: ArtifactRef[] = []; const seen = new Set<string>(); let bytes = 0;
    const collect = (value: unknown, depth = 0): void => {
      if (depth > 64) throw new Error('PUBLICATION_ARTIFACT_GRAPH_LIMIT');
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) { for (const child of value) collect(child, depth + 1); return; }
      const item = value as Record<string, unknown>;
      if ('artifactId' in item && ('sha256' in item || 'size' in item || 'mediaType' in item)) {
        if (item.artifactId !== `sha256:${item.sha256}` || !/^[a-f0-9]{64}$/.test(String(item.sha256))
          || !Number.isSafeInteger(item.size) || Number(item.size) < 0 || typeof item.mediaType !== 'string') throw new Error('PUBLICATION_ARTIFACT_REF_INVALID');
        const ref = item as unknown as ArtifactRef;
        // 大小和媒体类型也绑定，不能用同摘要的已验证项掩盖伪造引用。
        const key = JSON.stringify([ref.sha256, ref.size, ref.mediaType]);
        if (!seen.has(key)) {
          if (seen.size >= 10000) throw new Error('PUBLICATION_ARTIFACT_GRAPH_LIMIT');
          seen.add(key); queue.push(ref);
        }
        return;
      }
      for (const child of Object.values(item)) collect(child, depth + 1);
    };
    collect([reconstruction.input, reconstruction.result, evaluation.input, evaluation.result,
      fixedEvaluation.input, fixedEvaluation.result, sourceVerification.input, sourceVerification.result, bodies, fixedSuites]);
    for (let index = 0; index < queue.length; index++) {
      const ref = queue[index]!;
      bytes += ref.size;
      if (bytes > 128 * 1024 * 1024) throw new Error('PUBLICATION_ARTIFACT_GRAPH_LIMIT');
      if (!await artifacts.verify(ref)) throw new Error('PUBLICATION_ARTIFACT_CORRUPT');
      if (ref.mediaType === 'application/json') collect(JSON.parse(Buffer.from(await artifacts.get(ref)).toString('utf8')));
    }
    const load = async <T>(ref: ArtifactRef): Promise<T> => {
      if (!ref || !await artifacts.verify(ref)) throw new Error('PUBLICATION_ARTIFACT_CORRUPT');
      return JSON.parse(Buffer.from(await artifacts.get(ref)).toString('utf8')) as T;
    };
    for (const module of fixedEvaluation.result!.summary.modules as Array<Record<string, unknown>>) {
      const reportRef = module.reportRef as ArtifactRef;
      if (!fixedEvaluation.result!.artifactRefs.some(ref => ref.sha256 === reportRef?.sha256)) throw new Error('PUBLICATION_FIXED_REPORT_UNBOUND');
      const report = await load<Parameters<typeof assertFixedPublicationObservations>[1] & {
        moduleId: string; reconstructionTaskId: string; snapshotId: string; sourceDigest: string; suiteRef: ArtifactRef;
      }>(reportRef);
      const suiteRef = fixedSuites.find(item => item.moduleId === module.moduleId)!.suiteRef;
      if (report.moduleId !== module.moduleId || report.reconstructionTaskId !== reconstruction.taskId
        || report.snapshotId !== reconstruction.input.parameters.snapshotId || report.sourceDigest !== reconstruction.input.sourceDigest
        || canonicalJson(report.suiteRef) !== canonicalJson(suiteRef)) throw new Error('PUBLICATION_FIXED_REPORT_BINDING_CHANGED');
      assertFixedPublicationObservations(await load<NativeBehaviorSuite>(suiteRef), report, Number(module.total));
    }
    const prepared = { schemaVersion: 'workbench-publication-preparation-v1', state: 'PREPARED', evidence,
      verifiedArtifactRefs: queue.sort((a, b) => a.sha256.localeCompare(b.sha256)), publicationVerified: false };
    const artifactRef = await artifacts.put(Buffer.from(JSON.stringify(prepared)), 'application/json');
    return { ...prepared, artifactRef };
  }
}
