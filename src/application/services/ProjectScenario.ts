/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：协调项目Scenario用例及其依赖的领域规则与端口。
 */
import { validateProjectAgentConfiguration } from '../../domain/agents/ProjectAgentConfiguration.ts';
import type { RealSourceScenario } from './ProjectFlow.ts';

/** Validate task data before creating a Run. Tool execution stays in the trusted evaluator. */
/** 解析项目Scenario。 */
export function parseProjectScenario(value: unknown, repositoryRoot?: string): RealSourceScenario {
  const fail = (): never => { throw new Error('WORKFLOW_SCENARIO_INVALID'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const item = value as Record<string, unknown>;
  const path = (value: unknown): value is string => typeof value === 'string' && value.length > 0
    && !value.startsWith('/') && !value.includes('\\') && !value.includes('\0')
    && !value.split('/').some((part) => part === '..' || part === '.' || part === '');
  const result: Record<string, unknown> = {};
  if (item.schemaVersion !== '1.0') return fail();
  result.schemaVersion = '1.0';
  for (const key of ['name', 'moduleId']) {
    if (typeof item[key] !== 'string' || !(item[key] as string).trim()) return fail();
    result[key] = item[key];
  }
  result.repositoryRoot = repositoryRoot ?? item.repositoryRoot;
  if (typeof result.repositoryRoot !== 'string' || !result.repositoryRoot.startsWith('/')) return fail();
  if (item.expectedCommit !== undefined) {
    if (typeof item.expectedCommit !== 'string' || !/^[a-f0-9]{40}$/i.test(item.expectedCommit)) return fail();
    result.expectedCommit = item.expectedCommit;
  }
  for (const key of ['sourcePaths', 'publicInterfacePaths', 'allowedGeneratedPaths']) {
    const paths = item[key];
    if (!Array.isArray(paths) || !paths.every(path) || (key !== 'publicInterfacePaths' && !paths.length)) return fail();
    result[key] = [...paths];
  }
  for (const key of ['prepareCommands', 'referenceCommands', 'firstIterationCommands', 'finalCommands']) {
    const commands = item[key];
    if (!Array.isArray(commands) || (key !== 'prepareCommands' && !commands.length)) return fail();
    result[key] = commands.map((command: unknown) => {
      if (!command || typeof command !== 'object' || Array.isArray(command)) return fail();
      const c = command as Record<string, unknown>;
      if (!['node', 'pnpm', 'cargo', 'gcc', 'g++', 'binary'].includes(String(c.tool)) || !['setup', 'test', 'check'].includes(String(c.purpose))
        || !Array.isArray(c.args) || !c.args.every((arg) => typeof arg === 'string' && !arg.includes('\0'))
        || (c.cwd !== undefined && !path(c.cwd))) return fail();
      const allowed = ['tool', 'purpose', 'args', 'cwd', 'repetitions', 'timeoutMs', 'maxOutputBytes'];
      if (Object.keys(c).some((key) => !allowed.includes(key))) return fail();
      for (const field of ['repetitions', 'timeoutMs', 'maxOutputBytes']) {
        if (c[field] !== undefined && (!Number.isSafeInteger(c[field]) || Number(c[field]) < 1)) return fail();
      }
      return structuredClone(c);
    });
  }
  if (item.agentConfiguration !== undefined) {
    validateProjectAgentConfiguration(item.agentConfiguration);
    result.agentConfiguration = structuredClone(item.agentConfiguration);
  }
  if (item.comparisonRules !== undefined) {
    if (!Array.isArray(item.comparisonRules) || !item.comparisonRules.length
      || item.comparisonRules.some((rule) => !rule || typeof rule.id !== 'string' || !rule.id.trim() || typeof rule.description !== 'string' || !rule.description.trim())) return fail();
    result.comparisonRules = structuredClone(item.comparisonRules);
  }
  if (item.businessGoal !== undefined) {
    if (typeof item.businessGoal !== 'string' || !item.businessGoal.trim()) return fail();
    result.businessGoal = item.businessGoal;
  }
  if (item.modules !== undefined) {
    if (!Array.isArray(item.modules) || !item.modules.length || item.modules.length > 32) return fail();
    const modules = item.modules.map((module) => parseProjectScenario(module, result.repositoryRoot as string));
    if (modules.some((module) => module.modules || module.expectedCommit !== result.expectedCommit)
      || new Set(modules.map((module) => module.moduleId)).size !== modules.length) return fail();
    result.modules = modules;
  }
  // Fixture assets and unknown fields cannot enter the public role contract.
  if (Object.keys(item).some((key) => !(key in result))) return fail();
  return result as unknown as RealSourceScenario;
}
