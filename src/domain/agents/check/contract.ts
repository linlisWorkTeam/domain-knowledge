import type { ArtifactRef } from '../../index.ts';
import type { RoleInput } from '../execution.ts';
import { requireMaterials } from '../execution.ts';

export interface Payload {
  diffRef: ArtifactRef;
  criteriaRef: ArtifactRef;
  publicInterfaceRefs: ArtifactRef[];
}
export type Input = RoleInput<Payload>;
export interface Output { blocking: boolean; findings: string[]; scope: string[]; }
export const outputSchema: Record<string, unknown> = {
  type: 'object', required: ['blocking', 'findings', 'scope'], additionalProperties: false,
  properties: {
    blocking: { type: 'boolean' }, findings: { type: 'array', items: { type: 'string' } },
    scope: { type: 'array', items: { type: 'string', minLength: 1 } },
  },
};

export function schemaFor(_input: Input): Record<string, unknown> {
  return outputSchema;
}

export function validateInput(input: Input): void {
  requireMaterials(input.payload, input.materials, ['diffRef', 'criteriaRef', 'publicInterfaceRefs']);
}
