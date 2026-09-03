import {
  assertInvariant, createEvent, sha256,
} from '../../domain/index.ts';
import type {
  AgentDefinition, AgentId, ArtifactStore, FlywheelRepository,
  RunConfigurationManager, RunConfigurationSnapshot,
} from '../ports/index.ts';
import { AGENT_IDS } from '../ports/index.ts';

export const AGENT_COMMAND_SCHEMA_ID = 'https://wpknowledge.local/schemas/agent-command/v1' as const;
export const AGENT_RESULT_SCHEMA_ID = 'https://wpknowledge.local/schemas/agent-result/v1' as const;

export class RegistryRunConfigurationService implements RunConfigurationManager {
  readonly definitions: readonly AgentDefinition[];
  readonly repository: FlywheelRepository;
  readonly artifacts: ArtifactStore;
  readonly provider: RunConfigurationSnapshot['provider'];
  readonly clock: () => string;

  constructor(input: {
    definitions: readonly AgentDefinition[];
    repository: FlywheelRepository;
    artifacts: ArtifactStore;
    provider: RunConfigurationSnapshot['provider'];
    clock?: () => string;
  }) {
    assertInvariant(input.definitions.length === AGENT_IDS.length, 'run configuration requires all fixed Agents');
    assertInvariant(/^[a-f0-9]{64}$/.test(input.provider.parametersSha256), 'provider parameters digest is invalid');
    this.definitions = input.definitions.map((definition) => structuredClone(definition));
    this.repository = input.repository;
    this.artifacts = input.artifacts;
    this.provider = structuredClone(input.provider);
    this.clock = input.clock ?? (() => new Date().toISOString());
  }

  async capture(runId: string): Promise<RunConfigurationSnapshot> {
    assertInvariant(this.repository.getRun(runId) !== null, `run not found: ${runId}`);
    const existing = this.repository.getRunConfiguration(runId);
    if (existing) return existing;
    const configured = new Map(
      this.repository.listAgentPromptConfigurations().map((value) => [value.agentId, value]),
    );
    const agents = [];
    for (const definition of this.definitions) {
      const configuration = configured.get(definition.agentId);
      const promptAddon = configuration?.promptAddon ?? '';
      const effectivePrompt = `${definition.basePrompt}${promptAddon ? `\n\nOperator prompt add-on:\n${promptAddon}` : ''}`;
      const effectivePromptRef = await this.artifacts.put(
        Buffer.from(effectivePrompt, 'utf8'),
        'text/plain; charset=utf-8',
      );
      agents.push({
        agentId: definition.agentId,
        promptRevision: configuration?.revision ?? 0,
        basePromptSha256: sha256(definition.basePrompt),
        promptAddonSha256: sha256(promptAddon),
        effectivePromptSha256: sha256(effectivePrompt),
        effectivePromptRef,
        tools: [...definition.tools],
      });
    }
    const capturedAt = this.clock();
    const snapshot: RunConfigurationSnapshot = {
      schemaVersion: '1.0',
      runId,
      provider: structuredClone(this.provider),
      contracts: {
        commandSchema: AGENT_COMMAND_SCHEMA_ID,
        resultSchema: AGENT_RESULT_SCHEMA_ID,
      },
      agents,
      capturedAt,
    };
    return this.repository.saveRunConfiguration(snapshot, createEvent(
      runId,
      'RunConfigurationCaptured',
      {
        provider: snapshot.provider,
        contracts: snapshot.contracts,
        agentRevisions: Object.fromEntries(snapshot.agents.map((agent) => [agent.agentId, agent.promptRevision])),
      },
      capturedAt,
    ));
  }

  get(runId: string): RunConfigurationSnapshot | null {
    return this.repository.getRunConfiguration(runId);
  }

  async resolvePrompt(runId: string, agentId: AgentId): Promise<string> {
    const snapshot = this.repository.getRunConfiguration(runId);
    assertInvariant(snapshot !== null, `run configuration not found: ${runId}`);
    const agent = snapshot.agents.find((candidate) => candidate.agentId === agentId);
    assertInvariant(agent !== undefined, `run configuration missing Agent: ${agentId}`);
    assertInvariant(await this.artifacts.verify(agent.effectivePromptRef), `frozen prompt artifact is corrupt: ${agentId}`);
    const prompt = Buffer.from(await this.artifacts.get(agent.effectivePromptRef)).toString('utf8');
    assertInvariant(sha256(prompt) === agent.effectivePromptSha256, `frozen prompt digest mismatch: ${agentId}`);
    return prompt;
  }
}
