/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义证据复核角色的输入输出契约、输出 Schema 与材料校验。
 */
import type { ArtifactRef } from '../../Domain.ts';
import type { RoleInput } from '../AgentExecution.ts';
import { requireMaterials } from '../AgentExecution.ts';
import { StageValidationIssue } from '../StageValidation.ts';
import { markdownSections } from '../docGenAgent/DocGenRevision.ts';

/** 角色业务载荷。 */
export interface Payload {
  /** 提供知识引用信息，供调用方读取或传入。 */
  knowledgeRef: ArtifactRef;
  /** 提供评测报告引用信息，供调用方读取或传入。 */
  evaluationReportRef: ArtifactRef;
  /** 本轮只读检查工件，单角色旧记录可省略。 */
  checkReportRef?: ArtifactRef;
  /** 提供criteria引用信息，供调用方读取或传入。 */
  criteriaRef: ArtifactRef;
  /** 提供previous纠正意见引用列表信息，供调用方读取或传入。 */
  previousCorrectionRefs?: ArtifactRef[];
}
/** 角色输入。 */
export type Input = RoleInput<Payload>;
/** 角色输出。 */
export interface Output {
  blocking: boolean; recommendation: 'PASS' | 'ITERATE';
  correction: { correctionId: string; knowledgePath: string; criterion: string; risk: string; targetHeading?: string; replacementMarkdown?: string } | null;
  unresolvedRisks?: string[];
}
/** 对外提供输出Schema，作为调用方使用的统一约定。 */
export const outputSchema: Record<string, unknown> = {
  type: 'object', required: ['blocking', 'recommendation', 'correction'], additionalProperties: false,
  properties: {
    blocking: { type: 'boolean' }, recommendation: { enum: ['PASS', 'ITERATE'], description: 'PASS 仅适用于无阻塞、无修订、无未解决风险；存在任一问题必须 ITERATE。' },
    unresolvedRisks: { type: 'array', items: { type: 'string', minLength: 1 } },
    correction: {
      type: ['object', 'null'],
      properties: {
        correctionId: { type: 'string', minLength: 1 }, knowledgePath: { type: 'string', minLength: 1 },
        criterion: { type: 'string', minLength: 1 }, risk: { type: 'string', minLength: 1 },
        targetHeading: { type: 'string', minLength: 1 }, replacementMarkdown: { type: 'string', minLength: 1 },
      },
      required: ['correctionId', 'knowledgePath', 'criterion', 'risk'], additionalProperties: false,
    },
  },
};

/** 构造本次角色执行使用的输出 Schema。 */
export function schemaFor(_input: Input): Record<string, unknown> {
  return outputSchema;
}

/** 检查本角色必需字段及所引用材料是否完整。 */
export function validateInput(input: Input): void {
  requireMaterials(input.payload, input.materials, ['knowledgeRef', 'evaluationReportRef', 'criteriaRef']);
}

/** 纠正意见必须定位已有 H2；缺乏定位证据时交付未解决问题，不能凭空扩大修订范围。 */
export function validateOutput(output: Output, input: Input): void {
  if (output.recommendation === 'PASS' && (output.blocking || output.correction || output.unresolvedRisks?.length)) {
    throw new StageValidationIssue('REVIEW_PASS_CONTRADICTION', 'recommendation/blocking/correction/unresolvedRisks',
      'PASS 必须同时 blocking=false、correction=null、unresolvedRisks=[]。仍有风险时应返回 ITERATE 并保留风险；不能为满足结构而删除风险或宣称证据已存在。');
  }
  const correction = output.correction;
  if (!correction) return;
  const prefix = `knowledge/${input.moduleId}.md#`;
  if (!correction.knowledgePath.startsWith(prefix)) throw new Error('REVIEW_CORRECTION_SCOPE_INVALID');
  const heading = correction.knowledgePath.slice(prefix.length);
  const content = input.materials.find(({ ref }) => ref.artifactId === input.payload.knowledgeRef.artifactId)?.content;
  const body = typeof content === 'string' ? content
    : content && typeof content === 'object' && 'body' in content && typeof content.body === 'string' ? content.body : '';
  const headings = markdownSections(body).map((section) => section.heading);
  if (!heading || headings.filter((item) => item === heading).length !== 1
    || (correction.targetHeading !== undefined && correction.targetHeading !== heading)) throw new Error('REVIEW_CORRECTION_SCOPE_INVALID');
  if (correction.replacementMarkdown !== undefined) {
    const replacements = markdownSections(correction.replacementMarkdown);
    if (replacements.length !== 1 || replacements[0]!.heading !== heading || replacements[0]!.start !== 0) {
      throw new Error('REVIEW_CORRECTION_RANGE_INVALID');
    }
  }
}
