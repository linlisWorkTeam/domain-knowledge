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
  const check = output;
  const payload = {
    resultKind: 'findings',
    findings: check.findings.map((message, index) => ({
      findingId: `finding-${index + 1}`,
      severity: check.blocking ? 'BLOCKER' : 'INFO',
      criterionId: 'deterministic-check',
      evidenceLocation: check.scope[0] ?? `workflow:${context.command.agentType}`,
      message,
    })),
  };
  return { output, payload, artifacts };
}
