/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验收 AC-AGENT-101 的测试入口与辅助文件契约。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateOutput } from '../../src/domain/agents/testGenAgent/TestGenAgentContract.ts';
import type { Input } from '../../src/domain/agents/testGenAgent/TestGenAgentContract.ts';
import { roleExample } from '../helpers/RoleExample.ts';
import { cppScenario, cppTestOutput } from '../helpers/CppScenario.ts';
import { createTestComposition } from '../helpers/Fixture.ts';
import { TrustedProjectEvaluator } from '../../src/infrastructure/evaluation/project/TrustedProjectEvaluator.ts';

function sample() {
  const input = roleExample<Input>('test-gen').input;
  input.sourcePaths = ['src/module.cpp']; input.publicInterfacePaths = [];
  input.payload.allowedTestPaths = ['tests/generated.cpp', 'tests/helper.h', 'tests/unused.cpp'];
  const output = cppTestOutput();
  output.files[0]!.content = '#include "helper.h"\n' + output.files[0]!.content.replace('== 4', '== EXPECTED');
  output.files.push({ path: 'tests/helper.h', content: '#define EXPECTED 4\n' });
  return { input, output };
}

test('AC-AGENT-101: helper headers need no invented case and compile with their entry', async () => {
  const { input, output } = sample();
  validateOutput(output, input);
  const c = createTestComposition(), f = cppScenario();
  try {
    const evaluator = new TrustedProjectEvaluator(c.artifacts);
    const snapshot = await evaluator.inspect(f.scenario);
    const result = await evaluator.evaluate({ label: 'entry-and-helper', snapshot, generatedFiles: output.files, testSuite: output,
      prepareCommands: [], commands: f.scenario.referenceCommands });
    assert.equal(result.passed, true);
  } finally { c.dispose(); f.cleanup(); }
});

test('AC-AGENT-101: header entries, header-only suites and unlisted translation units are rejected', () => {
  for (const kind of ['header-entry', 'header-only', 'unused']) {
    const { input, output } = sample();
    if (kind === 'unused') output.files.push({ path: 'tests/unused.cpp', content: 'int helper() {return 4;}' });
    else output.cases[0]!.testPath = 'tests/helper.h';
    if (kind === 'header-only') output.files.shift();
    assert.throws(() => validateOutput(output, input), /TESTGEN_CASE_MANIFEST_INVALID/);
  }
});
