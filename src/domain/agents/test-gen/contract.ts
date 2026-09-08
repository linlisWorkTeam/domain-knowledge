import type { ArtifactRef } from '../../index.ts';
import type { RoleInput } from '../execution.ts';
import { requireMaterials } from '../execution.ts';

export interface Payload {
  moduleId: string;
  sourceSnapshotRef: ArtifactRef;
  publicInterfaceRefs: ArtifactRef[];
  languageId: string;
  testPolicyRef: ArtifactRef;
}
export type Input = RoleInput<Payload>;
export interface Output { candidateCommands: Record<string, unknown>[]; oracleRequired: boolean; }
export const outputSchema: Record<string, unknown> = {
  type: 'object', required: ['candidateCommands', 'oracleRequired'], additionalProperties: false,
  properties: {
    candidateCommands: { type: 'array', minItems: 1, items: { type: 'object' } },
    oracleRequired: { type: 'boolean' },
  },
};

export function schemaFor(_input: Input): Record<string, unknown> {
  return outputSchema;
}

export function validateInput(input: Input): void {
  requireMaterials(input.payload, input.materials, ['moduleId', 'sourceSnapshotRef', 'publicInterfaceRefs', 'languageId', 'testPolicyRef']);
}
