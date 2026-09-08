/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：实现业务计划角色的业务步骤与结构化结果转换。
 */
import type { AgentId } from '../AgentContracts.ts';
import type { ExecutionContext, RoleResult, PendingArtifact } from '../AgentExecution.ts';
import { assertActive } from '../AgentExecution.ts';
import { type Input, type Output, schemaFor, validateInput } from './OrchestratorAgentContract.ts';
import { definition, buildPrompt, readablePaths } from './OrchestratorAgentPrompt.ts';

/** 根据策略形成当前轮业务计划；计划仅作为结果交接，不能改变工作流连接。 */
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
  const artifacts: PendingArtifact[] = [];
  // 保持迁移前的固定业务计划；符号化节点由接线层绑定，不在领域层写死图节点名称。
  const nodes: Array<[AgentId, AgentId[], string[], string[]]> = [
    ['doc-worker', [], ['source:read'], ['knowledge-chunk']],
    ['doc-gen', ['doc-worker'], ['source:read', 'cas:write'], ['knowledge-candidate']],
    ['test-gen', [], ['source:read', 'cas:write'], ['test-candidates']],
    ['code', ['doc-gen'], ['workspace:write', 'cas:write'], ['code-artifact']],
    ['check', ['code'], ['workspace:read'], ['findings']],
    ['review', ['check'], ['cas:read'], ['attribution']],
  ];
  const payload = {
    resultKind: 'plan',
    nodes: nodes.map(([agentType, dependsOn, resourceClaims, artifactExpectations]) => ({
      nodeId: { agentNode: agentType },
      agentType,
      dependsOn: dependsOn.map((role) => ({ agentNode: role })),
      generationKey: { agentGeneration: agentType },
      inputSchema: 'https://wpknowledge.local/schemas/agent-command/v1',
      outputSchema: 'https://wpknowledge.local/schemas/agent-result/v1',
      resourceClaims,
      artifactExpectations,
    })),
  };
  return { output, payload, artifacts };
}
