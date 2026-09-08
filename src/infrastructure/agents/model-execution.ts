import Ajv2020Import from 'ajv/dist/2020.js';
import type { ModelExecutionPort, ModelRequest } from '../../domain/agents/execution.ts';
import type { AgentWorkspaceProvider, ProjectSnapshot } from '../../application/ports/index.ts';
import type { ProjectWorkflowStages } from '../../application/services/automated-project-workflow.ts';

const Ajv2020 = Ajv2020Import as unknown as new (options: Record<string, unknown>) => {
  compile(schema: Record<string, unknown>): { (value: unknown): boolean; errors?: unknown };
  errorsText(errors: unknown): string;
};
export function assertModelOutput(output: unknown, schema: Record<string, unknown>): void {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  if (!validate(output)) throw new Error(`AGENT_OUTPUT_INVALID: ${ajv.errorsText(validate.errors)}`);
}

/** Maps domain capabilities to the existing provider. Provider retains retries,
 * session isolation, timeout, cancellation and audit ownership. */
export function modelExecutionFactory(workspaces: AgentWorkspaceProvider): ProjectWorkflowStages['modelFactory'] {
  return ({ provider, command, stage, scenario }): ModelExecutionPort => ({
    assertOutput: assertModelOutput,
    async execute(request: ModelRequest, signal?: AbortSignal) {
      if (!provider) throw new Error('WORKFLOW_LIVE_AGENT_UNAVAILABLE');
      if (request.role !== command.agentType) throw new Error('AGENT_RESULT_ROLE_MISMATCH');
      if (request.tools.some((tool) => tool !== 'read_material')) throw new Error('AGENT_CAPABILITY_DENIED');
      const snapshot = stage.context.snapshot as ProjectSnapshot | undefined;
      if (!snapshot) throw new Error('WORKFLOW_PROJECT_SNAPSHOT_MISSING');
      const workspace = await workspaces.materialize({
        isolationKey: `${stage.runId}:${stage.nodeId}:${stage.iteration}:${stage.workerId ?? 'main'}`,
        role: request.role, sourceRoot: scenario.repositoryRoot, sourceCommit: snapshot.commit,
        readablePaths: request.readablePaths,
      });
      return provider.run({ authorizedTools: request.tools, role: request.role, prompt: request.prompt, outputSchema: request.outputSchema,
        idempotencyKey: command.generationKey, command,
        inputRefs: artifactRefs(command.payload), workspaceRoot: workspace.workspaceRoot,
        metadata: { runId: stage.runId, nodeId: stage.nodeId, iteration: stage.iteration,
          attempt: stage.attempt, workerId: stage.workerId ?? null, commandId: command.commandId },
      }, signal);
    },
  });
}
function artifactRefs(value: unknown): import('../../domain/index.ts').ArtifactRef[] {
  if (!value || typeof value !== 'object') return [];
  if ('artifactId' in value && 'sha256' in value && 'mediaType' in value && 'size' in value) return [value as import('../../domain/index.ts').ArtifactRef];
  return Object.values(value).flatMap(artifactRefs);
}
