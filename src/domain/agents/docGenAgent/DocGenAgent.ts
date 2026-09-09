/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：实现文档生成角色的业务步骤与结构化结果转换。
 */
import type { ExecutionContext, RoleResult, PendingArtifact } from '../AgentExecution.ts';
import { assertActive, pending } from '../AgentExecution.ts';
import { type Input, type Output, type Outline, outlineSchema, schemaFor, validateInput } from './DocGenAgentContract.ts';
import { definition, buildPrompt, readablePaths } from './DocGenAgentPrompt.ts';
import { revisionScope, validateOutline, validateOutlineBody, validateRevision } from './DocGenRevision.ts';

/** 结合源码、分块片段以及已有修订材料生成正文；正文的质量与发布资格由后续服务判断。 */
export async function execute(input: Input, context: ExecutionContext): Promise<RoleResult<Output>> {
  assertActive(context.signal);
  // 缺失材料应在调用模型之前失败，避免模型用猜测填补业务证据。
  validateInput(input);
  const schema = schemaFor(input);
  const revision = revisionScope(input);
  if (input.payload.baseKnowledgeRef && !revision) throw new Error('DOC_GEN_REVISION_CORRECTIONS_REQUIRED');
  let outline: Outline | undefined;
  if (!revision) {
    const rawOutline = await context.model.execute({
      role: definition.agentId, stage: 'outline',
      prompt: `${buildPrompt(input, context)}\n\n当前阶段：outline。只输出概要 title、description、sections[{heading,purpose}]。heading 是不含 ## 的唯一 H2 标题，规划接口、行为、边界、依据及缺证据内容。整合 workerFragmentRefs 的事实，不把片段自评当成门禁。此阶段不输出 body。`,
      outputSchema: outlineSchema, tools: definition.tools, readablePaths: readablePaths(input),
    }, context.signal);
    assertActive(context.signal);
    context.model.assertOutput(rawOutline, outlineSchema);
    outline = rawOutline as unknown as Outline;
    validateOutline(outline);
  }
  // 只有概要验证通过后才生成正文；修订直接使用冻结的原文和明确章节范围。
  assertActive(context.signal);
  const raw = await context.model.execute({
    role: definition.agentId, stage: revision ? 'revision' : 'body',
    prompt: `${buildPrompt(input, context)}\n\n${revision
      ? `当前阶段：revision。只修改这些精确 H2 内的正文：${JSON.stringify([...revision.headings])}。H2 标题本身、所有未指名区域、空白及章节顺序必须逐字保持不变。每个指名章节必须实际落实 Correction。返回完整修订正文 body、title、description。`
      : `当前阶段：body。根据已确认概要生成完整正文：${JSON.stringify(outline)}。title/description 与概要逐字相同。正文各节必须使用以下精确标题行，保持顺序，不加编号、不改写文字：\n${outline!.sections.map(({ heading }) => `## ${heading}`).join('\n')}\n每个标题下面填写完整正文。正文不使用 # 一级标题；子主题使用 ### 或更深层级，不能新增 ## 标题。代码示例须放在完整围栏内，避免示例标题成为文档标题。提交前逐行检查 H2 列表是否与上述列表完全一致。保留源码引用、明确未解决问题，不宣称已通过发布门禁。`}`,
    outputSchema: schema, tools: definition.tools, readablePaths: readablePaths(input),
  }, context.signal);
  assertActive(context.signal);
  context.model.assertOutput(raw, schema);
  const output = raw as unknown as Output;
  if (revision) validateRevision(revision.base, output.body, revision.headings);
  else if (outline) {
    validateOutlineBody(outline, output.body);
    if (output.title !== outline.title || output.description !== outline.description) throw new Error('DOC_GEN_OUTLINE_METADATA_MISMATCH');
  }
  const artifacts: PendingArtifact[] = [];
  if (outline) artifacts.push({ key: 'outline', content: JSON.stringify(outline), mediaType: 'application/json' });
  const document = output;
  // 这里只声明正文工件；实际 CAS 引用由 Application 保存后回填。
  const bodyRef = pending('body');
  artifacts.push({ key: 'body', content: document.body, mediaType: 'text/markdown' });
  const payload = {
    resultKind: 'knowledgeCandidate',
    bodyRef,
    provenance: input.payload.sourceRefs,
    changedPaths: [`knowledge/${input.moduleId}.md`],
    unresolvedRisks: input.materials.filter(({ ref }) => input.payload.workerFragmentRefs?.some((item) => item.artifactId === ref.artifactId))
      .flatMap(({ content }) => content && typeof content === 'object' && 'unresolvedRisks' in content && Array.isArray(content.unresolvedRisks)
        ? content.unresolvedRisks.filter((risk): risk is string => typeof risk === 'string') : []),
  };
  return { output, payload, artifacts };
}
