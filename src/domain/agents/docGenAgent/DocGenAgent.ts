/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：实现文档生成角色的业务步骤与结构化结果转换。
 */
import type { RoleResult, PendingArtifact } from '../AgentExecution.ts';
import { assertActive, pending } from '../AgentExecution.ts';
import { type Input, type Output, type DocGenContext, type DocWorkerTask, schemaFor, validateInput } from './DocGenAgentContract.ts';
import { definition, buildPrompt, readablePaths } from './DocGenAgentPrompt.ts';

/** 结合源码、分块片段以及已有修订材料生成正文；正文的质量与发布资格由后续服务判断。 */
export async function execute(input: Input, context: DocGenContext): Promise<RoleResult<Output>> {
  assertActive(context.signal);
  // 缺失材料应在调用模型之前失败，避免模型用猜测填补业务证据。
  validateInput(input);
  const tasks = planWorkers(input);
  if (tasks.length && !context.docWorkers) throw new Error('DOCGEN_WORKER_EXECUTOR_MISSING');
  const fragments = tasks.length ? await context.docWorkers!.run(tasks, context.signal) : [];
  assertActive(context.signal);
  // 必须收到所有任务的非空片段；不以部分知识继续生成候选正文。
  if (fragments.length !== tasks.length || new Set(fragments.map((item) => item.workerId)).size !== tasks.length
    || tasks.some((task) => !fragments.some((item) => item.workerId === task.workerId))
    || fragments.some((item) => typeof item.material.content !== 'string' || !item.material.content.trim())) {
    throw new Error('DOCGEN_WORKER_RESULTS_INCOMPLETE');
  }
  const ordered = tasks.map((task) => fragments.find((item) => item.workerId === task.workerId)!);
  const fragmentRefs = [...(input.payload.workerFragmentRefs ?? []), ...ordered.map(({ material }) => material.ref)];
  const synthesisInput: Input = { ...input,
    payload: { ...input.payload, ...(fragmentRefs.length ? { workerFragmentRefs: fragmentRefs } : {}) },
    materials: [...input.materials, ...ordered.map(({ material }) => material)],
  };
  const schema = schemaFor(synthesisInput);
  // 角色决定本阶段的任务与能力范围；会话、工具执行和格式修复交给模型适配器。
  const raw = await context.model.execute({
    role: definition.agentId,
    prompt: buildPrompt(synthesisInput, context),
    outputSchema: schema,
    tools: definition.tools,
    readablePaths: readablePaths(input),
  }, context.signal);
  // 模型返回后仍需检查取消状态，迟到结果不能被当作成功输出。
  assertActive(context.signal);
  context.model.assertOutput(raw, schema);
  const output = raw as unknown as Output;
  const artifacts: PendingArtifact[] = [];
  const document = output;
  // 这里只声明正文工件；实际 CAS 引用由 Application 保存后回填。
  const bodyRef = pending('body');
  artifacts.push({ key: 'body', content: document.body, mediaType: 'text/markdown' });
  const payload = {
    resultKind: 'knowledgeCandidate',
    bodyRef,
    ...(ordered.length ? { workerResultRefs: ordered.map(({ resultRef }) => resultRef) } : {}),
    provenance: input.provenance,
    changedPaths: [`knowledge/${input.moduleId}.md`],
    unresolvedRisks: [],
  };
  return { output, payload, artifacts };
}

/** 按显式源码列表均匀分组，去重并跳过空任务，拆分规则属于 DocGen。 */
export function planWorkers(input: Input): DocWorkerTask[] {
  const paths = [...new Set(input.sourcePaths)];
  const count = Math.min(input.payload.workerCount ?? 1, paths.length);
  return Array.from({ length: count }, (_, index) => ({
    workerId: `worker-${index + 1}`,
    sourcePaths: paths.filter((_, pathIndex) => pathIndex % count === index),
  }));
}
