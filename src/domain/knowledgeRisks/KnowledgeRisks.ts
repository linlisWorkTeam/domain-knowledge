/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：以冻结范围和本轮评测证据复核知识风险，保留原始声明。
 */
import { sha256, type ArtifactRef } from '../Domain.ts';

/** 这些声明只表示固定验收的待验证事项，不能承载任意缺陷描述。 */
export const VERIFICATION_NEEDS = {
  MODULE_BEHAVIOR_TESTS: '当前版本尚未通过固定及已晋升案例；通过仅证明这些案例，不证明全部可能输入。',
  SYSTEM_INTEGRATION: '系统集成行为不属于独立模块公开接口验收，未验证。',
  OUTSIDE_PUBLIC_TYPES: '公开类型外输入不属于独立模块公开接口验收，未验证。',
} as const;
export type VerificationNeed = keyof typeof VERIFICATION_NEEDS;
/** 原始记录不可改写；每次评测重新形成处置记录，不继承上轮通过。 */
export interface KnowledgeRisk {
  schemaVersion: 'knowledge-risk-v1'; riskId: string; kind: VerificationNeed | 'MISSING_EVIDENCE';
  statement: string; sourceRef: ArtifactRef;
}
/** 处置仅在关联版本及证据范围内有效，OPEN 始终阻塞。 */
export interface RiskAssessment extends KnowledgeRisk {
  status: 'OPEN' | 'VERIFIED' | 'OUT_OF_SCOPE'; evidenceRefs: ArtifactRef[]; reason: string;
}
/** 普通风险原样保留，预定义待验证事项由程序产生精确声明。 */
export function collectRisks(fragments: Array<{ ref: ArtifactRef; content: unknown }>): KnowledgeRisk[] {
  return fragments.flatMap(({ ref, content }) => {
    const item = content as { unresolvedRisks?: string[]; verificationNeeds?: VerificationNeed[] } | null;
    const entries = [
      ...(item?.unresolvedRisks ?? []).map(statement => ({ kind: 'MISSING_EVIDENCE' as const, statement })),
      ...(item?.verificationNeeds ?? []).map(kind => {
        if (!Object.hasOwn(VERIFICATION_NEEDS, kind)) throw new Error('KNOWLEDGE_RISK_KIND_INVALID');
        return { kind, statement: VERIFICATION_NEEDS[kind] };
      }),
    ];
    return entries.map(entry => ({ schemaVersion: 'knowledge-risk-v1' as const,
      riskId: `risk:${sha256(`${ref.artifactId}:${entry.kind}:${entry.statement}`)}`, ...entry, sourceRef: ref }));
  });
}
/** Domain 仅接受 Application 绑定本轮固定材料的事实；不接受模型的处置建议。 */
export function assessRisks(risks: KnowledgeRisk[], input: {
  moduleScope: boolean; scopeRef: ArtifactRef; evaluationRef: ArtifactRef;
  passed: boolean; infrastructureFailure: boolean; testsPassed: number; testsTotal: number; stability: number;
}): RiskAssessment[] {
  return risks.map(risk => {
    const base: RiskAssessment = { ...risk, status: 'OPEN', evidenceRefs: [risk.sourceRef], reason: '缺少可验证的处置依据；模型自评不能清除风险。' };
    if (risk.schemaVersion !== 'knowledge-risk-v1') return base;
    if (risk.kind === 'MISSING_EVIDENCE' || !Object.hasOwn(VERIFICATION_NEEDS, risk.kind)
      || risk.statement !== VERIFICATION_NEEDS[risk.kind]) return base;
    if (!input.moduleScope) return base;
    if (risk.kind !== 'MODULE_BEHAVIOR_TESTS') return { ...base, status: 'OUT_OF_SCOPE',
      evidenceRefs: [risk.sourceRef, input.scopeRef], reason: '仅按冻结的独立模块公开类型契约排除，限制仍保留，不声称已验证。' };
    if (!Number.isSafeInteger(input.testsTotal) || !Number.isSafeInteger(input.testsPassed)
      || !input.passed || input.infrastructureFailure || input.testsTotal <= 0
      || input.testsPassed !== input.testsTotal || input.stability !== 1) return base;
    return { ...base, status: 'VERIFIED', evidenceRefs: [risk.sourceRef, input.scopeRef, input.evaluationRef],
      reason: '当前版本固定及已晋升案例全部通过；未覆盖输入仍无验证结论。' };
  });
}
