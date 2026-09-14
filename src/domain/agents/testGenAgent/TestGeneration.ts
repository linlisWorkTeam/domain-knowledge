/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：按固定用例计划分批生成，保存进度后组装完整测试候选。
 */
import { assertActive, AgentReportFailure, ModelResponseError } from '../AgentExecution.ts';
import { type Input, type Output, type TestGenContext, schemaFor, validateOutput } from './TestGenAgentContract.ts';
import { definition, buildPrompt, readablePaths } from './TestGenAgentPrompt.ts';

export interface Plan { sharedFiles: Output['files']; cases: Output['cases'] }
export const TEST_GENERATION_BATCH_SIZE = 4;

export function planSchema(input: Input): Record<string, unknown> {
  const output = schemaFor(input) as typeof import('./TestGenAgentContract.ts').outputSchema;
  return { type: 'object', additionalProperties: false, required: ['sharedFiles', 'cases'], properties: {
    sharedFiles: { ...output.properties.files, minItems: 0, maxItems: input.payload.allowedTestPaths.length,
      items: { ...output.properties.files.items, properties: { ...output.properties.files.items.properties,
        content: { type: 'string', minLength: 1, maxLength: 4096 },
      } } },
    cases: { ...output.properties.cases, maxItems: 128, items: { ...output.properties.cases.items,
      properties: Object.fromEntries(Object.entries(output.properties.cases.items.properties).map(([key, value]) => [key,
        key === 'sourceEvidence' ? value : { ...value, maxLength: ['caseId', 'entryPoint'].includes(key) ? 128 : 1000 }])) } },
  } };
}

function validatePlan(plan: Plan, input: Input): void {
  const paths = plan.sharedFiles.map(f => f.path);
  if (new Set(paths).size !== paths.length) throw new Error('TESTGEN_PLAN_DUPLICATE_FILE');
  // 空壳只用于校验计划关联；不会送往编译、评测或作为成功测试保存。
  validateOutput({ files: [...new Set([...paths, ...plan.cases.map(c => c.testPath)])].map(path => ({ path, content: 'planned' })), cases: plan.cases }, input);
  if (input.payload.previousCandidateRef) {
    const priorMaterial = input.materials.find(m => m.ref.artifactId === input.payload.previousCandidateRef!.artifactId);
    const prior = typeof priorMaterial?.content === 'string' ? JSON.parse(priorMaterial.content) : priorMaterial?.content;
    const previous = prior as Output;
    if (!Array.isArray(previous?.cases)) throw new Error('TESTGEN_REPAIR_CANDIDATE_INVALID');
    const identity = (cases: Output['cases']) => cases.map(c => [c.caseId, c.entryPoint, c.testPath].join('\0')).sort();
    if (JSON.stringify(identity(previous.cases)) !== JSON.stringify(identity(plan.cases))) throw new Error('TESTGEN_REPAIR_CASE_SET_CHANGED');
  }
}

export async function generateTests(input: Input, context: TestGenContext): Promise<Output> {
  const progress = context.testGenerationProgress;
  if (!progress) throw new Error('TESTGEN_PROGRESS_REQUIRED');
  const base = buildPrompt(input, context);
  const ask = async (step: string, schema: Record<string, unknown>, instruction: string, validate: (value: Record<string, unknown>) => void) => {
    assertActive(context.signal);
    const request = { role: definition.agentId, prompt: `${base}\n\n${instruction}`, outputSchema: schema,
      tools: definition.tools, readablePaths: readablePaths(input), generationStep: step };
    const value = await progress.run(step, request, async () => {
      let raw: unknown = null;
      try {
        raw = await context.model.execute(request, context.signal);
        assertActive(context.signal);
        context.model.assertOutput(raw, schema); validate(raw as Record<string, unknown>);
        return raw as Record<string, unknown>;
      } catch (error) {
        if (error instanceof ModelResponseError) raw = error.rawOutput;
        const message = error instanceof Error ? error.message : String(error);
        throw new AgentReportFailure(message, [{ key: `testgen-${step}-failure`, mediaType: 'application/json',
          content: JSON.stringify({ protocol: 'testgen-batches-v1', step, raw, error: message, inputRefs: input.provenance }) }]);
      }
    });
    assertActive(context.signal);
    context.model.assertOutput(value, schema); validate(value);
    return value;
  };
  const plan = await ask('plan', planSchema(input),
    '当前阶段 TESTGEN_PLAN：只输出完整用例计划 cases 和可选公共前置代码 sharedFiles（头文件include、共用类型/常量/辅助定义），不要实现任何测试入口，不要输出 files。计划覆盖本次全部要求，最多128项；框架随后按每批最多4项生成实现。修复时保持原候选的caseId/entryPoint/testPath集合，不能删除失败用例。',
    raw => validatePlan(raw as unknown as Plan, input)) as unknown as Plan;
  const files = new Map(plan.sharedFiles.map(f => [f.path, f.content]));
  for (let offset = 0; offset < plan.cases.length; offset += TEST_GENERATION_BATCH_SIZE) {
    const cases = plan.cases.slice(offset, offset + TEST_GENERATION_BATCH_SIZE);
    const index = offset / TEST_GENERATION_BATCH_SIZE + 1;
    const paths = [...new Set(cases.map(c => c.testPath))];
    const schema = { type: 'object', additionalProperties: false, required: ['files'], properties: {
      files: { type: 'array', minItems: paths.length, maxItems: paths.length, items: {
        type: 'object', additionalProperties: false, required: ['path', 'content'], properties: {
          path: { type: 'string', enum: paths }, content: { type: 'string', pattern: '\\S', maxLength: 16000 },
        },
      } },
    } };
    const batch = await ask(`batch-${index}`, schema,
      `当前阶段 TESTGEN_BATCH ${index}：只输出本批 files 源码片段，不再输出 cases，也不重复公共前置代码。实现下面列出的全部入口；不得实现其他批次入口。辅助符号使用 tg_batch_${index}_ 前缀避免重名。框架按批次顺序追加到同一文件，最后统一编译验收。\n公共前置代码：${JSON.stringify(plan.sharedFiles)}\n本批固定用例：${JSON.stringify(cases)}\n计划标识：${JSON.stringify(plan.cases.map(c => ({caseId:c.caseId,entryPoint:c.entryPoint,testPath:c.testPath})))}`,
      raw => {
        const output = { files: (raw as unknown as Pick<Output, 'files'>).files, cases };
        validateOutput(output, input);
        if (new Set(output.files.map(f => f.path)).size !== paths.length) throw new Error('TESTGEN_BATCH_FILES_MISSING');
      }) as unknown as Pick<Output, 'files'>;
    for (const file of batch.files) files.set(file.path, files.has(file.path) ? `${files.get(file.path)}\n${file.content}` : file.content);
  }
  const output = { files: [...files].map(([path, content]) => ({path, content})), cases: plan.cases };
  validateOutput(output, input);
  return output;
}
