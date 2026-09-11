/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义测试源码和用例清单契约及授权边界。
 */
import type { ArtifactRef } from '../../Domain.ts';
import type { RoleInput, ExecutionContext } from '../AgentExecution.ts';
import { requireMaterials } from '../AgentExecution.ts';

/** 测试只基于源码；失败候选仅在参考校验失败时显式传回。 */
export interface Payload {
  moduleId: string; sourceSnapshotRef: ArtifactRef; publicInterfaceRefs: ArtifactRef[];
  languageId: string; testPolicyRef: ArtifactRef; allowedTestPaths: string[];
  previousCandidateRef?: ArtifactRef; validationFailureRef?: ArtifactRef;
}
export const TEST_CASE_PROTOCOL = 'native-cases-v1';
export type Input = RoleInput<Payload>;
/** 用例与生成文件、源码依据一一建立可审计关系。 */
export interface Output {
  files: { path: string; content: string }[];
  cases: { caseId: string; entryPoint: string; testPath: string; target: string; input: string; expected: string; sourceEvidence: string[] }[];
}
export interface TestGenContext extends ExecutionContext { validatedOutput?: Output }
const text = { type: 'string', pattern: '\\S' };
export const outputSchema: Record<string, unknown> = {
  type: 'object', required: ['files', 'cases'], additionalProperties: false,
  properties: {
    files: { type: 'array', minItems: 1, items: { type: 'object', required: ['path', 'content'], additionalProperties: false,
      properties: { path: text, content: text } } },
    cases: { type: 'array', minItems: 1, items: { type: 'object',
      required: ['caseId', 'entryPoint', 'testPath', 'target', 'input', 'expected', 'sourceEvidence'], additionalProperties: false,
      properties: { caseId: {type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$'}, entryPoint: {type:'string',pattern:'^[A-Za-z][A-Za-z0-9_]*$'}, testPath: text, target: text, input: { type: 'string' }, expected: text,
        sourceEvidence: { type: 'array', minItems: 1, uniqueItems: true, items: text } } } },
  },
};
export function schemaFor(_input: Input): Record<string, unknown> { return outputSchema; }
/** 生成路径不能覆盖原始源码、接口或其他文件。 */
export function validateInput(input: Input): void {
  requireMaterials(input.payload, input.materials, ['moduleId', 'sourceSnapshotRef', 'publicInterfaceRefs', 'languageId', 'testPolicyRef', 'allowedTestPaths']);
  if (!['c', 'cpp'].includes(input.payload.languageId)) throw new Error('TESTGEN_LANGUAGE_INVALID');
  for (const path of input.payload.allowedTestPaths) {
    if (!/^[a-zA-Z0-9_][a-zA-Z0-9_./-]*\.(c|cc|cpp|cxx|h|hpp)$/.test(path)
      || path.split('/').some((part) => !part || part === '.' || part === '..')
      || [...input.sourcePaths, ...input.publicInterfacePaths].includes(path)) throw new Error('TESTGEN_PATH_INVALID');
  }
  if (Boolean(input.payload.previousCandidateRef) !== Boolean(input.payload.validationFailureRef)) throw new Error('TESTGEN_REPAIR_INPUT_INCOMPLETE');
}
/** 校验用例清单不能虚报不存在的文件或越界依据。 */
export function validateOutput(output: Output, input: Input): void {
  const paths = output.files.map((file) => file.path);
  if (new Set(paths).size !== paths.length || paths.some((path) => !input.payload.allowedTestPaths.includes(path))) throw new Error('TESTGEN_OUTPUT_PATH_INVALID');
  if (!hasExecutableCases(output)) throw new Error('TESTGEN_CASE_ENTRY_INVALID');
  const ids = output.cases.map((item) => item.caseId);
  if (new Set(ids).size !== ids.length || output.cases.some((item) => !/\.(c|cc|cpp|cxx)$/.test(item.testPath) || !paths.includes(item.testPath)
    || item.sourceEvidence.some((path) => ![...input.sourcePaths, ...input.publicInterfacePaths].includes(path)))
    || paths.some((path) => /\.(c|cc|cpp|cxx)$/.test(path) && !output.cases.some((item) => item.testPath === path))) throw new Error('TESTGEN_CASE_MANIFEST_INVALID');
}

/** 旧清单不能继承新协议的成功状态，也不能默默重新生成同源测试。 */
export function hasExecutableCases(output: Output): boolean {
  return Array.isArray(output.cases) && output.cases.length > 0
    && output.cases.every(c => /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(c.caseId)
      && typeof c.entryPoint === 'string' && /^[A-Za-z][A-Za-z0-9_]*$/.test(c.entryPoint) && c.entryPoint !== 'main')
    && new Set(output.cases.map(c => c.entryPoint)).size === output.cases.length
    && new Set(output.cases.map(c => c.caseId)).size === output.cases.length;
}
