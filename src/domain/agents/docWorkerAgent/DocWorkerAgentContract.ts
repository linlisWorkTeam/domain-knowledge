/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义文档分块角色的输入输出契约、输出 Schema 与材料校验。
 */
import type { ArtifactRef } from '../../Domain.ts';
import type { RoleInput } from '../AgentExecution.ts';
import { requireMaterials } from '../AgentExecution.ts';
import { StageValidationIssue } from '../StageValidation.ts';

/** 角色业务载荷。 */
export interface Payload {
  /** 提供模块标识信息，供调用方读取或传入。 */
  moduleId: string;
  /** 提供源码引用列表信息，供调用方读取或传入。 */
  sourceRefs: ArtifactRef[];
  /** 提供publicInterface引用列表信息，供调用方读取或传入。 */
  publicInterfaceRefs: ArtifactRef[];
  /** 提供assigned源码路径列表信息，供调用方读取或传入。 */
  assignedSourcePaths?: string[];
  /** 提供dependency引用列表信息，供调用方读取或传入。 */
  dependencyRefs?: ArtifactRef[];
}
/** 角色输入。 */
export type Input = RoleInput<Payload>;
/** 角色输出。 */
export interface SourceFact {
  /** 接口、行为或边界证据类别。 */
  kind: 'interface' | 'behavior' | 'boundary';
  /** 根据该段源码推导的业务陈述。 */
  statement: string;
  /** 固定提交中的授权源码路径。 */
  sourcePath: string;
  /** 1 起算的引用起始行。 */
  startLine: number;
  /** 引用闭区间结束行。 */
  endLine: number;
  /** 引用范围逐行原文，使用 LF 连接。 */
  quote: string;
}
/** 有源码依据的事实与尚缺证据的风险分别保留，供汇总时追踪。 */
export interface Output { workerId: string; fragment: string; provenance: string[]; facts: SourceFact[]; unresolvedRisks: string[]; }
/** 模型只选择已编号的源码范围，原文由受信材料提取。 */
export type ModelOutput = Omit<Output, 'facts'> & { facts: Array<Omit<SourceFact, 'quote'>> };
/** 对外提供输出Schema，作为调用方使用的统一约定。 */
export const outputSchema: Record<string, unknown> = {
  type: 'object', required: ['workerId', 'fragment', 'provenance', 'facts', 'unresolvedRisks'], additionalProperties: false,
  properties: {
    workerId: { type: 'string', minLength: 1 }, fragment: { type: 'string', minLength: 20 },
    provenance: { type: 'array', uniqueItems: true, items: { type: 'string', minLength: 1 } },
    facts: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['kind', 'statement', 'sourcePath', 'startLine', 'endLine', 'quote'],
      properties: {
        kind: { enum: ['interface', 'behavior', 'boundary'] }, statement: { type: 'string', minLength: 1 },
        sourcePath: { type: 'string', minLength: 1 }, startLine: { type: 'integer', minimum: 1 },
        endLine: { type: 'integer', minimum: 1 }, quote: { type: 'string', minLength: 1 },
      },
    } },
    unresolvedRisks: { type: 'array', uniqueItems: true, items: { type: 'string', minLength: 1 } },
  },
};

/** 构造本次角色执行使用的输出 Schema。 */
export function schemaFor(_input: Input): Record<string, unknown> {
  const schema = structuredClone(outputSchema) as any;
  const fact = schema.properties.facts.items;
  fact.required = fact.required.filter((field: string) => field !== 'quote');
  delete fact.properties.quote;
  return schema;
}

