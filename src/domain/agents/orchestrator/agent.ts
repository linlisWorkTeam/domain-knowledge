import type { AgentId } from '../contracts.ts';
import type { ExecutionContext, RoleResult, PendingArtifact } from '../execution.ts';
import { assertActive } from '../execution.ts';
import { type Input, type Output, schemaFor, validateInput } from './contract.ts';
import { definition, buildPrompt, readablePaths } from './prompt.ts';

export async function execute(input: Input, context: ExecutionContext): Promise<RoleResult<Output>> {
  assertActive(context.signal);
  validateInput(input);
  const schema = schemaFor(input);
  const raw = await context.model.execute({
    role: definition.agentId,
    prompt: buildPrompt(input, context),
    outputSchema: schema,
    tools: definition.tools,
    readablePaths: readablePaths(input),
  }, context.signal);
  assertActive(context.signal);
  context.model.assertOutput(raw, schema);
  const output = raw as unknown as Output;
  const artifacts: PendingArtifact[] = [];
  const nodes: Array<[AgentId, AgentId[], string[], string[]]> = [
    ['doc-worker', [], ['source:read'], ['knowledge-chunk']],
    ['doc-gen', ['doc-worker'], ['source:read', 'cas:write'], ['knowledge-candidate']],
    ['test-gen', [], ['source:read', 'cas:write'], ['test-candidates']],
    ['code', ['doc-gen'], ['workspace:write', 'cas:write'], ['code-artifact']],
    ['check', ['code'], ['workspace:read'], ['findings']],
    ['review', ['check'], ['cas:read'], ['attribution']],
  ];
  const payload = {
    resultKind: 'plan',
    nodes: nodes.map(([agentType, dependsOn, resourceClaims, artifactExpectations]) => ({
      nodeId: { agentNode: agentType },
      agentType,
      dependsOn: dependsOn.map((role) => ({ agentNode: role })),
      generationKey: { agentGeneration: agentType },
      inputSchema: 'https://wpknowledge.local/schemas/agent-command/v1',
      outputSchema: 'https://wpknowledge.local/schemas/agent-result/v1',
      resourceClaims,
      artifactExpectations,
    })),
  };
  return { output, payload, artifacts };
}
