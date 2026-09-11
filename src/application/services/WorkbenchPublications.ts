/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：将完整证据准备提交为可恢复的独立本地知识发布。
 */
import { assertArtifactRef, type ArtifactRef } from '../../domain/Domain.ts';
import { assertPublicationRecord, createPublication, type PublicationFile } from '../../domain/services/workbench/WorkbenchPublicationRecord.ts';
import { cardIndexHeader } from '../../domain/services/knowledge/KnowledgeIndex.ts';
import type { KnowledgeIndexStore } from '../ports/KnowledgeIndexPorts.ts';
import type { WorkbenchPublicationFiles, WorkbenchPublicationStore } from '../ports/WorkbenchPublicationPorts.ts';
import type { WorkbenchPublicationEvidence, PublicationTaskIds } from './WorkbenchPublicationEvidence.ts';
import type { PipelineFixedSuite } from '../../domain/services/workbench/WorkbenchPipeline.ts';
export class WorkbenchPublications {
  readonly dependencies: { evidence: WorkbenchPublicationEvidence; store: WorkbenchPublicationStore; files: WorkbenchPublicationFiles; render: Pick<KnowledgeIndexStore, 'render'> };
  private closing = false;
  private readonly active = new Set<Promise<unknown>>();
  private track<T>(work: Promise<T>): Promise<T> { this.active.add(work); void work.then(() => this.active.delete(work), () => this.active.delete(work)); return work; }
  get idle() { return this.active.size === 0 && this.pending.size === 0; }
  async shutdown() { this.closing = true; await Promise.allSettled([...this.active, ...this.pending.values()]); }
  private readonly pending = new Map<string, Promise<ReturnType<WorkbenchPublicationStore['commit']>>>();
  constructor(dependencies: WorkbenchPublications['dependencies']) { this.dependencies = dependencies; }
  get(id: string) { const value = this.dependencies.store.get(id); if (!value) throw new Error('PUBLICATION_NOT_FOUND'); return value; }
  list(projectId?: string, versionId?: string) {
    return this.dependencies.store.list(projectId).filter(record => !versionId || record.versionIds.includes(versionId));
  }
  async detail(id: string) {
    const publication = this.get(id);
    return { publication, publicationVerified: publication.status === 'COMMITTED', filesAvailable: await this.dependencies.files.verify(publication) };
  }
  async artifact(id: string, digest: string) {
    const record = this.get(id); const file = record.files.find(value => value.ref.sha256 === digest);
    if (!file) throw new Error('PUBLICATION_ARTIFACT_NOT_FOUND');
    const artifacts = this.dependencies.evidence.dependencies.artifacts;
    if (!await artifacts.verify(file.ref)) throw new Error('PUBLICATION_ARTIFACT_CORRUPT');
    return { ...file, bytes: await artifacts.get(file.ref) };
  }
  async publishFromTasks(ids: PublicationTaskIds) {
    if (this.closing) throw new Error('PUBLICATION_SHUTDOWN');
    const task = this.dependencies.evidence.dependencies.stages.get(ids.fixedEvaluation);
    const refs = task.input.parameters.suiteRefs;
    if (!refs || typeof refs !== 'object' || Array.isArray(refs)) throw new Error('PUBLICATION_FIXED_SUITES_REQUIRED');
    const suites = Object.entries(refs).map(([moduleId, value]) => {
      const suiteRef = value as unknown as ArtifactRef;
      if (!suiteRef || typeof suiteRef !== 'object') throw new Error('PUBLICATION_FIXED_SUITES_REQUIRED');
      assertArtifactRef(suiteRef); return { moduleId, suiteRef };
    });
    return this.publish(ids, suites);
  }
  async publish(ids: PublicationTaskIds, suites: PipelineFixedSuite[]) {
    if (this.closing) throw new Error('PUBLICATION_SHUTDOWN');
    return this.track(this.prepareAndPublish(ids, suites));
  }
  private async prepareAndPublish(ids: PublicationTaskIds, suites: PipelineFixedSuite[]) {
    const prepared = await this.dependencies.evidence.prepare(ids, suites);
    const { artifacts, repository } = this.dependencies.evidence.dependencies;
    const files: PublicationFile[] = [{ path: 'evidence.json', ref: prepared.artifactRef }];
    for (const binding of prepared.evidence.cards) {
      const card = repository.getKnowledgeVersion(binding.versionId);
      if (!card || card.bodyRef.sha256 !== binding.bodyDigest || card.metadata.cardId !== binding.cardId || !await artifacts.verify(card.bodyRef)) throw new Error('PUBLICATION_CARD_BINDING_CHANGED');
      const body = Buffer.from(await artifacts.get(card.bodyRef)).toString('utf8');
      const document = this.dependencies.render.render(cardIndexHeader(binding.cardId, card, body), body);
      files.push({ path: `cards/${binding.cardId}.md`, ref: await artifacts.put(Buffer.from(document.markdown), 'text/markdown') });
    }
    const manifest = { schemaVersion: 'workbench-publication-manifest-v1', projectId: prepared.evidence.projectId, preparationRef: prepared.artifactRef,
      cards: prepared.evidence.cards, files: [...files] };
    files.push({ path: 'manifest.json', ref: await artifacts.put(Buffer.from(JSON.stringify(manifest)), 'application/json') });
    const record = this.dependencies.store.insert(createPublication({ projectId: prepared.evidence.projectId, versionIds: prepared.evidence.cards.map(card => card.versionId), preparationRef: prepared.artifactRef, files }, new Date().toISOString()));
    return this.resumeAccepted(record.publicationId);
  }
  async resume(id: string) {
    if (this.closing) throw new Error('PUBLICATION_SHUTDOWN');
    return this.track(this.resumeAccepted(id));
  }
  private async resumeAccepted(id: string) {
    const prior = this.pending.get(id); if (prior) return prior;
    const work = this.finish(id); this.pending.set(id, work);
    try { return await work; } finally { this.pending.delete(id); }
  }
  private async finish(id: string) {
    const { store, files, evidence } = this.dependencies; const record = this.get(id); assertPublicationRecord(record);
    try {
      for (const ref of [record.preparationRef, ...record.files.map(file => file.ref)]) if (!await evidence.dependencies.artifacts.verify(ref)) throw new Error('PUBLICATION_ARTIFACT_CORRUPT');
      await files.publish(record);
      if (!await files.verify(record)) throw new Error('PUBLICATION_FILES_INVALID');
      return store.commit(id);
    } catch (error) {
      const code = error instanceof Error ? /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : 'PUBLICATION_EXPORT_FAILED' : 'PUBLICATION_EXPORT_FAILED';
      store.fail(id, code); throw error;
    }
  }
}
