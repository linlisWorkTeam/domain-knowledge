import type { ArtifactRef } from '../../index.ts';
import type { RoleInput } from '../execution.ts';
import { requireMaterials } from '../execution.ts';

export interface Payload {
  knowledgeRef: ArtifactRef;
  publicInterfaceRefs: ArtifactRef[];
  languageId: string;
  buildContractRef: ArtifactRef;
  allowedGeneratedPaths: string[];
}
export type Input = RoleInput<Payload>;
export interface Output { files: { path: string; content: string }[]; }
export const outputSchema: Record<string, unknown> = {
  type: 'object', required: ['files'], additionalProperties: false,
  properties: {
    files: {
      type: 'array', minItems: 1,
      items: {
        type: 'object', required: ['path', 'content'], additionalProperties: false,
        properties: { path: { type: 'string', minLength: 1 }, content: { type: 'string', minLength: 1 } },
      },
    },
  },
};

export function schemaFor(input: Input): Record<string, unknown> {
  if (!input.payload.allowedGeneratedPaths.length) throw new Error('AGENT_COMMAND_INPUT_MISSING: allowedGeneratedPaths');
  return { ...outputSchema, properties: { files: { type: 'array', minItems: 1, maxItems: input.payload.allowedGeneratedPaths.length, items: { type: 'object', required: ['path', 'content'], additionalProperties: false, properties: { path: { enum: input.payload.allowedGeneratedPaths }, content: { type: 'string', minLength: 1 } } } } } };
}

export function validateInput(input: Input): void {
  requireMaterials(input.payload, input.materials, ['knowledgeRef', 'publicInterfaceRefs', 'languageId', 'buildContractRef', 'allowedGeneratedPaths']);
}

export function validateOutput(output: Output, input: Input): void {
  const seen = new Set<string>();
  for (const file of output.files) {
    if (!input.payload.allowedGeneratedPaths.includes(file.path)) throw new Error(`PROJECT_PATH_DENIED: ${file.path}`);
    if (seen.has(file.path)) throw new Error(`PROJECT_PATH_DUPLICATED: ${file.path}`);
    seen.add(file.path);
  }
}
