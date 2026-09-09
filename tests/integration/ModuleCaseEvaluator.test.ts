/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证独立模块的参考校验、宿主比较、构建门禁与 Linux 执行隔离。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TrustedProjectEvaluator } from '../../src/infrastructure/evaluation/project/TrustedProjectEvaluator.ts';
import { LocalCasArtifactStore } from '../../src/infrastructure/sqlite/SqliteCas.ts';
import type { ModuleBehaviorSuite } from '../../src/domain/agents/testGenAgent/ModuleBehaviorSuite.ts';

const source = 'export function echo(value: string): string { return value; }\n';
async function fixture(t: { after(fn: () => void): void }) {
  const root = mkdtempSync(join(tmpdir(), 'wp-module-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args: string[]) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', env: { PATH: process.env.PATH }, shell: false });
    assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
  };
  writeFileSync(join(root, 'module.ts'), source);
  writeFileSync(join(root, 'interface.d.ts'), 'export declare function echo(value: string): string;\n');
  writeFileSync(join(root, 'hidden-secret.txt'), 'REFERENCE_REPOSITORY_SECRET');
  git('init', '--quiet'); git('add', '.');
  git('-c', 'user.name=Module evaluator test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'reference');
  const artifacts = new LocalCasArtifactStore(join(root, 'artifacts'));
  const evaluator = new TrustedProjectEvaluator(artifacts);
  const snapshot = await evaluator.inspect({ repositoryRoot: root, sourcePaths: ['module.ts'], publicInterfacePaths: ['interface.d.ts'] });
  const moduleSuite: ModuleBehaviorSuite = { schemaVersion: 'module-cases-v1', modulePath: 'module.ts', exportName: 'echo',
    cases: [{ caseId: 'identity', description: '输入原样返回', args: ['held-only-by-host'], expected: 'held-only-by-host' }] };
  const input = { label: 'module-evaluator-test', snapshot, moduleSuite,
    moduleContract: { modulePath: 'module.ts', exportName: 'echo', signature: 'export declare function echo(value: string): string;' },
    generatedFiles: [] as { path: string; content: string }[], prepareCommands: [], commands: [] };
  return { root, git, artifacts, evaluator, input };
}

test('module evaluator: reference and generated implementations pass five frozen host comparisons', async (t) => {
  const { root, git, artifacts, evaluator, input } = await fixture(t);
  const before = git('status', '--porcelain');
  const expectedSuite = JSON.stringify(input.moduleSuite);
  const reference = await evaluator.evaluate(input);
  assert.equal(reference.passed, true, JSON.stringify(reference.results));
  assert.equal(reference.testsPassed, 5);
  assert.equal(reference.stability, 1);
  assert.equal(input.snapshot.sourceContentRefs?.length, 1);
  assert.equal(input.snapshot.publicInterfaceRefs?.length, 1);
  const sourceMaterial = JSON.parse(Buffer.from(await artifacts.get(input.snapshot.sourceContentRefs![0]!)).toString());
  assert.equal(sourceMaterial.content, source);
  const generated = await evaluator.evaluate({ ...input, generatedFiles: [{ path: 'module.ts', content: source }] });
  assert.equal(generated.passed, true, JSON.stringify(generated.results));
  assert.equal(generated.results.filter((result) => result.purpose === 'test').length, 5);
  const evidence = JSON.parse(Buffer.from(await artifacts.get(generated.evidenceRef)).toString());
  assert.equal(evidence.toolchain.maxConcurrentProcesses, 1);
  assert.equal(evidence.mode, 'generated');
  assert.equal(JSON.stringify(input.moduleSuite), expectedSuite);
  assert.equal(readFileSync(join(root, 'module.ts'), 'utf8'), source);
  assert.equal(git('status', '--porcelain'), before);
});
