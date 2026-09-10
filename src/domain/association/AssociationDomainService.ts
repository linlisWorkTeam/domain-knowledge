/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义AssociationDomain服务的领域数据与确定性业务规则。
 */
import { assertInvariant } from '../Domain.ts';

/** 定义ExternalFact的数据结构与类型约束。 */
export interface ExternalFact {
  /** 提供fact标识信息，供调用方读取或传入。 */
  factId: string;
  /** 提供源码信息，供调用方读取或传入。 */
  source: string;
  /** 提供subject信息，供调用方读取或传入。 */
  subject: string;
  /** 提供predicate信息，供调用方读取或传入。 */
  predicate: string;
  /** 提供object信息，供调用方读取或传入。 */
  object: string;
}

/** 定义AssociationTarget的数据结构与类型约束。 */
export interface AssociationTarget {
  /** 提供target标识信息，供调用方读取或传入。 */
  targetId: string;
  /** 提供aliases信息，供调用方读取或传入。 */
  aliases: string[];
}

/** 定义AssociationLink的数据结构与类型约束。 */
export interface AssociationLink {
  /** 提供fact标识信息，供调用方读取或传入。 */
  factId: string;
  /** 提供target标识信息，供调用方读取或传入。 */
  targetId: string;
  /** 提供confidence信息，供调用方读取或传入。 */
  confidence: number;
  /** 提供原因信息，供调用方读取或传入。 */
  reason: string;
}

/** 定义ExternalExtractor的数据结构与类型约束。 */
export interface ExternalExtractor {
  /** 提供 extract 对应的extract操作。 */
  extract(input: { content: string; source: string }): ExternalFact[];
}

/** 定义ReverseMapper的数据结构与类型约束。 */
export interface ReverseMapper {
  /** 转换请求。 */
  map(input: { facts: readonly ExternalFact[]; targets: readonly AssociationTarget[] }): AssociationLink[];
}

/**
 * Pure association boundary. Extraction and mapping strategies are injected;
 * model, database and search SDKs stay in infrastructure adapters.
 */
/** 封装AssociationDomain服务的对外操作与协作依赖。 */
export class AssociationDomainService {
  /** 提供 associate 对应的associate操作。 */
  associate(input: {
    content: string;
    source: string;
    targets: readonly AssociationTarget[];
    extractor: ExternalExtractor;
    reverseMapper: ReverseMapper;
  }): { facts: ExternalFact[]; links: AssociationLink[] } {
    assertInvariant(input.content.trim().length > 0, 'association content is required');
    assertInvariant(input.source.trim().length > 0, 'association source is required');
    const facts = input.extractor.extract({ content: input.content, source: input.source });
    const factIds = new Set<string>();
    for (const fact of facts) {
      assertInvariant(fact.factId.trim().length > 0, 'external factId is required');
      assertInvariant(!factIds.has(fact.factId), `duplicate external factId: ${fact.factId}`);
      factIds.add(fact.factId);
    }
    const targetIds = new Set(input.targets.map((target) => target.targetId));
    const links = input.reverseMapper.map({ facts, targets: input.targets });
    for (const link of links) {
      assertInvariant(factIds.has(link.factId), `association references unknown fact: ${link.factId}`);
      assertInvariant(targetIds.has(link.targetId), `association references unknown target: ${link.targetId}`);
      assertInvariant(link.confidence >= 0 && link.confidence <= 1, 'association confidence must be 0..1');
      assertInvariant(link.reason.trim().length > 0, 'association reason is required');
    }
    return { facts: structuredClone(facts), links: structuredClone(links) };
  }
}
