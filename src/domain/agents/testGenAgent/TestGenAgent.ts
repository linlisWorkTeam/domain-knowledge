/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：实现测试生成角色的业务步骤与结构化结果转换。
 */
import type { ExecutionContext, RoleResult, PendingArtifact } from '../AgentExecution.ts';
import { assertActive, pending } from '../AgentExecution.ts';
import { type Input, type Output, schemaFor, validateInput, validateOutput } from './TestGenAgentContract.ts';
import { definition, buildPrompt, readablePaths } from './TestGenAgentPrompt.ts';

/** 仅根据源码、公开接口和测试策略提出候选测试，不接收候选知识作为依据。 */
export async function execute(input: Input, context: ExecutionContext): Promise<RoleResult<Output>> {
  assertActive(context.signal);
  // 缺失材料应在调用模型之前失败，避免模型用猜测填补业务证据。
  validateInput(input);
  const schema = schemaFor(input);
  // 角色决定本阶段的任务与能力范围；会话、工具执行和格式修复交给模型适配器。
  const raw = await context.model.execute({
    role: definition.agentId,
    stage: 'behavior-cases',
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
  const artifacts: PendingArtifact[] = output.suite ? [{
    key: 'case-manifest', mediaType: 'application/json',
    content: JSON.stringify({ suite: output.suite, status: 'PENDING_ORACLE', sourceSnapshotRef: input.payload.sourceSnapshotRef }, null, 2),
  }, {
    key: 'candidate-tests', mediaType: 'text/javascript',
    // 此脚本供人阅读及独立复现；可信门禁始终由宿主比较 suite，不解析脚本的自报计数。
    content: `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport * as target from ${JSON.stringify(`./${output.suite.modulePath}`)};\nconst cases = ${JSON.stringify(output.suite.cases, null, 2)};\nfor (const item of cases) test(item.caseId + ': ' + item.description, async () => {\n  assert.deepEqual(await target[${JSON.stringify(output.suite.exportName)}](...item.args), item.expected);\n});\n`,
  }] : [];
  const payload = {
    resultKind: 'testCandidates',
    candidateSetRef: pending(output.suite ? 'candidate-tests' : 'raw'),
    caseManifestRef: pending(output.suite ? 'case-manifest' : 'raw'),
    oracleClaims: [output.oracleRequired === true
      ? 'reference oracle must pass before generated tests are trusted'
      : 'candidate commands require deterministic evaluation'],
  };
  return { output, payload, artifacts };
}
