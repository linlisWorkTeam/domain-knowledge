/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：协调知识发现应用用例及其依赖的领域规则与端口。
 */
import type { KnowledgeDiscoveryPort, LegacyKnowledgeMigrationPort } from '../ports/ApplicationPorts.ts';
import {
  AssociationDomainService,
  type AssociationTarget,
  type ExternalExtractor,
  type ReverseMapper,
} from '../../domain/association/AssociationDomainService.ts';

/** 封装知识发现应用的对外操作与协作依赖。 */
export class KnowledgeDiscoveryApp {
  /** 提供discovery信息，供调用方读取或传入。 */
  readonly discovery: KnowledgeDiscoveryPort;
  /** 提供association信息，供调用方读取或传入。 */
  readonly association: AssociationDomainService;
  /** 提供legacyMigration信息，供调用方读取或传入。 */
  readonly legacyMigration?: LegacyKnowledgeMigrationPort;

  /** 注入协作依赖并初始化实例状态。 */
  constructor(
    discovery: KnowledgeDiscoveryPort,
    association = new AssociationDomainService(),
    legacyMigration?: LegacyKnowledgeMigrationPort,
  ) {
    this.discovery = discovery;
    this.association = association;
    this.legacyMigration = legacyMigration;
  }

  /** 提供 discover 对应的discover操作。 */
  discover(configuredRoots: string[], maximum = 50) {
    return this.discovery.scan(configuredRoots, maximum);
  }

  /** 提供 associate 对应的associate操作。 */
  associate(input: {
    content: string;
    source: string;
    targets: readonly AssociationTarget[];
    extractor: ExternalExtractor;
    reverseMapper: ReverseMapper;
  }) {
    return this.association.associate(input);
  }

  /** 提供 migrateLegacy 对应的migrateLegacy操作。 */
  migrateLegacy(legacyKnowledgeRoot: string) {
    if (!this.legacyMigration) throw new Error('LEGACY_MIGRATION_UNAVAILABLE');
    return this.legacyMigration.migrate(legacyKnowledgeRoot);
  }
}
