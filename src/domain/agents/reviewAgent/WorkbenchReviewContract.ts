/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义证据复核角色的输入输出契约、输出 Schema 与材料校验。
 */
import type { ArtifactRef } from '../../Domain.ts';
import type { RoleInput } from '../AgentExecution.ts';
import { requireMaterials } from '../AgentExecution.ts';
import { canonicalJson } from '../../workbench/StageTask.ts';
import { StageValidationIssue } from '../StageValidation.ts';
import { markdownSections } from '../docGenAgent/DocGenRevision.ts';

/** 角色业务载荷。 */
export interface Payload {
  executionContract: 'workbench-review-v1';
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
  concernResolutions?: Array<{ concernId: string; disposition: 'CONFIRMED' | 'DISPROVED' | 'UNRESOLVED'; reason: string; sourceQuotes: Array<{ path: string; quote: string }> }>;
}
/** 对外提供输出Schema，作为调用方使用的统一约定。 */
export const outputSchema: Record<string, unknown> = {
  type: 'object', required: ['blocking', 'recommendation', 'correction'], additionalProperties: false,
  properties: {
    blocking: { type: 'boolean' }, recommendation: { enum: ['PASS', 'ITERATE'], description: 'PASS 仅适用于无阻塞、无修订、无未解决风险；存在任一问题必须 ITERATE。' },
    unresolvedRisks: { type: 'array', items: { type: 'string', minLength: 1 } },
    concernResolutions: { type: 'array', maxItems: 0, items: { type: 'object', additionalProperties: false,
      required: ['concernId', 'disposition', 'reason', 'sourceQuotes'], properties: { concernId: { type: 'string', minLength: 1 },
        disposition: { enum: ['CONFIRMED', 'DISPROVED', 'UNRESOLVED'] }, reason: { type: 'string', minLength: 1 },
        sourceQuotes: { type: 'array', maxItems: 20, items: { type: 'object', additionalProperties: false, required: ['path', 'quote'], properties: { path: { type: 'string', minLength: 1 }, quote: { type: 'string', minLength: 1 } } } } } } },
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
export function schemaFor(input: Input): Record<string, unknown> {
  const allowed = scopedPaths(input);
  if (!allowed && !pendingConcerns(input).length) return outputSchema;
  const schema = structuredClone(outputSchema);
  const properties = (schema.properties as Record<string, unknown>);
  const correction = properties.correction as Record<string, unknown>;
  const fields = correction.properties as Record<string, Record<string, unknown>>;
  if (allowed) {
    fields.knowledgePath!.enum = correctionTargets(input).map(target => target.knowledgePath);
    fields.targetHeading!.enum = correctionTargets(input).map(target => target.heading);
  }
  const concerns = pendingConcerns(input);
  if (concerns.length) {
    schema.required = [...schema.required as string[], 'concernResolutions'];
    const resolutions = properties.concernResolutions as Record<string, unknown>;
    resolutions.minItems = concerns.length; resolutions.maxItems = concerns.length;
    const fields = (resolutions.items as Record<string, unknown>).properties as Record<string, Record<string, unknown>>;
    fields.concernId!.enum = concerns.map(c => c.concernId);
  }
  return schema;
}
function scopedPaths(input: Input): string[] | undefined {
  const criteria = input.materials.find(({ ref }) => ref.artifactId === input.payload.criteriaRef.artifactId)?.content;
  if (!criteria || typeof criteria !== 'object' || !('allowedKnowledgePaths' in criteria)) return undefined;
  const paths = criteria.allowedKnowledgePaths;
  if (!Array.isArray(paths) || !paths.length || paths.some(path => typeof path !== 'string') || new Set(paths).size !== paths.length) throw new Error('REVIEW_CORRECTION_SCOPE_INVALID');
  return paths as string[];
}
/** 授权范围先进入模型协议，不能在接受角色结果之后才发现越界。 */
export function correctionTargets(input: Input) {
  const content = input.materials.find(({ ref }) => ref.artifactId === input.payload.knowledgeRef.artifactId)?.content;
  const body = typeof content === 'string' ? content : content && typeof content === 'object' && 'body' in content && typeof content.body === 'string' ? content.body : '';
  const targets = markdownSections(body).map(({ heading }) => ({ heading, knowledgePath: `knowledge/${input.moduleId}.md#${heading}` }));
  const allowed = scopedPaths(input);
  if (!allowed) return targets;
  if (allowed.some(path => targets.filter(target => target.knowledgePath === path).length !== 1)) throw new Error('REVIEW_CORRECTION_SCOPE_INVALID');
  return targets.filter(target => allowed.includes(target.knowledgePath));
}

/** 检查本角色必需字段及所引用材料是否完整。 */
export function validateInput(input: Input): void {
  if (input.payload.executionContract !== 'workbench-review-v1' || Object.hasOwn(input.payload, 'comparisonReportRef')) throw new Error('REVIEW_EXECUTION_CONTRACT_INVALID');
  requireMaterials(input.payload, input.materials, ['knowledgeRef', 'evaluationReportRef', 'criteriaRef']);
  correctionTargets(input);
}

/** 纠正意见必须定位已有 H2；缺乏定位证据时交付未解决问题，不能凭空扩大修订范围。 */
export function validateOutput(output: Output, input: Input): void {
  validateConcernResolutions(output, input);
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
  if (!correctionTargets(input).some(target => target.knowledgePath === correction.knowledgePath)) throw new Error('REVIEW_CORRECTION_OUTSIDE_EVIDENCE');
  if (correction.replacementMarkdown !== undefined) {
    const replacements = markdownSections(correction.replacementMarkdown);
    if (replacements.length !== 1 || replacements[0]!.heading !== heading || replacements[0]!.start !== 0) {
      throw new StageValidationIssue('REVIEW_CORRECTION_RANGE_INVALID', 'correction.replacementMarkdown',
        'replacementMarkdown 若提供，必须以目标的 ## 二级标题开头，包含该章节完整正文，且不能包含其他二级章节；不能只返回 ### 子节。保留本章其他事实，不扩大修订范围；若无法给出完整替换，可省略这个可选字段，保留有证据的 criterion、risk 和未解决问题。');
    }
  }
}

/** 格式修复不会重新授权结论、原因和风险；跨任务尝试读取时同样适用。 */
export function assertReviewFormatHistory(outputs: Output[]): void {
  const facts = (output: Output) => canonicalJson({ ...output, correction: output.correction
    ? Object.fromEntries(Object.entries(output.correction).filter(([key]) => key !== 'replacementMarkdown')) : null });
  let baseline: string | undefined;
  for (const output of outputs) {
    if (baseline !== undefined && facts(output) !== baseline) throw new Error('REVIEW_REPAIR_FACTS_CHANGED');
    const correction = output.correction;
    if (!correction || typeof correction.replacementMarkdown !== 'string' || typeof correction.knowledgePath !== 'string') continue;
    const heading = correction.knowledgePath.slice(correction.knowledgePath.indexOf('#') + 1);
    const sections = markdownSections(correction.replacementMarkdown);
    if (sections.length !== 1 || sections[0]!.heading !== heading || sections[0]!.start !== 0) baseline ??= facts(output);
  }
}

export interface PendingReviewConcern { concernId: string; criterion: string; risk: string }
export function pendingConcerns(input: Input): PendingReviewConcern[] {
  const criteria = input.materials.find(({ ref }) => ref.artifactId === input.payload.criteriaRef.artifactId)?.content;
  if (!criteria || typeof criteria !== 'object' || !('pendingReviewConcerns' in criteria)) return [];
  const values = criteria.pendingReviewConcerns;
  if (!Array.isArray(values) || values.length > 1000 || values.some(v => !v || typeof v !== 'object'
    || typeof v.concernId !== 'string' || !v.concernId || typeof v.criterion !== 'string' || !v.criterion || typeof v.risk !== 'string' || !v.risk)
    || new Set(values.map(v => v.concernId)).size !== values.length) throw new Error('REVIEW_PENDING_CONCERNS_INVALID');
  return values;
}
/** 线索不是裁决；否定必须给出固定源码中确实存在的引用，判断本身仍由Review承担。 */
export function validateConcernResolutions(output: Output, input: Input): void {
  const concerns = pendingConcerns(input);
  if (!concerns.length) {
    if (output.concernResolutions?.length) throw new Error('REVIEW_CONCERN_UNBOUND');
    return;
  }
  const resolutions = output.concernResolutions;
  const invalid = (hint: string): never => { throw new StageValidationIssue('REVIEW_CONCERN_UNRESOLVED', 'concernResolutions', hint); };
  if (!Array.isArray(resolutions) || resolutions.length !== concerns.length || new Set(resolutions.map(v => v.concernId)).size !== concerns.length
    || resolutions.some(v => !concerns.some(c => c.concernId === v.concernId))) invalid('必须逐条回应所有待核实线索，保留原concernId；不能遗漏或虚构线索。');
  const reference = input.materials.find(({ ref }) => ref.artifactId === input.payload.checkReportRef?.artifactId)?.content as { files?: Array<{ path: string; content: string }> } | undefined;
  for (const resolution of resolutions!) {
    if (!['CONFIRMED', 'DISPROVED', 'UNRESOLVED'].includes(resolution.disposition) || !resolution.reason?.trim() || !Array.isArray(resolution.sourceQuotes)) invalid('回应需要结论、理由和sourceQuotes数组。');
    for (const quote of resolution.sourceQuotes) {
      const file = reference?.files?.find(f => f.path === quote.path);
      if (quote.quote?.trim() && file?.content.includes(quote.quote)) continue;
      if (quote.quote?.trim() && file?.content.replaceAll('\r\n', '\n').includes(quote.quote.replaceAll('\r\n', '\n'))) {
        invalid('源码引用的CRLF/LF换行符与固定文件不一致。保持原结论和理由，从checkReportRef逐字复制引用，在JSON中保留\\r\\n；也可引用足以支持理由的完整单行源码。不要改写源码、移除必要证据或改判PASS。');
      }
      invalid('源码引用必须逐字存在于本轮checkReportRef的固定文件中，不能引用其他材料或虚构文本。');
    }
    if (resolution.disposition === 'DISPROVED' && !resolution.sourceQuotes.length) invalid('否定线索必须提供固定源码的具体引用和理由，不能仅因测试通过而否定。');
    if (resolution.disposition === 'CONFIRMED' && (!output.correction || output.recommendation !== 'ITERATE')) invalid('确认线索需要保留定位修订意见和ITERATE结论。');
    if (resolution.disposition === 'UNRESOLVED' && (!output.unresolvedRisks?.length || output.recommendation !== 'ITERATE')) invalid('尚不能决定的线索需要保留unresolvedRisks与ITERATE，不能宣称通过。');
  }
}
