/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：提供实际编译运行的 C/C++ 角色交接验证材料。
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { AutomatedProjectScenario } from '../../src/application/services/AutomatedProjectWorkflow.ts';

export function cppTestOutput(expected = 4) {
  return { files: [{ path: 'tests/generated.cpp', content: `int calculate();\nint test_public_result(void) { return calculate() == ${expected} ? 0 : 1; }\n` }],
    cases: [{ caseId: 'case-1', entryPoint: 'test_public_result', testPath: 'tests/generated.cpp', target: 'Return the public result', input: 'calculate()', expected: String(expected), sourceEvidence: ['src/module.cpp'] }] };
}
export function cppScenario() {
  const root = mkdtempSync(join(tmpdir(), 'cpp-agents-'));
  mkdirSync(join(root, 'src')); mkdirSync(join(root, 'tests'));
  writeFileSync(join(root, 'src/module.cpp'), 'int calculate() { return 4; }\n');
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'source'], { cwd: root });
  const commands = [{ tool: 'g++' as const, purpose: 'check' as const, args: ['-std=c++17', 'src/module.cpp', 'tests/generated.cpp', '-o', 'test-bin'] },
    { tool: 'binary' as const, purpose: 'test' as const, args: ['test-bin'] }];
  const scenario: AutomatedProjectScenario = { schemaVersion: '1.0', name: 'cpp-agent-flow', moduleId: 'cpp-module', repositoryRoot: root,
    sourcePaths: ['src/module.cpp'], publicInterfacePaths: [], allowedGeneratedPaths: ['src/module.cpp'],
    prepareCommands: [], referenceCommands: commands, firstIterationCommands: commands, finalCommands: commands,
    agentConfiguration: { languageId: 'cpp', standard: 'c++17', dependencies: [], constraints: [], testPaths: ['tests/generated.cpp'], maxTestRepairs: 1 },
    comparisonRules: [{ id: 'public-behavior', description: 'Compare public function behavior and return values' }] };
  return { scenario, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

export function orchestratorOutput(moduleId: string, iteration = 0) {
  return { strategy: 'Generate and verify module knowledge', iteration, tasks: [
    { agentType: 'doc-gen', moduleId, materials: ['source', 'interfaces'] },
    { agentType: 'test-gen', moduleId, materials: ['source', 'interfaces', 'testPolicy'] },
    { agentType: 'code', moduleId, materials: ['knowledge', 'projectConfiguration'] },
    { agentType: 'check', moduleId, materials: ['source', 'generatedCode', 'comparisonRules'] },
    { agentType: 'review', moduleId, materials: ['knowledge', 'evaluation', 'comparison'] },
  ] };
}
