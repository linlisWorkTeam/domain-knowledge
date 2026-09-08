import type { ExecutionContext, RoleResult, PendingArtifact } from '../execution.ts';
import { assertActive, pending } from '../execution.ts';
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
  const fragment = String(output.fragment);
  const chunkRef = pending('chunk');
  artifacts.push({ key: 'chunk', content: fragment, mediaType: 'text/plain' });
  const payload = {
    resultKind: 'knowledgeChunk',
    chunkRef,
    provenance: input.provenance,
    unresolvedRisks: [],
  };
  return { output, payload, artifacts };
}
