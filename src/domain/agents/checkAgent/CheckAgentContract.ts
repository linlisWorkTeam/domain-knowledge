/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义只读检查角色的输入输出契约、输出 Schema 与材料校验。
 */
import type { ArtifactRef } from '../../Domain.ts';
import type { RoleInput } from '../AgentExecution.ts';
import { requireMaterials } from '../AgentExecution.ts';

export interface Payload { sourceSnapshotRef: ArtifactRef; generatedCodeRef: ArtifactRef; comparisonRulesRef: ArtifactRef }
export type Input = RoleInput<Payload>;
export interface Finding { ruleId: string; sourcePath: string; path: string; original: string; generated: string; message: string; severity: 'BLOCKER' | 'INFO' }
export interface Output { blocking: boolean; findings: Finding[]; scope: string[] }
const text = { type: 'string', pattern: '\\S' };
export const outputSchema: Record<string, unknown> = {
  type: 'object', required: ['blocking', 'findings', 'scope'], additionalProperties: false,
  properties: { blocking: { type: 'boolean' }, scope: { type: 'array', minItems: 1, uniqueItems: true, items: text },
    findings: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['ruleId', 'sourcePath', 'path', 'original', 'generated', 'message', 'severity'],
      properties: { ruleId: text, sourcePath: text, path: text, original: text, generated: text, message: text, severity: { enum: ['BLOCKER', 'INFO'] } } } } },
};
export function schemaFor(_input: Input): Record<string, unknown> { return outputSchema; }
export function validateInput(input: Input): void {
  requireMaterials(input.payload, input.materials, ['sourceSnapshotRef', 'generatedCodeRef', 'comparisonRulesRef']);
}
/** 差异必须指向实际生成文件和用户给定规则；不从模型文本推导相似度阈值。 */
export function validateOutput(output: Output, input: Input): void {
  const read = (ref: ArtifactRef) => input.materials.find((item) => item.ref.artifactId === ref.artifactId)!.content;
  const code = read(input.payload.generatedCodeRef) as { files: { path: string; content: string }[] };
  const rules = read(input.payload.comparisonRulesRef) as { id: string; description: string }[];
  const paths = code.files.map((file) => file.path);
  if (output.scope.some((path) => !paths.includes(path)) || paths.some((path) => !output.scope.includes(path))) throw new Error('CHECK_SCOPE_INVALID');
  if (output.blocking !== output.findings.some((finding) => finding.severity === 'BLOCKER')) throw new Error('CHECK_BLOCKING_INCONSISTENT');
  for (const finding of output.findings) {
    if (![...input.sourcePaths, ...input.publicInterfacePaths].includes(finding.sourcePath) || !rules.some((rule) => rule.id === finding.ruleId) || !output.scope.includes(finding.path)
      || !code.files.find((file) => file.path === finding.path)!.content.includes(finding.generated)) throw new Error('CHECK_EVIDENCE_INVALID');
  }
}
