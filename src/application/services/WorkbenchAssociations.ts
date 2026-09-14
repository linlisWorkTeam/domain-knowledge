/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：协调冻结卡片的关联任务、恢复工件与失效过滤。
 */
import { sha256, type ArtifactRef } from '../../domain/Domain.ts';
import { AssociationDomainService } from '../../domain/association/AssociationDomainService.ts';
import { type AssociationCard, type CardAssociation } from '../../domain/association/CardAssociations.ts';
import { cardIndexSourceDigest } from '../../domain/knowledge/KnowledgeIndex.ts';
import { groupKnowledgeCards } from '../../domain/knowledge/KnowledgeCards.ts';
import { canonicalJson, type StageInput } from '../../domain/workbench/StageTask.ts';
import type { ArtifactStore, FlywheelRepository } from '../ports/ApplicationPorts.ts';
import type { KnowledgeIndexService } from './KnowledgeIndex.ts';
import type { WorkbenchStages, StageExecutionContext } from './WorkbenchStages.ts';
import type { WorkbenchMaterials } from './WorkbenchMaterials.ts';
import type { ExternalAssociation } from '../../domain/association/ExternalAssociations.ts';
const contract = 'card-associations-v1';
const externalContract = 'card-associations-v2';
export class WorkbenchAssociations {
  readonly repository: FlywheelRepository; readonly artifacts: ArtifactStore;
  readonly index: KnowledgeIndexService; readonly stages: WorkbenchStages; readonly materials: WorkbenchMaterials;
  constructor(repository: FlywheelRepository, artifacts: ArtifactStore, index: KnowledgeIndexService, stages: WorkbenchStages, materials: WorkbenchMaterials) {
    this.repository = repository; this.artifacts = artifacts; this.index = index; this.stages = stages; this.materials = materials;
  }
  prepare(versionIds?: string[], materialIds: string[] = []): StageInput {
    if (!Array.isArray(materialIds) || materialIds.length > 32 || materialIds.some((id) => typeof id !== 'string' || !id) || new Set(materialIds).size !== materialIds.length) throw new Error('ASSOCIATION_SELECTION_INVALID');
    const input = this.index.prepare(versionIds);
    if (materialIds.length) {
      const ids = [...materialIds].sort();
      const materials = ids.map((id) => { const value = this.materials.store.get(id); if (!value) throw new Error('MATERIAL_NOT_FOUND'); return value; });
      return { ...input, stage: 'ASSOCIATE', sourceDigest: sha256(canonicalJson([input.sourceDigest, materials])),
        configurationDigest: sha256(externalContract), parameters: { associationContract: externalContract, materialIds: ids } };
    }
    return { ...input, stage: 'ASSOCIATE', configurationDigest: sha256(contract), parameters: { associationContract: contract } };
  }
  async build(context: StageExecutionContext) {
    const frozen = this.prepare(context.task.input.cardVersionIds, (context.task.input.parameters.materialIds ?? []) as string[]);
    if (context.task.input.configurationDigest !== frozen.configurationDigest || context.task.input.sourceDigest !== frozen.sourceDigest) throw new Error('STAGE_INPUT_CHANGED');
    const result = await context.step('relation-index', async () => {
      const cards = groupKnowledgeCards(this.repository.listKnowledgeVersions(['CANDIDATE', 'VERIFIED', 'LOW_CONFIDENCE', 'SUPERSEDED']))
        .filter((card) => frozen.cardVersionIds.includes(card.current.versionId));
      const inputs: AssociationCard[] = []; let bodyBytes = 0;
      for (const card of cards) {
        context.signal.throwIfAborted();
        const entry = await this.index.preview(card.cardId);
        if (entry.stale) throw new Error('ASSOCIATION_INDEX_STALE');
        const version = card.current;
        bodyBytes += version.bodyRef.size;
        if (bodyBytes > 8_388_608) throw new Error('ASSOCIATION_LIMIT_EXCEEDED');
        if (!await this.artifacts.verify(version.bodyRef)) throw new Error('STAGE_ARTIFACT_CORRUPT');
        inputs.push({ cardId: card.cardId, versionId: version.versionId, bodyDigest: version.bodyRef.sha256,
          body: Buffer.from(await this.artifacts.get(version.bodyRef)).toString('utf8'),
          symbol: typeof version.metadata.symbol === 'string' ? version.metadata.symbol : '',
          repositoryId: typeof version.metadata.repositoryId === 'string' ? version.metadata.repositoryId : '',
          sourceRevision: entry.header.sourceVersions.length === 1 ? entry.header.sourceVersions[0]! : '', applicability: entry.header.applicability });
      }
      const domain = new AssociationDomainService();
      const relations = domain.associateCards(inputs);
      const materials: Awaited<ReturnType<WorkbenchMaterials['read']>>[] = [];
      for (const id of (frozen.parameters.materialIds ?? []) as string[]) {
        context.signal.throwIfAborted();
        const material = this.materials.store.get(id)!;
        bodyBytes += material.textRef.size;
        if (bodyBytes > 8_388_608) throw new Error('ASSOCIATION_LIMIT_EXCEEDED');
        materials.push(await this.materials.read(id));
      }
      const externalRelations = domain.associateExternalMaterials(inputs, materials);
      const scope = materials.length ? 'INTERNAL_AND_EXTERNAL' : 'INTERNAL_ONLY';
      const ref = await this.artifacts.put(Buffer.from(JSON.stringify({ schemaVersion: frozen.parameters.associationContract, relations, externalRelations, externalMaterials: materials.map(({ material }) => material), scope })), 'application/json');
      return { artifactRefs: [ref, ...materials.flatMap(({ material }) => [material.rawRef, material.textRef])], summary: { relations: relations.length + externalRelations.length, internalRelations: relations.length, externalRelations: externalRelations.length, cards: cards.length, scope, externalMaterials: materials.length } };
    });
    context.progress({ ...result.summary, phase: 'association-index' });
    return result;
  }
  async candidates(cardId: string) {
    const relations = new Map<string, CardAssociation>(); const externalRelations = new Map<string, ExternalAssociation>(); let staleTasks = 0;
    const current = new Map(groupKnowledgeCards(this.repository.listKnowledgeVersions(['CANDIDATE', 'VERIFIED', 'LOW_CONFIDENCE', 'SUPERSEDED'])).map((card) => [card.cardId, card.current]));
    const valid = (id: string, versionId: string, digest: string) => {
      const card = current.get(id), index = this.index.index.get(id);
      return card && card.versionId === versionId && card.bodyRef.sha256 === digest
        && index?.sourceDigest === cardIndexSourceDigest(id, card);
    };
    for (const task of this.stages.store.list()) {
      if (task.input.stage !== 'ASSOCIATE' || task.status !== 'SUCCEEDED' || !task.result) continue;
      if (![contract, externalContract].some((value) => task.input.configurationDigest === sha256(value))) { staleTasks++; continue; }
      const ref = task.result.artifactRefs[0] as ArtifactRef;
      if (!ref || !await this.artifacts.verify(ref)) throw new Error('STAGE_ARTIFACT_CORRUPT');
      const data = JSON.parse(Buffer.from(await this.artifacts.get(ref)).toString('utf8')) as { schemaVersion: string; relations: CardAssociation[]; externalRelations?: ExternalAssociation[] };
      if (![contract, externalContract].includes(data.schemaVersion)) continue;
      let stale = false;
      for (const relation of data.relations) {
        if (!valid(relation.fromCardId, relation.fromVersionId, relation.fromBodyDigest) || !valid(relation.toCardId, relation.toVersionId, relation.toBodyDigest)) { stale = true; continue; }
        if (relation.fromCardId === cardId || relation.toCardId === cardId) relations.set(relation.relationId, relation);
      }
      for (const relation of data.externalRelations ?? []) {
        if (!valid(relation.cardId, relation.versionId, relation.bodyDigest)) { stale = true; continue; }
        const material = this.materials.store.get(relation.materialId);
        if (!material || material.textRef.sha256 !== relation.materialDigest || !await this.artifacts.verify(material.textRef) || !await this.artifacts.verify(material.rawRef)) { stale = true; continue; }
        if (relation.cardId === cardId) externalRelations.set(relation.relationId, relation);
      }
      if (stale) staleTasks++;
    }
    return { cardId, relations: [...relations.values()], externalRelations: [...externalRelations.values()], staleTasks, replacementVerified: false, scope: externalRelations.size ? 'INTERNAL_AND_EXTERNAL' : 'INTERNAL_ONLY' };
  }
}
