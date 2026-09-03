import type { KnowledgeDiscoveryPort } from '../ports/index.ts';

export class KnowledgeDiscoveryApp {
  readonly discovery: KnowledgeDiscoveryPort;

  constructor(discovery: KnowledgeDiscoveryPort) {
    this.discovery = discovery;
  }

  discover(configuredRoots: string[], maximum = 50) {
    return this.discovery.scan(configuredRoots, maximum);
  }
}
