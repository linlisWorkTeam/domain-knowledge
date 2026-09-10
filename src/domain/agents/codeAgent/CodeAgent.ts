/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：实现代码生成角色的业务步骤与结构化结果转换。
 */
import type { ExecutionContext, RoleResult, PendingArtifact } from '../AgentExecution.ts';
import { assertActive, pending } from '../AgentExecution.ts';
import { type Input, type Output, schemaFor, validateInput, validateOutput } from './CodeAgentContract.ts';
import { definition, buildPrompt, readablePaths } from './CodeAgentPrompt.ts';

/** 只依据候选知识和项目编写配置生成实现，输出文件必须满足完整路径白名单。 */
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
  const payload = { resultKind: 'codeArtifact', codeRef: pending('raw'), buildManifestRef: pending('raw') };
  return { output, payload, artifacts };
}
