/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：实现证据复核角色的业务步骤与结构化结果转换。
 */
import { sha256 } from '../../Domain.ts';
import type { ExecutionContext, RoleResult, PendingArtifact } from '../AgentExecution.ts';
import { assertActive } from '../AgentExecution.ts';
import { type Input, type Output, schemaFor, validateInput, validateOutput } from './WorkbenchReviewContract.ts';
import { validatedStage, StageValidationIssue } from '../StageValidation.ts';
import { canonicalJson } from '../../workbench/StageTask.ts';
import { sourceReviewTimeoutMs } from '../../knowledge/SourceReviewPolicy.ts';
import { definition, buildPrompt, readablePaths } from './WorkbenchReviewPrompt.ts';

/** 依据知识与评测证据给出纠正意见，并将意见绑定到本轮评测工件。 */
export async function execute(input: Input, context: ExecutionContext): Promise<RoleResult<Output>> {
  assertActive(context.signal);
  // 缺失材料应在调用模型之前失败，避免模型用猜测填补业务证据。
  validateInput(input);
  const schema = schemaFor(input);
  const criteria = input.materials.find(material => material.ref.artifactId === input.payload.criteriaRef.artifactId)?.content;
  const facts = (output: Output) => canonicalJson({ ...output, correction: output.correction
    ? Object.fromEntries(Object.entries(output.correction).filter(([key]) => key !== 'replacementMarkdown')) : null });
  let preservedFacts: string | undefined;
  const captureFormatFailure = (output: Output, error: unknown) => {
    if (error instanceof StageValidationIssue && error.issue.code === 'REVIEW_CORRECTION_RANGE_INVALID') {
      preservedFacts ??= facts(output);
      error.issue.hint += ` 本次仅允许改变或省略replacementMarkdown，其他字段必须保留：${preservedFacts}`;
    }
  };
  // 恢复时也保留格式失败前的意见，不能用后续PASS覆盖已提出的风险。
  for (const previous of await (context.stageJournal?.history?.('evidence-attribution') ?? context.stageJournal?.read('evidence-attribution')) ?? []) {
    if (!previous.output || previous.status === 'PASSED') continue;
    try { context.model.assertOutput(previous.output, schema); validateOutput(previous.output as unknown as Output, input); }
    catch (error) { captureFormatFailure(previous.output as unknown as Output, error); }
  }
  // 角色决定本阶段的任务与能力范围；会话、工具执行和格式修复交给模型适配器。
  const output = await validatedStage(context, {
    role: definition.agentId,
    stage: 'evidence-attribution',
    prompt: buildPrompt(input, context) + (preservedFacts === undefined ? ''
      : `\n本次恢复仍受原格式修复约束：仅允许改变或省略replacementMarkdown，其他字段必须保留：${preservedFacts}。这些是待核实的原意见，不是新增的源码事实或发布授权。`),
    outputSchema: schema,
    tools: definition.tools,
    readablePaths: readablePaths(input),
  }, (raw) => {
    const output = raw as unknown as Output;
    if (preservedFacts !== undefined && facts(output) !== preservedFacts) {
      throw new StageValidationIssue('REVIEW_REPAIR_FACTS_CHANGED', 'correction.replacementMarkdown',
        `格式修复不能改变结论、修订位置、原因、风险或未解决问题。仅允许改变或省略replacementMarkdown；其余字段必须保持：${preservedFacts}`);
    }
    try { validateOutput(output, input); } catch (error) { captureFormatFailure(output, error); throw error; }
    return output;
  }, sourceReviewTimeoutMs(criteria));
  // 模型返回后仍需检查取消状态，迟到结果不能被当作成功输出。
  assertActive(context.signal);
  const artifacts: PendingArtifact[] = [];
  const review = output;
  const evaluationRef = input.payload.evaluationReportRef;
  const correction = review.correction;
  // 纠正意见沿用统一编号，证据引用来自受信输入，不能由模型自行指定。
  const corrections = correction ? [{
    correctionId: correctionId(correction['correctionId']),
    knowledgePath: String(correction['knowledgePath']),
    criterion: String(correction['criterion']),
    evidenceRefs: [evaluationRef, ...(input.payload.checkReportRef ? [input.payload.checkReportRef] : [])],
    risk: String(correction['risk']),
  }] : [];
  const payload = {
    resultKind: 'attribution',
    corrections,
    unresolvedRisks: review.unresolvedRisks?.length ? review.unresolvedRisks : review.blocking && corrections.length === 0
      ? ['review reported a blocking condition without a correction'] : [],
  };
  return { output, payload, artifacts };
}

function correctionId(value: unknown): string {
  const candidate = String(value ?? '');
  if (/^COR-[0-9]{4,}$/.test(candidate)) return candidate;
  return `COR-${String(parseInt(sha256(candidate).slice(0, 8), 16)).padStart(10, '0')}`;
}
