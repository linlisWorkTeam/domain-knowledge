/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：限定版本化来源复核期限，保留旧输入和普通Review的原期限。
 */
export const SOURCE_REVIEW_POLICY = Object.freeze({ schemaVersion: 'source-review-policy-v1', timeoutMs: 600_000 } as const);
export function readSourceReviewPolicy(value: unknown): typeof SOURCE_REVIEW_POLICY | null {
  if (value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== 2 || !('schemaVersion' in value) || value.schemaVersion !== SOURCE_REVIEW_POLICY.schemaVersion
    || !('timeoutMs' in value) || value.timeoutMs !== SOURCE_REVIEW_POLICY.timeoutMs) throw new Error('SOURCE_REVIEW_POLICY_INVALID');
  return SOURCE_REVIEW_POLICY;
}
export function sourceReviewTimeoutMs(criteria: unknown): number {
  if (!criteria || typeof criteria !== 'object' || !('sourceReviewPolicy' in criteria)) return 180_000;
  if (!('phase' in criteria) || !['FINAL_SOURCE_REVIEW', 'REVISION_SOURCE_REVIEW'].includes(String(criteria.phase))) throw new Error('SOURCE_REVIEW_POLICY_INVALID');
  const policy = readSourceReviewPolicy(criteria.sourceReviewPolicy);
  if (!policy) throw new Error('SOURCE_REVIEW_POLICY_INVALID');
  return policy.timeoutMs;
}

/** 来源事实判断策略进入阶段身份；旧输入不补写新提示词。 */
export const SOURCE_ASSESSMENT_POLICY = 'source-assessment-v1' as const;
export function readSourceAssessmentPolicy(value: unknown): typeof SOURCE_ASSESSMENT_POLICY | null {
  if (value === undefined) return null;
  if (value !== SOURCE_ASSESSMENT_POLICY) throw new Error('SOURCE_ASSESSMENT_POLICY_INVALID');
  return SOURCE_ASSESSMENT_POLICY;
}
export function sourceAssessmentInstruction(criteria: unknown): string {
  if (!criteria || typeof criteria !== 'object' || !('sourceAssessmentPolicy' in criteria)) return '';
  const policy = readSourceAssessmentPolicy(criteria.sourceAssessmentPolicy);
  if (!policy || !('phase' in criteria) || !['FINAL_SOURCE_REVIEW', 'REVISION_SOURCE_REVIEW'].includes(String(criteria.phase))) throw new Error('SOURCE_ASSESSMENT_POLICY_INVALID');
  return '\n来源复核模式 source-assessment-v1：本阶段专门判断授权正文与固定参考源码的一致性。上面的通用 Review 指令及用户补充仍保留，但其中普通评测的材料名称须按本阶段契约解释：checkReportRef 是固定参考源码，evaluationReportRef 是参考实现观察，criteriaRef 给出授权章节及冻结绑定；不得要求本阶段未声明的生成代码对比报告、historySummary 或 previousCorrectionRefs。必须依据内联源码逐项核对事实，不能因为测试通过就放行。接口签名、控制流及来源元信息等静态事实可以由相应源码和绑定直接证明，不要求每个非行为段落都有专用测试；NO_DIRECT_BEHAVIOR_EVIDENCE 仍表示没有直接行为覆盖。声称运行验证、平台或宏组合覆盖的文字必须有对应实测证据，不得从源码或单次构建推断全覆盖。诚实标注的范围外事项不自动构成当前范围内事实错误；正文若承诺该行为、与范围声明矛盾或证据无法决定其真实性，仍须保留具体未知风险。publicationVerified=false 仅表示尚未获发布授权，不能据此推断编译失败。只复核授权章节及明确授权的前言，不将其他章节未审查视为本节风险。明确矛盾必须提出定位修订；无法证明的断言保留 unresolvedRisks，不得为了通过而删除风险、修改可信测试或预期。';
}
