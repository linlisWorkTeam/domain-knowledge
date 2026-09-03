import Ajv2020Import from 'ajv/dist/2020.js';
import type { AgentProvider, AgentRequest } from '../../../application/ports/index.ts';

export interface ScenarioResponse {
  role: string;
  output: Record<string, unknown>;
}

const Ajv2020 = Ajv2020Import as unknown as new (options: Record<string, unknown>) => {
  compile(schema: Record<string, unknown>): {
    (value: unknown): boolean;
    errors?: unknown;
  };
  errorsText(errors: unknown): string;
};

export class SchemaValidatedScenarioAgent implements AgentProvider {
  readonly responses: ScenarioResponse[];
  readonly requests: AgentRequest[] = [];
  private cursor = 0;

  constructor(responses: ScenarioResponse[]) {
    this.responses = structuredClone(responses);
  }

  async run(request: AgentRequest, signal?: AbortSignal): Promise<Record<string, unknown>> {
    if (signal?.aborted) throw new Error('AGENT_CANCELLED');
    this.requests.push(structuredClone(request));
    const fixture = this.responses[this.cursor];
    if (!fixture) throw new Error(`SCENARIO_EXHAUSTED: unexpected ${request.role}`);
    if (fixture.role !== request.role) {
      throw new Error(`SCENARIO_ROLE_MISMATCH: expected ${fixture.role}, got ${request.role}`);
    }
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    const validate = ajv.compile(request.outputSchema);
    if (!validate(fixture.output)) {
      throw new Error(`AGENT_OUTPUT_INVALID: ${ajv.errorsText(validate.errors)}`);
    }
    this.cursor += 1;
    return structuredClone(fixture.output);
  }

  assertConsumed(): void {
    if (this.cursor !== this.responses.length) {
      throw new Error(`SCENARIO_INCOMPLETE: consumed ${this.cursor}/${this.responses.length}`);
    }
  }
}