/** 先检查模型选中的授权范围，再生成逐字原文；不修补任何旧的失败工件。 */
export function resolveFacts(raw: ModelOutput, input: Input): Output {
  const sources = sourceTexts(input);
  const allowed = input.payload.assignedSourcePaths ?? input.sourcePaths;
  if (raw.provenance.some((path) => !allowed.includes(path))) throw new Error('DOC_WORKER_PROVENANCE_DENIED');
  const facts = raw.facts.map((fact, index) => {
    if (!allowed.includes(fact.sourcePath) || !raw.provenance.includes(fact.sourcePath)) throw new Error('DOC_WORKER_FACT_SOURCE_DENIED');
    const source = sources.get(fact.sourcePath);
    if (source === undefined) throw new Error('DOC_WORKER_SOURCE_TEXT_MISSING');
    const lines = source.split(/\r?\n/);
    if (fact.startLine > fact.endLine || fact.endLine > lines.length) {
      throw new StageValidationIssue('DOC_WORKER_FACT_RANGE_INVALID', `facts[${index}]`,
        `从已提供的编号源码选择闭区间，必须满足 1 <= startLine <= endLine <= ${lines.length}。`);
    }
    const quote = lines.slice(fact.startLine - 1, fact.endLine).join('\n');
    if (!quote.trim()) throw new StageValidationIssue('DOC_WORKER_FACT_EVIDENCE_EMPTY', `facts[${index}]`, '空白源码不能证明接口或行为；选择有实际源码的范围，证据缺失时记录风险。');
    return { ...fact, quote };
  });
  if (['interface', 'behavior', 'boundary'].some((kind) => !facts.some((fact) => fact.kind === kind)) && raw.unresolvedRisks.length === 0) {
    throw new StageValidationIssue('DOC_WORKER_MISSING_EVIDENCE_RISK', 'facts/unresolvedRisks', '补充缺失类别的有据事实；无法证明时保留具体证据缺口，不能隐去风险。');
  }
  const output = { ...raw, facts };
  validateFacts(output, input);
  return output;
}

/** 检查本角色必需字段及所引用材料是否完整。 */
export function validateInput(input: Input): void {
  requireMaterials(input.payload, input.materials, ['moduleId', 'sourceRefs', 'publicInterfaceRefs']);
  if (input.payload.assignedSourcePaths?.some((path) => !input.sourcePaths.includes(path))) {
    throw new Error('DOC_WORKER_ASSIGNED_SOURCE_DENIED');
  }
}

/** 从已加载的授权工件取源码，Domain 不读取磁盘或相信模型自报的行号。 */
export function sourceTexts(input: Input): Map<string, string> {
  const paths = input.payload.assignedSourcePaths ?? input.sourcePaths;
  const result = new Map<string, string>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (typeof record.path === 'string' && paths.includes(record.path) && typeof record.content === 'string') {
      if (result.has(record.path) && result.get(record.path) !== record.content) throw new Error('DOC_WORKER_SOURCE_AMBIGUOUS');
      result.set(record.path, record.content);
    }
    if (Array.isArray(record.files)) record.files.forEach(visit);
  };
  for (const ref of input.payload.sourceRefs) {
    const material = input.materials.find((item) => item.ref.artifactId === ref.artifactId);
    if (typeof material?.content === 'string' && paths.length === 1) {
      visit({ path: paths[0], content: material.content });
    } else visit(material?.content);
  }
  return result;
}

/** 对每条引用做路径、范围和逐行原文核验，证据不足时不得生成伪造事实。 */
export function validateFacts(output: Output, input: Input): void {
  const sources = sourceTexts(input);
  const allowed = input.payload.assignedSourcePaths ?? input.sourcePaths;
  if (output.provenance.some((path) => !allowed.includes(path))) throw new Error('DOC_WORKER_PROVENANCE_DENIED');
  for (const fact of output.facts) {
    if (!allowed.includes(fact.sourcePath) || !output.provenance.includes(fact.sourcePath)) {
      throw new Error('DOC_WORKER_FACT_SOURCE_DENIED');
    }
    const source = sources.get(fact.sourcePath);
    if (source === undefined) throw new Error('DOC_WORKER_SOURCE_TEXT_MISSING');
    const lines = source.split(/\r?\n/);
    if (fact.startLine > fact.endLine || fact.endLine > lines.length) throw new Error('DOC_WORKER_FACT_RANGE_INVALID');
    if (lines.slice(fact.startLine - 1, fact.endLine).join('\n') !== fact.quote) {
      throw new Error('DOC_WORKER_FACT_QUOTE_MISMATCH');
    }
  }
  if (['interface', 'behavior', 'boundary'].some((kind) => !output.facts.some((fact) => fact.kind === kind))
    && output.unresolvedRisks.length === 0) throw new Error('DOC_WORKER_MISSING_EVIDENCE_RISK');
}
