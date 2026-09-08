import { sha256 } from '../../index.ts';
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
  const review = output;
  const evaluationRef = input.payload.evaluationReportRef;
  const correction = review.correction;
  const corrections = correction ? [{
    correctionId: correctionId(correction['correctionId']),
    knowledgePath: String(correction['knowledgePath']),
    criterion: String(correction['criterion']),
    evidenceRefs: [evaluationRef],
    risk: String(correction['risk']),
  }] : [];
  const payload = {
    resultKind: 'attribution',
    corrections,
    unresolvedRisks: review.blocking && corrections.length === 0
      ? ['review reported a blocking condition without a correction']
      : [],
  };
  return { output, payload, artifacts };
}

function correctionId(value: unknown): string {
  const candidate = String(value ?? '');
  if (/^COR-[0-9]{4,}$/.test(candidate)) return candidate;
  return `COR-${String(parseInt(sha256(candidate).slice(0, 8), 16)).padStart(10, '0')}`;
}
