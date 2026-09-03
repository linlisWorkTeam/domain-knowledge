import type { KnowledgeDiscoveryPort } from '../ports/index.ts';
import {
  AssociationDomainService,
  type AssociationTarget,
  type ExternalExtractor,
  type ReverseMapper,
} from '../../domain/services/index.ts';

export class KnowledgeDiscoveryApp {
  readonly discovery: KnowledgeDiscoveryPort;
  readonly association: AssociationDomainService;

  constructor(discovery: KnowledgeDiscoveryPort, association = new AssociationDomainService()) {
    this.discovery = discovery;
    this.association = association;
  }

  discover(configuredRoots: string[], maximum = 50) {
    return this.discovery.scan(configuredRoots, maximum);
  }

  associate(input: {
    content: string;
    source: string;
    targets: readonly AssociationTarget[];
    extractor: ExternalExtractor;
    reverseMapper: ReverseMapper;
  }) {
    return this.association.associate(input);
  }
}
