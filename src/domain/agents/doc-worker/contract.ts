import type { ArtifactRef } from '../../index.ts';
import type { RoleInput } from '../execution.ts';
import { requireMaterials } from '../execution.ts';

export interface Payload {
  moduleId: string;
  sourceRefs: ArtifactRef[];
  publicInterfaceRefs: ArtifactRef[];
  assignedSourcePaths?: string[];
  dependencyRefs?: ArtifactRef[];
}
export type Input = RoleInput<Payload>;
export interface Output { workerId: string; fragment: string; provenance: string[]; }
export const outputSchema: Record<string, unknown> = {
  type: 'object', required: ['workerId', 'fragment', 'provenance'], additionalProperties: false,
  properties: {
    workerId: { type: 'string', minLength: 1 }, fragment: { type: 'string', minLength: 20 },
    provenance: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
  },
};

export function schemaFor(_input: Input): Record<string, unknown> {
  return outputSchema;
}

export function validateInput(input: Input): void {
  requireMaterials(input.payload, input.materials, ['moduleId', 'sourceRefs', 'publicInterfaceRefs']);
}
