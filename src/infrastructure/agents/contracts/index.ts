import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import Ajv2020Import from 'ajv/dist/2020.js';
import addFormatsImport from 'ajv-formats';
import type {
  AgentCommand, AgentContractValidator, AgentResult,
} from '../../../application/ports/index.ts';

const Ajv2020 = Ajv2020Import as unknown as new (options: Record<string, unknown>) => {
  addSchema(schema: Record<string, unknown>): void;
  compile(schema: Record<string, unknown>): {
    (value: unknown): boolean;
    errors?: unknown;
  };
  errorsText(errors: unknown): string;
};

type AddFormats = (ajv: InstanceType<typeof Ajv2020>) => void;
const addFormats = addFormatsImport as unknown as AddFormats;

function loadSchema(schemaDirectory: string, filename: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(schemaDirectory, filename), 'utf8')) as Record<string, unknown>;
}

export class JsonSchemaAgentContractValidator implements AgentContractValidator {
  private readonly validateCommand: ReturnType<InstanceType<typeof Ajv2020>['compile']>;
  private readonly validateResult: ReturnType<InstanceType<typeof Ajv2020>['compile']>;
  private readonly ajv: InstanceType<typeof Ajv2020>;

  constructor(schemaDirectory: string) {
    this.ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(this.ajv);
    const root = resolve(schemaDirectory);
    this.ajv.addSchema(loadSchema(root, 'artifact-ref.schema.json'));
    this.ajv.addSchema(loadSchema(root, 'correction.schema.json'));
    this.validateCommand = this.ajv.compile(loadSchema(root, 'agent-command.schema.json'));
    this.validateResult = this.ajv.compile(loadSchema(root, 'agent-result.schema.json'));
  }

  assertCommand(command: AgentCommand): void {
    if (!this.validateCommand(command)) {
      throw new Error(`AGENT_COMMAND_INVALID: ${this.ajv.errorsText(this.validateCommand.errors)}`);
    }
  }

  assertResult(result: AgentResult): void {
    if (!this.validateResult(result)) {
      throw new Error(`AGENT_RESULT_INVALID: ${this.ajv.errorsText(this.validateResult.errors)}`);
    }
  }
}
