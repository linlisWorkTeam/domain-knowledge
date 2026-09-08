import type { ArtifactRef } from '../../index.ts';
import type { RoleInput } from '../execution.ts';
import { requireMaterials } from '../execution.ts';

export interface Payload {
  policyRef: ArtifactRef;
  moduleRefs: ArtifactRef[];
  latestReportRef?: ArtifactRef;
}
export type Input = RoleInput<Payload>;
export interface Output { strategy: string; iteration: number; parallel: string[]; }
export const outputSchema: Record<string, unknown> = {
  type: 'object', required: ['strategy', 'iteration', 'parallel'], additionalProperties: false,
  properties: {
    strategy: { type: 'string', minLength: 1 }, iteration: { type: 'integer', minimum: 0 },
    parallel: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
  },
};

export function schemaFor(_input: Input): Record<string, unknown> {
  return outputSchema;
}

export function validateInput(input: Input): void {
  requireMaterials(input.payload, input.materials, ['policyRef', 'moduleRefs']);
}
