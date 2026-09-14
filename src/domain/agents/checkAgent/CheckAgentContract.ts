/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：约束模型定位和比较结论，组装带冻结源码的报告。
 */
import type { ArtifactRef } from '../../Domain.ts';
import type { RoleInput } from '../AgentExecution.ts';
import { requireMaterials } from '../AgentExecution.ts';
import { extractEvidence, type Location, type CodeEvidence } from './CheckEvidence.ts';
export interface Payload { sourceSnapshotRef: ArtifactRef; generatedCodeRef: ArtifactRef; comparisonRulesRef: ArtifactRef }
export type Input = RoleInput<Payload>;
export type Side = { status: 'present'; locations: Location[] } | { status: 'missing'; checkedPaths: string[]; reason: string };
export interface Finding { ruleId: string; original: Side; generated: Side; message: string; severity: 'BLOCKER' | 'INFO' }
export interface Draft { scope: string[]; findings: Finding[] }
export type EvidenceSide = { status: 'present'; excerpts: CodeEvidence[] } | Extract<Side, { status: 'missing' }>;
export interface ReportFinding extends Omit<Finding, 'original' | 'generated'> { original: EvidenceSide; generated: EvidenceSide }
export interface Output { reportVersion: 'check-report-v2'; scope: string[]; findings: ReportFinding[]; blocking: boolean }
export interface Attempt { attempt: number; raw: unknown; errors: string[]; validEvidence: EvidenceSide[] }
export type FindingConclusion = Pick<Finding, 'ruleId' | 'message' | 'severity'>;
const text = { type: 'string', pattern: '\\S' };
function read<T>(input: Input, ref: ArtifactRef): T { return input.materials.find((m) => m.ref.artifactId === ref.artifactId)!.content as T; }
/** 外围字段或证据格式错误不能抹去已可识别的规则、分析及严重程度。 */
export function retainConclusions(raw: unknown, input: Input, retained: Map<number, FindingConclusion>): void {
  if (!raw || typeof raw !== 'object' || !('findings' in raw) || !Array.isArray(raw.findings)) return;
  const rules = read<{ id: string }[]>(input, input.payload.comparisonRulesRef);
  raw.findings.forEach((finding: unknown, index: number) => {
    if (retained.has(index) || !finding || typeof finding !== 'object') return;
    const f = finding as Record<string, unknown>;
    if (typeof f.ruleId === 'string' && rules.some((rule) => rule.id === f.ruleId)
      && typeof f.message === 'string' && /\S/.test(f.message) && (f.severity === 'BLOCKER' || f.severity === 'INFO')) {
      retained.set(index, { ruleId: f.ruleId, message: f.message, severity: f.severity });
    }
  });
}
export function sources(input: Input) {
  return { original: read<{ files: { path: string; content?: string }[] }>(input, input.payload.sourceSnapshotRef).files,
    generated: read<{ files: { path: string; content: string }[] }>(input, input.payload.generatedCodeRef).files };
}
export function schemaFor(input: Input): Record<string, unknown> {
  const files = sources(input);
  const side = (paths: string[]) => ({ oneOf: [
    { type: 'object', required: ['status', 'locations'], additionalProperties: false, properties: {
      status: { const: 'present' }, locations: { type: 'array', minItems: 1, items: {
        type: 'object', required: ['path', 'startLine', 'endLine', 'kind'], additionalProperties: false,
        properties: { path: { enum: paths }, startLine: { type: 'integer', minimum: 1 }, endLine: { type: 'integer', minimum: 1 }, kind: { enum: ['function', 'declaration'] } },
      } },
    } },
    { type: 'object', required: ['status', 'checkedPaths', 'reason'], additionalProperties: false, properties: {
      status: { const: 'missing' }, checkedPaths: { type: 'array', minItems: 1, uniqueItems: true, items: { enum: paths } }, reason: text,
    } },
  ] });
  const generatedPaths = files.generated.map((f) => f.path);
  const rules = read<{ id: string }[]>(input, input.payload.comparisonRulesRef);
  return { type: 'object', required: ['scope', 'findings'], additionalProperties: false, properties: {
    scope: { type: 'array', minItems: 1, uniqueItems: true, items: { enum: generatedPaths } },
    findings: { type: 'array', items: { type: 'object', required: ['ruleId', 'original', 'generated', 'message', 'severity'], additionalProperties: false,
      properties: { ruleId: { enum: rules.map((r) => r.id) }, original: side([...input.sourcePaths, ...input.publicInterfacePaths]), generated: side(generatedPaths), message: text, severity: { enum: ['BLOCKER', 'INFO'] } },
    } },
  } };
}
export function validateInput(input: Input): void {
  requireMaterials(input.payload, input.materials, ['sourceSnapshotRef', 'generatedCodeRef', 'comparisonRulesRef']);
  const rules = read<{ id: string; description: string }[]>(input, input.payload.comparisonRulesRef);
  if (!Array.isArray(rules) || !rules.length || rules.some((r) => !r.id?.trim() || !r.description?.trim())
    || new Set(rules.map((r) => r.id)).size !== rules.length) throw new Error('CHECK_RULES_REQUIRED');
  const files = sources(input);
  const paths = [...input.sourcePaths, ...input.publicInterfacePaths];
  if (!files.original || !files.generated?.length || paths.some((path) => typeof files.original.find((f) => f.path === path)?.content !== 'string')
    || files.generated.some((f) => !f.path || typeof f.content !== 'string')
    || new Set(files.generated.map((f) => f.path)).size !== files.generated.length) throw new Error('CHECK_MATERIAL_CONTENT_MISSING');
}
/** 缓存只属于本次冻结输入；修正不重写有效证据，任何错误都不能提交部分成功报告。 */
export function assembleReport(draft: Draft, input: Input, cache = new Map<string, EvidenceSide>()): { output: Output; errors: string[] } {
  const files = sources(input), paths = files.generated.map((f) => f.path), errors: string[] = [];
  if (draft.scope.length !== paths.length || paths.some((p) => !draft.scope.includes(p))) errors.push('CHECK_SCOPE_INVALID: scope must include all generated files');
  const side = (value: Side, which: 'original' | 'generated', at: string): EvidenceSide | undefined => {
    const key = JSON.stringify([which, value]);
    if (cache.has(key)) return cache.get(key)!;
    try {
      const allowed = which === 'original' ? [...input.sourcePaths, ...input.publicInterfacePaths] : paths;
      let evidence: EvidenceSide;
      if (value.status === 'missing') {
        if (value.checkedPaths.some((p) => !allowed.includes(p))) throw new Error('CHECK_EVIDENCE_INVALID: checked path is not authorized');
        if (allowed.some((p) => !value.checkedPaths.includes(p))) throw new Error('CHECK_MISSING_SCOPE_INCOMPLETE: list the complete authorized side before claiming absence');
        evidence = { ...value, checkedPaths: [...value.checkedPaths] };
      } else {
        evidence = { status: 'present', excerpts: value.locations.map((location) => {
          if (!allowed.includes(location.path)) throw new Error('CHECK_EVIDENCE_INVALID: path is not authorized');
          const file = files[which].find((f) => f.path === location.path);
          if (typeof file?.content !== 'string') throw new Error('CHECK_MATERIAL_CONTENT_MISSING');
          return extractEvidence(location, file.content);
        }) };
      }
      cache.set(key, evidence); return evidence;
    } catch (error) { errors.push(`${at}: ${error instanceof Error ? error.message : String(error)}`); return undefined; }
  };
  const findings: ReportFinding[] = [];
  draft.findings.forEach((f, i) => {
    if (f.original.status === 'missing' && f.generated.status === 'missing') { errors.push(`findings[${i}]: CHECK_BOTH_SIDES_MISSING`); return; }
    const original = side(f.original, 'original', `findings[${i}].original`);
    const generated = side(f.generated, 'generated', `findings[${i}].generated`);
    if (original && generated) findings.push({ ...f, original, generated });
  });
  return { output: { reportVersion: 'check-report-v2', scope: [...draft.scope], findings, blocking: findings.some((f) => f.severity === 'BLOCKER') }, errors };
}
export function renderEvidence(side: EvidenceSide): string {
  return side.status === 'missing' ? `未找到对应实现（Check 判断，程序未证明缺失）；检查范围：${side.checkedPaths.join(', ')}\n${side.reason}`
    : side.excerpts.map((e) => `${e.path}:${e.startLine}-${e.endLine}\n${e.content}`).join('\n\n');
}
