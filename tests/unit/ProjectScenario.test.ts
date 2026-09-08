/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证项目Scenario的行为、约束及失败场景。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseProjectScenario } from '../../src/application/services/ProjectScenario.ts';
import { GENERIC_SCENARIO } from '../helpers/Fixture.ts';

test('project input is copied and supports explicit repository override', () => {
  const parsed = parseProjectScenario(GENERIC_SCENARIO, '/tmp/another-module');
  assert.equal(parsed.repositoryRoot, '/tmp/another-module');
  parsed.finalCommands[0].args.push('different');
  assert.equal(GENERIC_SCENARIO.finalCommands[0].args.length, 2);
});
test('project input rejects fixture answers, traversal, arbitrary tools and empty evaluation', () => {
  for (const change of [
    { assets: { codeV1: 'answer.js' } }, { sourcePaths: ['../private'] },
    { sourcePaths: ['/private'] }, { referenceCommands: [] },
    { finalCommands: [{ tool: 'bash', purpose: 'test', args: ['-c', 'true'] }] },
    { finalCommands: [{ tool: 'node', purpose: 'test', args: [], cwd: '../private' }] },
    { expectedCommit: 'HEAD' },
  ]) assert.throws(() => parseProjectScenario({ ...GENERIC_SCENARIO, ...change }), /WORKFLOW_SCENARIO_INVALID/);
});
