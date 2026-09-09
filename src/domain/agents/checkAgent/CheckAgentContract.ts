/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义只读检查角色的输入输出契约、输出 Schema 与材料校验。
 */
import type { ArtifactRef } from '../../Domain.ts';
import type { RoleInput } from '../AgentExecution.ts';
import { requireMaterials } from '../AgentExecution.ts';

/** 角色业务载荷。 */
export interface Payload {
  /** 提供diff引用信息，供调用方读取或传入。 */
  diffRef: ArtifactRef;
  /** 提供criteria引用信息，供调用方读取或传入。 */
  criteriaRef: ArtifactRef;
  /** 提供publicInterface引用列表信息，供调用方读取或传入。 */
  publicInterfaceRefs: ArtifactRef[];
}
/** 角色输入。 */
export type Input = RoleInput<Payload>;
/** 角色输出。 */
export interface CheckEvidence {
  criterionId: string; path: string; line: number; message: string; severity: 'BLOCKER' | 'INFO';
}
/** 检查证据指向本轮生成文件中的确切行。 */
export interface Output { blocking: boolean; findings: string[]; scope: string[]; evidence?: CheckEvidence[]; }
/** 对外提供输出Schema，作为调用方使用的统一约定。 */
export const outputSchema: Record<string, unknown> = {
  type: 'object', required: ['blocking', 'findings', 'scope'], additionalProperties: false,
  properties: {
    blocking: { type: 'boolean' }, findings: { type: 'array', items: { type: 'string' } },
    scope: { type: 'array', items: { type: 'string', minLength: 1 } },
    evidence: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['criterionId', 'path', 'line', 'message', 'severity'], properties: {
        criterionId: { type: 'string', minLength: 1 }, path: { type: 'string', minLength: 1 },
        line: { type: 'integer', minimum: 1 }, message: { type: 'string', minLength: 1 },
        severity: { enum: ['BLOCKER', 'INFO'] },
      } } },
  },
};

/** 构造本次角色执行使用的输出 Schema。 */
export function schemaFor(_input: Input): Record<string, unknown> {
  return outputSchema;
}

/** 检查本角色必需字段及所引用材料是否完整。 */
export function validateInput(input: Input): void {
  requireMaterials(input.payload, input.materials, ['diffRef', 'criteriaRef', 'publicInterfaceRefs']);
}

/** 模型不能报告脱离生成工件、超出文件行数或没有依据的阻塞问题。 */
export function validateOutput(output: Output, input: Input): void {
  const material = input.materials.find(({ ref }) => ref.artifactId === input.payload.diffRef.artifactId)?.content;
  const files = (material && typeof material === 'object' && 'files' in material && Array.isArray(material.files))
    ? material.files as { path: string; content: string }[] : [];
  const evidence = output.evidence ?? [];
  if (output.blocking && !evidence.some((item) => item.severity === 'BLOCKER')) throw new Error('CHECK_BLOCKING_EVIDENCE_REQUIRED');
  if (!output.blocking && evidence.some((item) => item.severity === 'BLOCKER')) throw new Error('CHECK_BLOCKING_CONTRADICTION');
  if (output.findings.length && !evidence.length) throw new Error('CHECK_FINDING_EVIDENCE_REQUIRED');
  for (const item of evidence) {
    const file = files.find((file) => file.path === item.path);
    if (!output.scope.includes(item.path) || !file || typeof file.content !== 'string'
      || item.line > file.content.split('\n').length) throw new Error('CHECK_EVIDENCE_LOCATION_INVALID');
  }
}
