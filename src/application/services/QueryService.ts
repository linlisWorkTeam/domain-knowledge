/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：协调Query服务用例及其依赖的领域规则与端口。
 */
import type { KnowledgeVersion } from '../../domain/Domain.ts';
import type { ArtifactStore, FlywheelRepository } from '../ports/ApplicationPorts.ts';

function tokenize(text: string): string[] {
  const normalized = text.toLowerCase();
  const words = normalized.match(/[a-z0-9_+-]+|[\u3400-\u9fff]/g) ?? [];
  const cjk = [...normalized].filter((char) => /[\u3400-\u9fff]/.test(char));
  const bigrams = cjk.slice(0, -1).map((char, index) => char + cjk[index + 1]);
  return [...words, ...bigrams];
}

function frequencies(tokens: string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const token of tokens) result.set(token, (result.get(token) ?? 0) + 1);
  return result;
}

interface IndexedVersion {
  /** 提供版本信息，供调用方读取或传入。 */
  version: KnowledgeVersion;
  /** 提供正文信息，供调用方读取或传入。 */
  body: string;
  /** 提供terms信息，供调用方读取或传入。 */
  terms: Map<string, number>;
  /** 提供length信息，供调用方读取或传入。 */
  length: number;
}

/** 封装知识Query服务的对外操作与协作依赖。 */
export class KnowledgeQueryService {
  /** 提供artifacts信息，供调用方读取或传入。 */
  readonly artifacts: ArtifactStore;
  /** 提供仓库信息，供调用方读取或传入。 */
  readonly repository: FlywheelRepository;

  /** 注入协作依赖并初始化实例状态。 */
  constructor(artifacts: ArtifactStore, repository: FlywheelRepository) {
    this.artifacts = artifacts;
    this.repository = repository;
  }

  /** 索引层只返回调用方已授权版本的描述，不读取正文工件。 */
  describe(allowedVersionIds: readonly string[]): Record<string, unknown>[] {
    return [...new Set(allowedVersionIds)].flatMap((id) => {
      const version = this.repository.getKnowledgeVersion(id);
      return version ? [{ versionId: version.versionId, moduleId: version.moduleId,
        title: version.title, description: version.description, keywords: version.tags,
        status: version.status, bodyRef: version.bodyRef }] : [];
    });
  }

  /** 第二阶段仅加载本次明确授权的一份文档，索引不扩大材料权限。 */
  async loadDocument(versionId: string, allowedVersionIds: readonly string[]): Promise<Record<string, unknown> | null> {
    if (!allowedVersionIds.includes(versionId)) throw new Error('KNOWLEDGE_DOCUMENT_DENIED');
    return this.get(versionId);
  }

  /** 读取请求。 */
  async get(versionId: string): Promise<Record<string, unknown> | null> {
    const version = this.repository.getKnowledgeVersion(versionId);
    if (!version) return null;
    const body = Buffer.from(await this.artifacts.get(version.bodyRef)).toString('utf8');
    return { ...version, body };
  }

  /** 提供 latest版本标识 对应的latest版本标识操作。 */
  latestVersionId(moduleId: string): string | null {
    return this.repository.latestKnowledgeVersion(moduleId)?.versionId ?? null;
  }

  /** 检索请求。 */
  async search(input: {
    query: string;
    top?: number;
    statuses?: string[];
    category?: string;
  }): Promise<{ query: string; total: number; hits: Record<string, unknown>[] }> {
    const statuses = input.statuses?.length ? input.statuses : ['VERIFIED'];
    let versions = this.repository.listKnowledgeVersions(statuses);
    if (input.category) versions = versions.filter((version) => version.category === input.category);
    const indexed: IndexedVersion[] = [];
    for (const version of versions) {
      const body = Buffer.from(await this.artifacts.get(version.bodyRef)).toString('utf8');
      const weighted = [
        version.moduleId, version.moduleId, version.moduleId,
        version.title, version.title, version.title,
        version.description, version.description,
        version.tags.join(' '), version.tags.join(' '),
        body,
      ].join('\n');
      const terms = frequencies(tokenize(weighted));
      indexed.push({ version, body, terms, length: [...terms.values()].reduce((sum, value) => sum + value, 0) });
    }
    const requestedTop = input.top ?? 8;
    const top = Number.isFinite(requestedTop) ? Math.max(1, Math.min(Math.trunc(requestedTop), 200)) : 8;
    if (!input.query.trim()) {
      const hits = indexed
        .sort((a, b) => b.version.qualityScore - a.version.qualityScore)
        .slice(0, top)
        .map((entry) => this.hit(entry, entry.version.qualityScore / 100, 0));
      return { query: '', total: indexed.length, hits };
    }
    const queryTerms = frequencies(tokenize(input.query));
    const documentFrequency = new Map<string, number>();
    for (const entry of indexed) {
      for (const term of entry.terms.keys()) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
    const averageLength = indexed.length
      ? indexed.reduce((sum, entry) => sum + entry.length, 0) / indexed.length
      : 1;
    const scores = indexed.map((entry) => {
      let bm25 = 0;
      for (const [term, queryFrequency] of queryTerms) {
        const termFrequency = entry.terms.get(term) ?? 0;
        if (!termFrequency) continue;
        const seen = documentFrequency.get(term) ?? 0;
        const inverse = Math.log(1 + (indexed.length - seen + 0.5) / (seen + 0.5));
        const denominator = termFrequency + 1.5 * (1 - 0.75 + 0.75 * entry.length / averageLength);
        bm25 += inverse * (termFrequency * 2.5 / denominator) * (0.5 + 0.5 * queryFrequency);
      }
      return { entry, bm25 };
    }).filter(({ bm25 }) => bm25 > 0).sort((a, b) => b.bm25 - a.bm25);
    const maximum = scores[0]?.bm25 || 1;
    const hits = scores.slice(0, top).map(({ entry, bm25 }) => {
      const normalized = bm25 / maximum;
      const quality = entry.version.qualityScore / 100;
      return this.hit(entry, normalized * 0.85 + quality * 0.15, normalized);
    }).sort((a, b) => Number(b.relevance) - Number(a.relevance));
    return { query: input.query, total: scores.length, hits };
  }

  private hit(entry: IndexedVersion, relevance: number, bm25: number): Record<string, unknown> {
    return {
      versionId: entry.version.versionId,
      moduleId: entry.version.moduleId,
      status: entry.version.status,
      qualityOutcome: entry.version.qualityOutcome,
      qualityScore: entry.version.qualityScore,
      title: entry.version.title,
      description: entry.version.description,
      category: entry.version.category,
      tags: entry.version.tags,
      provenance: entry.version.provenance,
      parentVersionId: entry.version.parentVersionId,
      createdAt: entry.version.createdAt,
      relevance: Number(relevance.toFixed(4)),
      bm25: Number(bm25.toFixed(4)),
      snippet: entry.body.trim().replace(/\s+/g, ' ').slice(0, 240),
    };
  }
}
