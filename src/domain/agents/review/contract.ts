import type { ArtifactRef } from '../../index.ts';
import type { RoleInput } from '../execution.ts';
import { requireMaterials } from '../execution.ts';

export interface Payload {
  knowledgeRef: ArtifactRef;
  evaluationReportRef: ArtifactRef;
  criteriaRef: ArtifactRef;
  previousCorrectionRefs?: ArtifactRef[];
}
export type Input = RoleInput<Payload>;
export interface Output { blocking: boolean; recommendation: 'PASS' | 'ITERATE'; correction: { correctionId: string; knowledgePath: string; criterion: string; risk: string } | null; }
export const outputSchema: Record<string, unknown> = {
  type: 'object', required: ['blocking', 'recommendation', 'correction'], additionalProperties: false,
  properties: {
    blocking: { type: 'boolean' }, recommendation: { enum: ['PASS', 'ITERATE'] },
    correction: {
      type: ['object', 'null'],
      properties: {
        correctionId: { type: 'string', minLength: 1 }, knowledgePath: { type: 'string', minLength: 1 },
        criterion: { type: 'string', minLength: 1 }, risk: { type: 'string', minLength: 1 },
      },
      required: ['correctionId', 'knowledgePath', 'criterion', 'risk'], additionalProperties: false,
    },
  },
};

export function schemaFor(_input: Input): Record<string, unknown> {
  return outputSchema;
}

export function validateInput(input: Input): void {
  requireMaterials(input.payload, input.materials, ['knowledgeRef', 'evaluationReportRef', 'criteriaRef']);
}
