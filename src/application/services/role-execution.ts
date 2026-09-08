import { agents } from '../../domain/agents/index.ts';
import type { AgentCommand, AgentResult, AgentId } from '../../domain/agents/contracts.ts';
import type { ExecutionContext, RoleInput, RoleResult } from '../../domain/agents/execution.ts';
import { assertActive } from '../../domain/agents/execution.ts';
import type { ArtifactRef } from '../../domain/index.ts';
import type { AgentContractValidator } from '../ports/index.ts';
import type { KnowledgeFlywheelService } from './index.ts';

/** Shared production/development transaction boundary. No role-specific branches. */
export class RoleExecutionService {
  readonly flywheel: KnowledgeFlywheelService;
  readonly contracts: AgentContractValidator;
  readonly nodeByAgent: Record<AgentId, string>;
  constructor(flywheel: KnowledgeFlywheelService, contracts: AgentContractValidator, nodeByAgent: Record<AgentId, string>) {
    this.flywheel = flywheel; this.contracts = contracts; this.nodeByAgent = nodeByAgent;
  }
  async execute(request: {
    command: AgentCommand; nodeId: string; inputRefs: ArtifactRef[];
    input: RoleInput<Record<string, unknown>>; context: ExecutionContext;
  }): Promise<ArtifactRef> {
    const { command, context, input } = request;
    assertActive(context.signal);
    this.contracts.assertCommand(command);
    if (JSON.stringify(input.payload) !== JSON.stringify(command.payload)
      || JSON.stringify(context.command) !== JSON.stringify(command)) {
      throw new Error('AGENT_RESULT_COMMAND_MISMATCH: role input must match validated command');
    }
    const commandRef = await this.flywheel.putArtifact(Buffer.from(JSON.stringify(command, null, 2)), 'application/json');
    const checkpoint = await this.flywheel.executeNode({
      runId: command.runId, nodeId: request.nodeId, generationKey: command.generationKey,
      inputRefs: uniqueRefs([...request.inputRefs, ...input.materials.map(({ ref }) => ref), commandRef]),
    }, async () => {
      // Versioned command validation establishes the discriminant and payload type.
      const execute = agents[command.agentType].execute as unknown as (
        input: RoleInput<Record<string, unknown>>, context: ExecutionContext,
      ) => Promise<RoleResult<unknown>>;
      const roleResult = await execute(input, context);
      const rawRef = await this.flywheel.putArtifact(Buffer.from(JSON.stringify(roleResult.output, null, 2)), 'application/json');
      const refs = new Map<string, ArtifactRef>([['raw', rawRef]]);
      for (const artifact of roleResult.artifacts) {
        if (refs.has(artifact.key)) throw new Error('AGENT_PENDING_ARTIFACT_DUPLICATED');
        refs.set(artifact.key, await this.flywheel.putArtifact(Buffer.from(artifact.content), artifact.mediaType));
      }
      const bind = (value: unknown): unknown => {
        if (!value || typeof value !== 'object') return value;
        if ('agentNode' in value) return this.nodeByAgent[value.agentNode as AgentId];
        if ('agentGeneration' in value) return `${command.runId}:${this.nodeByAgent[value.agentGeneration as AgentId]}:${context.iteration}:contract-v5`;
        if ('pendingArtifact' in value) {
          const ref = refs.get(String(value.pendingArtifact));
          if (!ref) throw new Error('AGENT_PENDING_ARTIFACT_MISSING');
          return ref;
        }
        if (Array.isArray(value)) return value.map(bind);
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, bind(item)]));
      };
      const result: AgentResult = {
        schemaVersion: '1.0', commandId: command.commandId, commandRef,
        runId: command.runId, agentType: command.agentType, status: 'SUCCEEDED',
        outputRefs: uniqueRefs([...refs.values()]), payload: bind(roleResult.payload) as Record<string, unknown>,
      };
      this.contracts.assertResult(result);
      const resultRef = await this.flywheel.putArtifact(Buffer.from(JSON.stringify(result, null, 2)), 'application/json');
      assertActive(context.signal);
      return [resultRef, rawRef];
    });
    const ref = checkpoint.outputRefs[0];
    if (!ref) throw new Error(`WORKFLOW_AGENT_OUTPUT_MISSING: ${request.nodeId}`);
    return ref;
  }
}
function uniqueRefs(refs: ArtifactRef[]): ArtifactRef[] {
  return [...new Map(refs.map((ref) => [ref.artifactId, ref])).values()].sort((a, b) => a.artifactId.localeCompare(b.artifactId));
}
