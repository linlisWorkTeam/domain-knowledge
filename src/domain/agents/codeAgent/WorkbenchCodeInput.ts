/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：校验工作台代码重建的声明式输入，隔离参考实现与测试材料。
 */
import { requireMaterials } from '../AgentExecution.ts';
import { buildConstraints } from '../../workbench/WorkbenchProject.ts';
import type { Input } from './CodeAgentContract.ts';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('CODE_CONFIGURATION_INVALID');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error('CODE_CONFIGURATION_INVALID');
}
export function validateWorkbenchCodeInput(input: Input): void {
  const p = input.payload;
  if (p.projectConfigurationRef !== undefined) throw new Error('CODE_CONFIGURATION_INVALID');
  requireMaterials(p, input.materials, ['knowledgeRef', 'publicInterfaceRefs', 'languageId', 'buildContractRef', 'allowedGeneratedPaths']);
  if (!['c', 'cpp', 'typescript'].includes(p.languageId)) throw new Error('CODE_LANGUAGE_INVALID');
  const extension = p.languageId === 'typescript' ? /\.(ts|mts|cts)$/ : /\.(c|cc|cpp|cxx|h|hpp)$/;
  if (!p.allowedGeneratedPaths.length || new Set(p.allowedGeneratedPaths).size !== p.allowedGeneratedPaths.length
    || p.allowedGeneratedPaths.some((path) => !/^[a-zA-Z0-9_][a-zA-Z0-9_./-]*$/.test(path) || !extension.test(path)
      || path.split('/').some((part) => !part || part === '.' || part === '..'))) throw new Error('PROJECT_PATH_DENIED');
  if (p.requiredGeneratedPaths?.some((path) => !p.allowedGeneratedPaths.includes(path))) throw new Error('CODE_RECONSTRUCTION_SCOPE_INVALID');
  const config = record(input.materials.find(({ ref }) => ref.artifactId === p.buildContractRef!.artifactId)?.content);
  if (JSON.stringify(config.allowedGeneratedPaths) !== JSON.stringify(p.allowedGeneratedPaths)) throw new Error('CODE_CONFIGURATION_INVALID');
  if (p.languageId === 'typescript') {
    keys(config, ['schemaVersion', 'language', 'target', 'module', 'allowedGeneratedPaths']);
    if (config.schemaVersion !== 'typescript-build-v1' || config.language !== 'typescript'
      || config.target !== 'ES2022' || config.module !== 'ESNext') throw new Error('CODE_CONFIGURATION_INVALID');
    return;
  }
  keys(config, ['schemaVersion', 'language', 'build', 'includePath', 'allowedGeneratedPaths', 'scope', 'behaviorVerified', 'previousGeneratedAttempt']);
  if (config.schemaVersion !== 'native-build-v1' || config.language !== p.languageId || config.behaviorVerified !== false
    || typeof config.includePath !== 'string' || !p.allowedGeneratedPaths.includes(config.includePath)
    || !(config.scope === null || typeof config.scope === 'string')) throw new Error('CODE_CONFIGURATION_INVALID');
  buildConstraints(config.build);
  if (config.previousGeneratedAttempt !== null) {
    const previous = record(config.previousGeneratedAttempt);
    keys(previous, ['files', 'diagnostic', 'knowledgeErrorProven']);
    if (previous.knowledgeErrorProven !== false || !Array.isArray(previous.files) || !previous.files.length) throw new Error('CODE_CONFIGURATION_INVALID');
    for (const value of previous.files) {
      const file = record(value); keys(file, ['path', 'content']);
      if (typeof file.path !== 'string' || !p.allowedGeneratedPaths.includes(file.path) || typeof file.content !== 'string') throw new Error('CODE_CONFIGURATION_INVALID');
    }
    const diagnostic = record(previous.diagnostic);
    keys(diagnostic, ['exitCode', 'timedOut', 'outputLimitExceeded', 'durationMs', 'stdout', 'stderr']);
    if (!(diagnostic.exitCode === null || Number.isInteger(diagnostic.exitCode)) || typeof diagnostic.timedOut !== 'boolean'
      || typeof diagnostic.outputLimitExceeded !== 'boolean' || typeof diagnostic.durationMs !== 'number'
      || typeof diagnostic.stdout !== 'string' || typeof diagnostic.stderr !== 'string') throw new Error('CODE_CONFIGURATION_INVALID');
  }
}
