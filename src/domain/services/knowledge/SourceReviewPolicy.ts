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
