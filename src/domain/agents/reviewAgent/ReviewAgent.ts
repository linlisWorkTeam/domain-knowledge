/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：实现证据复核角色的业务步骤与结构化结果转换。
 */
import { sha256 } from '../../Domain.ts';
import type { ExecutionContext, RoleResult, PendingArtifact } from '../AgentExecution.ts';
import { assertActive } from '../AgentExecution.ts';
import { type Input, type Output, schemaFor, validateInput, validateOutput } from './ReviewAgentContract.ts';
import { definition, buildPrompt, readablePaths } from './ReviewAgentPrompt.ts';

/** 依据知识与评测证据给出纠正意见，并将意见绑定到本轮评测工件。 */
export async function execute(input: Input, context: ExecutionContext): Promise<RoleResult<Output>> {
  assertActive(context.signal);
  // 缺失材料应在调用模型之前失败，避免模型用猜测填补业务证据。
  validateInput(input);
  const schema = schemaFor(input);
  // 角色决定本阶段的任务与能力范围；会话、工具执行和格式修复交给模型适配器。
  const raw = await context.model.execute({
    role: definition.agentId,
    stage: 'evidence-attribution',
    prompt: buildPrompt(input, context),
    outputSchema: schema,
    tools: definition.tools,
    readablePaths: readablePaths(input),
  }, context.signal);
  // 模型返回后仍需检查取消状态，迟到结果不能被当作成功输出。
  assertActive(context.signal);
  context.model.assertOutput(raw, schema);
  const output = raw as unknown as Output;
  validateOutput(output, input);
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
