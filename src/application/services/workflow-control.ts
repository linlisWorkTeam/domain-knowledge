import { createEvent, assertInvariant } from '../../domain/index.ts';
import type {
  AgentDefinition,
  AgentId,
  AgentPromptConfiguration,
  FlywheelRepository,
  WorkflowNodeProjection,
  WorkflowObserver,
} from '../ports/index.ts';
import { AGENT_IDS } from '../ports/index.ts';

export const MAX_PROMPT_ADDON_LENGTH = 4_000;

export class AgentCatalogService {
  readonly definitions: readonly AgentDefinition[];
  readonly repository: FlywheelRepository;
  readonly clock: () => string;

  constructor(input: {
    definitions: readonly AgentDefinition[];
    repository: FlywheelRepository;
    clock?: () => string;
  }) {
    assertInvariant(input.definitions.length === AGENT_IDS.length, 'all fixed Agent definitions are required');
    const ids = new Set(input.definitions.map((definition) => definition.agentId));
    for (const agentId of AGENT_IDS) assertInvariant(ids.has(agentId), `missing Agent definition: ${agentId}`);
    this.definitions = input.definitions.map((definition) => structuredClone(definition));
    this.repository = input.repository;
    this.clock = input.clock ?? (() => new Date().toISOString());
  }

  list(): Array<AgentDefinition & { configuration: AgentPromptConfiguration }> {
    const configurations = new Map(
      this.repository.listAgentPromptConfigurations().map((configuration) => [configuration.agentId, configuration]),
    );
    return this.definitions.map((definition) => ({
      ...structuredClone(definition),
      configuration: configurations.get(definition.agentId) ?? {
        agentId: definition.agentId,
        promptAddon: '',
        revision: 0,
        updatedAt: null,
      },
    }));
  }

  getPromptAddon(agentId: AgentId): string {
    this.requireDefinition(agentId);
    return this.repository.listAgentPromptConfigurations()
      .find((configuration) => configuration.agentId === agentId)?.promptAddon ?? '';
  }

  updatePromptAddon(agentId: AgentId, promptAddon: string): AgentPromptConfiguration {
    this.requireDefinition(agentId);
    assertInvariant(typeof promptAddon === 'string', 'promptAddon must be a string');
    assertInvariant(promptAddon.length <= MAX_PROMPT_ADDON_LENGTH, `promptAddon exceeds ${MAX_PROMPT_ADDON_LENGTH} characters`);
    assertInvariant(!promptAddon.includes('\0'), 'promptAddon contains a forbidden null character');
    const existing = this.repository.listAgentPromptConfigurations()
      .find((configuration) => configuration.agentId === agentId);
    const now = this.clock();
    const configuration: AgentPromptConfiguration = {
      agentId,
      promptAddon: promptAddon.trim(),
      revision: (existing?.revision ?? 0) + 1,
      updatedAt: now,
    };
    return this.repository.saveAgentPromptConfiguration(configuration, createEvent(
      `agent-config:${agentId}`,
      'AgentPromptConfigured',
      { agentId, revision: configuration.revision, promptLength: configuration.promptAddon.length },
      now,
    ));
  }

  private requireDefinition(agentId: string): AgentDefinition {
    const definition = this.definitions.find((candidate) => candidate.agentId === agentId);
    assertInvariant(definition !== undefined, `unknown Agent: ${agentId}`);
    return definition;
  }
}

export class RegistryWorkflowObserver implements WorkflowObserver {
  readonly repository: FlywheelRepository;
  readonly clock: () => string;

  constructor(repository: FlywheelRepository, clock: () => string = () => new Date().toISOString()) {
    this.repository = repository;
    this.clock = clock;
  }

  record(projection: WorkflowNodeProjection): void {
    const now = this.clock();
    this.repository.recordWorkflowNodeProjection({ ...projection, updatedAt: now }, createEvent(
      projection.runId,
      'WorkflowNodeStateChanged',
      {
        nodeId: projection.nodeId,
        agentId: projection.agentId,
        status: projection.status,
        iteration: projection.iteration,
        attempt: projection.attempt,
      },
      now,
    ));
  }

  nextAttempt(runId: string, nodeId: string, iteration: number): number {
    const attempts = this.repository.listWorkflowNodeProjections(runId)
      .filter((projection) => projection.nodeId === nodeId && projection.iteration === iteration)
      .map((projection) => projection.attempt);
    return Math.max(0, ...attempts) + 1;
  }
}
