import { assertInvariant } from '../index.ts';

export interface ExternalFact {
  factId: string;
  source: string;
  subject: string;
  predicate: string;
  object: string;
}

export interface AssociationTarget {
  targetId: string;
  aliases: string[];
}

export interface AssociationLink {
  factId: string;
  targetId: string;
  confidence: number;
  reason: string;
}

export interface ExternalExtractor {
  extract(input: { content: string; source: string }): ExternalFact[];
}

export interface ReverseMapper {
  map(input: { facts: readonly ExternalFact[]; targets: readonly AssociationTarget[] }): AssociationLink[];
}

/**
 * Pure association boundary. Extraction and mapping strategies are injected;
 * model, database and search SDKs stay in infrastructure adapters.
 */
export class AssociationDomainService {
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
