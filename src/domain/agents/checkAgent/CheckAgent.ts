/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：生成可交接比较报告，统一处理最多两次输出修正并保留证据。
 */
import type { ExecutionContext, RoleResult, PendingArtifact } from '../AgentExecution.ts';
import { assertActive, AgentReportFailure, ModelResponseError } from '../AgentExecution.ts';
import { type Input, type Output, type Draft, type Attempt, type EvidenceSide, type FindingConclusion, schemaFor, validateInput, assembleReport, renderEvidence, retainConclusions } from './CheckAgentContract.ts';
import { definition, buildPrompt, readablePaths } from './CheckAgentPrompt.ts';

export async function execute(input: Input, context: ExecutionContext): Promise<RoleResult<Output>> {
  assertActive(context.signal);
  validateInput(input);
  const schema = schemaFor(input), basePrompt = buildPrompt(input, context);
  let priorDraft: Draft | undefined;
  const retained = new Map<number, FindingConclusion>();
  const attempts: Attempt[] = [], cache = new Map<string, EvidenceSide>();
  const artifacts = (): PendingArtifact[] => [{ key: 'check-attempts', content: JSON.stringify({
    reportVersion: 'check-report-v2', inputRefs: input.provenance, attempts,
  }), mediaType: 'application/json' }];
  try {
    for (let attempt = 1; attempt <= 3; attempt++) {
      assertActive(context.signal);
      let raw: unknown = null, output: Output | undefined, errors: string[] = [];
      try {
        raw = await context.model.execute({ role: definition.agentId, stage: 'constraint-check',
          prompt: basePrompt + (attempts.length ? `\n\n修正上次报告，保留有效证据和有依据的意见，不通过删除差异或改变严重程度掩盖错误。修正反馈：\n${JSON.stringify(attempts.at(-1))}\n已识别的差异结论（索引从0开始）：\n${JSON.stringify([...retained])}` : ''),
          outputSchema: schema, tools: definition.tools, readablePaths: readablePaths(input),
          outputAttempts: 1, reportAttempt: attempt,
        }, context.signal);
        assertActive(context.signal);
        retainConclusions(raw, input, retained);
        context.model.assertOutput(raw, schema);
        const draft = raw as Draft;
        ({ output, errors } = assembleReport(draft, input, cache));
        for (const [index, conclusion] of retained) {
          const next = draft.findings[index];
          if (!next || next.ruleId !== conclusion.ruleId || next.severity !== conclusion.severity || next.message !== conclusion.message) {
            errors.push(`CHECK_REPAIR_CONCLUSION_CHANGED: preserve findings[${index}] even when the earlier report failed schema validation`);
          }
        }
        if (priorDraft && (draft.findings.length !== priorDraft.findings.length || priorDraft.findings.some((f, i) => {
          const next = draft.findings[i];
          return !next || next.ruleId !== f.ruleId || next.severity !== f.severity || next.message !== f.message
            || next.original.status !== f.original.status || next.generated.status !== f.generated.status;
        }))) errors.push('CHECK_REPAIR_CONCLUSION_CHANGED: repair locations/scope only; preserve findings, rules, severity, analysis and side status');
        // 被拒绝的改写不能成为新基线，否则第三次恢复原意见也会被拒绝。
        if (!errors.some((error) => error.startsWith('CHECK_REPAIR_CONCLUSION_CHANGED'))) priorDraft ??= structuredClone(draft);
      } catch (error) {
        assertActive(context.signal);
        const message = error instanceof Error ? error.message : String(error);
        if (!/^(?:AGENT_OUTPUT_INVALID|DSH_AGENT_OUTPUT_NOT_JSON)(?::|$)/.test(message)) throw error;
        if (error instanceof ModelResponseError) {
          raw = error.rawOutput;
          for (const parsed of error.parsedOutputs) retainConclusions(parsed, input, retained);
        }
        errors = [message];
      }
      attempts.push({ attempt, raw, errors, validEvidence: [...cache.values()] });
      if (errors.length || !output) continue;
      assertActive(context.signal);
      return { output, artifacts: artifacts(), payload: { resultKind: 'findings',
        findings: output.findings.map((f, index) => ({ findingId: `finding-${index + 1}`,
          severity: f.severity, criterionId: f.ruleId,
          evidenceLocation: [...new Set([f.original, f.generated].flatMap((side) => side.status === 'present'
            ? side.excerpts.map((e) => `${e.path}:${e.startLine}-${e.endLine}`) : side.checkedPaths))].join(' -> '),
          message: `${f.message}\nOriginal:\n${renderEvidence(f.original)}\nGenerated:\n${renderEvidence(f.generated)}`,
        })),
      } };
    }
    throw new Error('CHECK_REPORT_REPAIR_EXHAUSTED: three report attempts failed');
  } catch (error) {
    if (!attempts.length) throw error;
    throw new AgentReportFailure(error instanceof Error ? error.message : String(error), artifacts());
  }
}
