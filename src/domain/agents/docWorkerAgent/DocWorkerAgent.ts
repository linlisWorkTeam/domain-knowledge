/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：实现文档分块角色的业务步骤与结构化结果转换。
 */
import type { ExecutionContext, RoleResult, PendingArtifact } from '../AgentExecution.ts';
import { assertActive, pending } from '../AgentExecution.ts';
import { type Input, type Output, schemaFor, validateInput, validateFacts } from './DocWorkerAgentContract.ts';
import { definition, buildPrompt, readablePaths } from './DocWorkerAgentPrompt.ts';

/** 从分配给本 Worker 的源码中提取知识片段，保留证据来源供 DocGen 汇总。 */
export async function execute(input: Input, context: ExecutionContext): Promise<RoleResult<Output>> {
  assertActive(context.signal);
  // 缺失材料应在调用模型之前失败，避免模型用猜测填补业务证据。
  validateInput(input);
  const schema = schemaFor(input);
  // 角色决定本阶段的任务与能力范围；会话、工具执行和格式修复交给模型适配器。
  const raw = await context.model.execute({
    role: definition.agentId,
    stage: 'extract',
    prompt: buildPrompt(input, context),
    outputSchema: schema,
    tools: definition.tools,
    readablePaths: readablePaths(input),
  }, context.signal);
  // 模型返回后仍需检查取消状态，迟到结果不能被当作成功输出。
  assertActive(context.signal);
  context.model.assertOutput(raw, schema);
  const output = raw as unknown as Output;
  validateFacts(output, input);
  const artifacts: PendingArtifact[] = [];
  const fragment = JSON.stringify(output);
  const chunkRef = pending('chunk');
  artifacts.push({ key: 'chunk', content: fragment, mediaType: 'application/json' });
  const payload = {
    resultKind: 'knowledgeChunk',
    chunkRef,
    provenance: input.payload.sourceRefs,
    unresolvedRisks: output.unresolvedRisks,
  };
  return { output, payload, artifacts };
}
