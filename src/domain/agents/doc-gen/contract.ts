import type { ArtifactRef } from '../../index.ts';
import type { RoleInput } from '../execution.ts';
import { requireMaterials } from '../execution.ts';

export interface Payload {
  moduleId: string;
  sourceRefs: ArtifactRef[];
  publicInterfaceRefs: ArtifactRef[];
  workerFragmentRefs?: ArtifactRef[];
  baseKnowledgeRef?: ArtifactRef;
  corrections?: unknown[];
  qualityFeedback?: unknown;
}
export type Input = RoleInput<Payload>;
export interface Output { body: string; title: string; description: string; }
export const outputSchema: Record<string, unknown> = {
  type: 'object', required: ['body', 'title', 'description'], additionalProperties: false,
  properties: {
    body: { type: 'string', minLength: 200 }, title: { type: 'string', minLength: 1 },
    description: { type: 'string', minLength: 1 },
  },
};

export function schemaFor(_input: Input): Record<string, unknown> {
  return outputSchema;
}

export function validateInput(input: Input): void {
  requireMaterials(input.payload, input.materials, ['moduleId', 'sourceRefs', 'publicInterfaceRefs']);
}
