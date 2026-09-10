/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：协调冻结版本的增量索引、Markdown 恢复和按需正文检索。
 */
import { sha256 } from '../../domain/Domain.ts';
import { groupKnowledgeCards } from '../../domain/services/knowledge/KnowledgeCards.ts';
import { CARD_INDEX_VERSION, cardIndexHeader, cardIndexSourceDigest, matchCardIndex } from '../../domain/services/knowledge/KnowledgeIndex.ts';
import type { StageInput, StageResult } from '../../domain/services/workbench/StageTask.ts';
import type { ArtifactStore, FlywheelRepository } from '../ports/ApplicationPorts.ts';
import type { KnowledgeIndexStore } from '../ports/KnowledgeIndexPorts.ts';
import type { StageExecutionContext } from './WorkbenchStages.ts';

/** 生成卡片独立于索引成功与否；本用例不创建、修改或撤销知识版本。 */
export class KnowledgeIndexService {
  readonly repository: FlywheelRepository;
  readonly artifacts: ArtifactStore;
  readonly index: KnowledgeIndexStore;
  constructor(repository: FlywheelRepository, artifacts: ArtifactStore, index: KnowledgeIndexStore) {
    this.repository = repository; this.artifacts = artifacts; this.index = index;
  }
  private cards() {
    return groupKnowledgeCards(this.repository.listKnowledgeVersions(['CANDIDATE', 'VERIFIED', 'LOW_CONFIDENCE', 'SUPERSEDED']));
  }
  /** 确定目录后冻结具体版本；阶段执行期间卡片变化会要求建立新任务。 */
  prepare(versionIds?: string[]): StageInput {
    const cards = this.cards();
    if (versionIds && (!Array.isArray(versionIds) || !versionIds.length || versionIds.length > 1000
      || !versionIds.every((id) => typeof id === 'string' && id.length <= 256))) throw new Error('INDEX_SELECTION_INVALID');
    const selected = versionIds ? cards.filter((card) => versionIds.includes(card.current.versionId)) : cards;
    if (versionIds && selected.length !== new Set(versionIds).size) throw new Error('INDEX_VERSION_NOT_CURRENT');
    if (!selected.length) throw new Error('INDEX_CARDS_REQUIRED');
    selected.sort((a, b) => a.cardId.localeCompare(b.cardId));
    return { projectId: 'knowledge-library', stage: 'INDEX', sourceRevision: CARD_INDEX_VERSION,
      sourceDigest: sha256(JSON.stringify(selected.map((card) => cardIndexSourceDigest(card.cardId, card.current)))),
      cardVersionIds: selected.map((card) => card.current.versionId),
      configurationDigest: sha256(CARD_INDEX_VERSION), parameters: {} };
  }
  /** 工件可由已有 CAS 恢复，恢复不创建知识版本、测试或第二次发布。 */
  async recover(signal?: AbortSignal): Promise<number> {
    let restored = 0;
    for (const entry of this.index.list()) if (!this.index.exists(entry.cardId, entry.markdownRef.sha256)) {
      signal?.throwIfAborted();
      this.index.write(entry.cardId, Buffer.from(await this.artifacts.get(entry.markdownRef)).toString('utf8'));
      restored += 1;
    }
    return restored;
  }
  async build(context: StageExecutionContext): Promise<StageResult> {
    const { task } = context;
    const prepared = this.prepare(task.input.cardVersionIds);
    if (task.input.stage !== 'INDEX' || prepared.sourceDigest !== task.input.sourceDigest
      || prepared.configurationDigest !== task.input.configurationDigest) throw new Error('STAGE_INPUT_CHANGED');
    await this.recover(context.signal);
    const cards = this.cards().filter((card) => task.input.cardVersionIds.includes(card.current.versionId));
    const counts = { added: 0, updated: 0, reused: 0, failed: 0 };
    const artifactRefs: StageResult['artifactRefs'] = [];
    for (const card of cards) {
      context.signal.throwIfAborted();
      try {
        const output = await context.step(`index:${card.cardId}`, async () => {
          const version = card.current;
          const sourceDigest = cardIndexSourceDigest(card.cardId, version);
          const previous = this.index.get(card.cardId);
          if (previous?.sourceDigest === sourceDigest) {
            if (!this.index.exists(card.cardId, previous.markdownRef.sha256)) {
              this.index.write(card.cardId, Buffer.from(await this.artifacts.get(previous.markdownRef)).toString('utf8'));
            }
            return { artifactRefs: [previous.yamlRef, previous.markdownRef], summary: { disposition: 'reused' } };
          }
          const body = Buffer.from(await this.artifacts.get(version.bodyRef)).toString('utf8');
          const header = cardIndexHeader(card.cardId, version, body);
          const projection = this.index.render(header, body);
          const yamlRef = await this.artifacts.put(Buffer.from(projection.yaml), 'application/yaml');
          const markdownRef = await this.artifacts.put(Buffer.from(projection.markdown), 'text/markdown');
          context.signal.throwIfAborted();
          this.index.write(card.cardId, projection.markdown);
          this.index.save({ schemaVersion: CARD_INDEX_VERSION, cardId: card.cardId, versionId: version.versionId,
            sourceDigest, bodyDigest: version.bodyRef.sha256, header, yamlRef, markdownRef, updatedAt: new Date().toISOString() });
          return { artifactRefs: [yamlRef, markdownRef], summary: { disposition: previous ? 'updated' : 'added' } };
        });
        const disposition = output.summary.disposition as 'added' | 'updated' | 'reused';
        counts[disposition] += 1; artifactRefs.push(...output.artifactRefs);
      } catch (error) {
        if (context.signal.aborted) throw error;
        counts.failed += 1;
        const reasonCode = error instanceof Error ? /^([A-Z][A-Z0-9_]{1,79})(?::|$)/.exec(error.message)?.[1] : undefined;
        context.progress({ cardId: card.cardId, versionId: card.current.versionId, status: 'FAILED', reasonCode: reasonCode ?? 'INDEX_CARD_FAILED' });
      }
      context.progress({ ...counts, total: cards.length });
    }
    if (counts.failed) throw new Error('INDEX_BUILD_PARTIAL');
    return { artifactRefs, summary: { ...counts, total: cards.length } };
  }
  /** 仅命中有效摘要；旧索引明确计入 stale，不读取或混入失效正文。 */
  search(query = '') {
    const current = new Map(this.cards().map((card) => [card.cardId, card.current]));
    let stale = 0;
    const entries = this.index.list();
    const hits = entries.flatMap((entry) => {
      const version = current.get(entry.cardId);
      if (!version || cardIndexSourceDigest(entry.cardId, version) !== entry.sourceDigest) { stale += 1; return []; }
      const match = matchCardIndex(entry.header, query);
      return match.score ? [{ cardId: entry.cardId, versionId: entry.versionId, header: entry.header,
        status: version.status, match, bodyUrl: `/api/v1/knowledge/${encodeURIComponent(entry.versionId)}` }] : [];
    }).sort((a, b) => b.match.score - a.match.score || a.cardId.localeCompare(b.cardId));
    return { query, total: hits.length, indexed: entries.length - stale, stale,
      missing: [...current.keys()].filter((id) => !entries.some((entry) => entry.cardId === id)).length, hits };
  }
  async preview(cardId: string) {
    const entry = this.index.get(cardId);
    if (!entry) throw new Error('INDEX_CARD_NOT_FOUND');
    const current = this.cards().find((card) => card.cardId === cardId);
    return { ...entry, stale: !current || cardIndexSourceDigest(cardId, current.current) !== entry.sourceDigest,
      yaml: Buffer.from(await this.artifacts.get(entry.yamlRef)).toString('utf8') };
  }
}
