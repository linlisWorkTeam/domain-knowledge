/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义证据复核角色的输入输出契约、输出 Schema 与材料校验。
 */
import { correctionTarget } from '../docGenAgent/DocGenRevision.ts';
import type { ArtifactRef } from '../../Domain.ts';
import type { RoleInput } from '../AgentExecution.ts';
import { requireMaterials } from '../AgentExecution.ts';
export interface Payload { knowledgeRef: ArtifactRef; evaluationReportRef: ArtifactRef; comparisonReportRef: ArtifactRef; previousCorrectionRefs?: ArtifactRef[] }
export type Input = RoleInput<Payload>;
export interface Correction { correctionId: string; knowledgePath: string; problem: string; suggestion: string; evidence: ('comparison' | 'evaluation')[] }
export interface Output { blocking: boolean; corrections: Correction[]; historySummary?: string }
const text = { type: 'string', pattern: '\\S' };
export const outputSchema: Record<string, unknown> = {
  type: 'object', required: ['blocking', 'corrections'], additionalProperties: false,
  properties: { historySummary: text, blocking: { type: 'boolean' }, corrections: { type: 'array', items: {
    type: 'object', additionalProperties: false, required: ['correctionId', 'knowledgePath', 'problem', 'suggestion', 'evidence'],
    properties: { correctionId: text, knowledgePath: text, problem: text, suggestion: text,
      evidence: { type: 'array', minItems: 1, uniqueItems: true, items: { enum: ['comparison', 'evaluation'] } } },
  } } },
};
export function schemaFor(input: Input): Record<string, unknown> {
  return input.payload.previousCorrectionRefs?.length
    ? { ...outputSchema, required: ['blocking', 'corrections', 'historySummary'] } : outputSchema;
}
export function validateInput(input: Input): void {
  requireMaterials(input.payload, input.materials, ['knowledgeRef', 'evaluationReportRef', 'comparisonReportRef']);
}
/** 定位必须出现在本轮知识正文中；不能为其他卡片创建修订意见。 */
export function validateOutput(output: Output, input: Input): void {
  const knowledge = input.materials.find(({ ref }) => ref.artifactId === input.payload.knowledgeRef.artifactId)!.content;
  const ids = output.corrections.map((item) => item.correctionId);
  if (new Set(ids).size !== ids.length) throw new Error('REVIEW_CORRECTION_DUPLICATED');
  if (typeof knowledge !== 'string') throw new Error('REVIEW_LOCATION_INVALID');
  for (const item of output.corrections) {
    try { correctionTarget(knowledge, input.moduleId, item.knowledgePath); }
    catch { throw new Error('REVIEW_LOCATION_INVALID'); }
  }
}
