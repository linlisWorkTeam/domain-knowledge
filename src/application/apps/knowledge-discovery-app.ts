import type { KnowledgeDiscoveryPort, LegacyKnowledgeMigrationPort } from '../ports/index.ts';
import {
  AssociationDomainService,
  type AssociationTarget,
  type ExternalExtractor,
  type ReverseMapper,
} from '../../domain/services/index.ts';

export class KnowledgeDiscoveryApp {
  readonly discovery: KnowledgeDiscoveryPort;
  readonly association: AssociationDomainService;
  readonly legacyMigration?: LegacyKnowledgeMigrationPort;

  constructor(
    discovery: KnowledgeDiscoveryPort,
    association = new AssociationDomainService(),
    legacyMigration?: LegacyKnowledgeMigrationPort,
  ) {
    this.discovery = discovery;
    this.association = association;
    this.legacyMigration = legacyMigration;
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

  migrateLegacy(legacyKnowledgeRoot: string) {
    if (!this.legacyMigration) throw new Error('LEGACY_MIGRATION_UNAVAILABLE');
    return this.legacyMigration.migrate(legacyKnowledgeRoot);
  }
}
