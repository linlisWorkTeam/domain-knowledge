/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：实现文档生成角色的业务步骤与结构化结果转换。
 */
import { collectRisks } from '../../services/knowledge/KnowledgeRisks.ts';
import type { ExecutionContext, RoleResult, PendingArtifact } from '../AgentExecution.ts';
import { assertActive, pending } from '../AgentExecution.ts';
import { type Input, type Output, type Outline, outlineSchema, validateInput } from './DocGenAgentContract.ts';
import { definition, buildPrompt, readablePaths } from './DocGenAgentPrompt.ts';
import { validatedStage } from '../StageValidation.ts';
import { sectionTargets, sectionSchema, assembleSections, type SectionOutput } from './DocGenSections.ts';
import { revisionScope, validateOutline } from './DocGenRevision.ts';

/** 结合源码、分块片段以及已有修订材料生成正文；正文的质量与发布资格由后续服务判断。 */
export async function execute(input: Input, context: ExecutionContext): Promise<RoleResult<Output>> {
  assertActive(context.signal);
  // 缺失材料应在调用模型之前失败，避免模型用猜测填补业务证据。
  validateInput(input);
  const revision = revisionScope(input);
  if (input.payload.baseKnowledgeRef && !revision) throw new Error('DOC_GEN_REVISION_CORRECTIONS_REQUIRED');
  let outline: Outline | undefined;
  if (!revision) {
    outline = await validatedStage(context, {
      role: definition.agentId, stage: 'outline', maxTokens: 2048,
      prompt: `${buildPrompt(input, context)}\n\n当前阶段：outline。只输出概要 title、description、sections[{heading,purpose}]。heading 是不含 ## 的唯一 H2 标题，规划接口、行为、边界、依据及缺证据内容。整合 workerFragmentRefs 的事实，不把片段自评当成门禁。此阶段不输出 body。`,
      outputSchema: outlineSchema, tools: definition.tools, readablePaths: readablePaths(input),
    }, (raw) => { const value = raw as unknown as Outline; validateOutline(value); return value; }, 90_000);
  }
  const targets = sectionTargets(outline, revision);
  const output = await validatedStage(context, {
    role: definition.agentId, stage: revision ? 'revision' : 'body', maxTokens: 12288,
    prompt: `${buildPrompt(input, context)}\n\n当前阶段：${revision ? 'revision' : 'body'}。${revision
      ? '只返回授权章节的修订内容；系统保留旧文档的标题、前言和所有未授权区域。每节必须落实对应 Correction。'
      : `根据已确认概要填写章节：${JSON.stringify(outline)}。title/description 与概要逐字相同。`}\n章节目录：${JSON.stringify(targets)}\n返回 title、description、sections[{sectionId,body}]，每个指定编号恰好一次。body 是章节内容，不包含 # 或 ## 标题，子主题使用 ###，示例中的标题须放在闭合代码围栏内。保留源码依据与未解决风险，不能宣称已通过发布门禁。verificationNeeds 表示固定验收待办或范围限制，应描述行为要求与验证范围，不要写成当前实现已失败；不得扩大为所有可能输入均已验证。`,
    outputSchema: sectionSchema(), tools: definition.tools, readablePaths: readablePaths(input),
  }, (raw) => assembleSections(raw as unknown as SectionOutput, targets, outline, revision), 240_000);
  assertActive(context.signal);
  const artifacts: PendingArtifact[] = [];
  if (outline) artifacts.push({ key: 'outline', content: JSON.stringify(outline), mediaType: 'application/json' });
  const document = output;
  // 这里只声明正文工件；实际 CAS 引用由 Application 保存后回填。
  const bodyRef = pending('body');
  artifacts.push({ key: 'body', content: document.body, mediaType: 'text/markdown' });
  const payload = {
    resultKind: 'knowledgeCandidate',
    knowledgeRisks: collectRisks(input.materials.filter(({ ref }) => input.payload.workerFragmentRefs?.some(item => item.artifactId === ref.artifactId))),
    bodyRef,
    provenance: input.payload.sourceRefs,
    changedPaths: [`knowledge/${input.moduleId}.md`],
    unresolvedRisks: input.materials.filter(({ ref }) => input.payload.workerFragmentRefs?.some((item) => item.artifactId === ref.artifactId))
      .flatMap(({ content }) => content && typeof content === 'object' && 'unresolvedRisks' in content && Array.isArray(content.unresolvedRisks)
        ? content.unresolvedRisks.filter((risk): risk is string => typeof risk === 'string') : []),
  };
  return { output, payload, artifacts };
}
