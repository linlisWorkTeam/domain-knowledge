import type { ExecutionContext, RoleResult, PendingArtifact } from '../execution.ts';
import { assertActive, pending } from '../execution.ts';
import { type Input, type Output, schemaFor, validateInput, validateOutput } from './contract.ts';
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
  validateOutput(output, input);
  const artifacts: PendingArtifact[] = [];
  const payload = { resultKind: 'codeArtifact', codeRef: pending('raw'), buildManifestRef: pending('raw') };
  return { output, payload, artifacts };
}
