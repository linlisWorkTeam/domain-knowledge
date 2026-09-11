/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证影响范围隔离和混合变更并集，不固定工作流 job 布局。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { routeVerification, selectedTests } from '../../scripts/VerificationRouter.ts';

test('Markdown and catalog changes remain dependency-free, including main', () => {
  for (const files of [['README.md'], ['docs/Development.md', 'docs/FileCatalog.json'], ['src/domain/README.md']]) {
    assert.deepEqual(routeVerification(files), ['docs']);
    assert.deepEqual(routeVerification(files, { main: true }), ['docs']);
  }
});

test('a domain role change runs domain contracts without browser or acceptance', () => {
  const scopes = routeVerification(['src/domain/agents/codeAgent/CodeAgent.ts']);
  assert.ok(scopes.includes('domain'));
  assert.ok(!scopes.includes('web') && !scopes.includes('acceptance'));
  const files = selectedTests(scopes);
  assert.ok(files.includes('tests/integration/AgentContracts.test.ts'));
  assert.ok(!files.some((file) => file.startsWith('tests/acceptance/') || file.endsWith('/Server.test.ts')));
});

test('mixed changes retain both scopes and schemas cannot hide as documentation', () => {
  const scopes = routeVerification(['web/App.js', 'src/domain/Domain.ts', 'docs/specs/schemas/AgentCommand.schema.json']);
  for (const scope of ['web', 'domain', 'schema'] as const) assert.ok(scopes.includes(scope));
  assert.ok(!routeVerification(['src/infrastructure/sqlite/SqliteCas.ts']).includes('web'));
});

test('explicit acceptance, main runtime changes and dispatch run acceptance', () => {
  assert.ok(routeVerification(['tests/acceptance/PublicationFlow.test.ts']).includes('acceptance'));
  assert.ok(routeVerification(['src/domain/Domain.ts'], { main: true }).includes('acceptance'));
  assert.ok(routeVerification([], { full: true }).includes('acceptance'));
  assert.ok(!routeVerification(['package-lock.json']).includes('acceptance'));
});

test('dependency changes include browser and lock checks while unknown paths are not silently skipped', () => {
  for (const path of ['package-lock.json', '.github/workflows/Ci.yml', 'new.config.json', 'tests/integration/WorktreeBootstrap.test.ts']) {
    const scopes = routeVerification([path]);
    assert.ok(scopes.includes('dependency') && scopes.includes('web'));
    assert.ok(selectedTests(scopes).includes('tests/contract/DependencyLock.test.ts'));
  }
});
