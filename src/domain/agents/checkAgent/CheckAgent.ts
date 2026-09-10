/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：实现只读检查角色的业务步骤与结构化结果转换。
 */
import type { ExecutionContext, RoleResult, PendingArtifact } from '../AgentExecution.ts';
import { assertActive } from '../AgentExecution.ts';
import { type Input, type Output, schemaFor, validateInput, validateOutput } from './CheckAgentContract.ts';
import { definition, buildPrompt, readablePaths } from './CheckAgentPrompt.ts';

/** 只读检查生成文件与确定性判据，将模型发现转换为可定位的检查报告。 */
export async function execute(input: Input, context: ExecutionContext): Promise<RoleResult<Output>> {
  assertActive(context.signal);
  // 缺失材料应在调用模型之前失败，避免模型用猜测填补业务证据。
  validateInput(input);
  const schema = schemaFor(input);
  // 角色决定本阶段的任务与能力范围；会话、工具执行和格式修复交给模型适配器。
  const raw = await context.model.execute({
    role: definition.agentId,
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
  const check = output;
  const payload = {
    resultKind: 'findings',
    findings: check.findings.map((finding, index) => ({
      findingId: `finding-${index + 1}`,
      severity: finding.severity,
      criterionId: finding.ruleId,
      evidenceLocation: finding.path,
      message: `${finding.message}\nOriginal: ${finding.original}\nGenerated: ${finding.generated}`,
    })),
  };
  return { output, payload, artifacts };
}
