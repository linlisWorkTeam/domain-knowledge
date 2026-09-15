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
import { modelProcessLane } from '../../src/infrastructure/agentAdapters/ModelProcessLane.ts';

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
  assert.equal(generated.results[0]!.tool, 'typescript');
  const evidence = JSON.parse(Buffer.from(await artifacts.get(generated.evidenceRef)).toString());
  assert.equal(evidence.toolchain.maxConcurrentProcesses, 1);
  assert.equal(evidence.mode, 'generated');
  assert.equal(JSON.stringify(input.moduleSuite), expectedSuite);
  assert.equal(readFileSync(join(root, 'module.ts'), 'utf8'), source);
  assert.equal(git('status', '--porcelain'), before);
});

test('module evaluator: wrong reference expectations cannot become trusted candidates', async (t) => {
  const { artifacts, evaluator, input } = await fixture(t);
  input.moduleSuite.cases[0]!.expected = 'invented answer';
  const frozen = JSON.stringify(input.moduleSuite);
  const result = await evaluator.evaluate(input);
  assert.equal(result.passed, false);
  assert.equal(result.infrastructureFailure, false);
  assert.equal(result.testsPassed, 0);
  assert.equal(result.testsTotal, 5);
  const evidence = JSON.parse(Buffer.from(await artifacts.get(result.evidenceRef)).toString());
  assert.equal(evidence.caseResults[0].actual, 'held-only-by-host');
  assert.equal(evidence.caseResults[0].expected, 'invented answer');
  assert.equal(JSON.stringify(input.moduleSuite), frozen);
});

test('module evaluator: signature and TypeScript failures block execution before behavioral tests', async (t) => {
  const { evaluator, input } = await fixture(t);
  const result = await evaluator.evaluate({ ...input, generatedFiles: [{ path: 'module.ts',
    content: 'export function echo(value: number): number { return value; }' }] });
  assert.equal(result.passed, false);
  assert.equal(result.infrastructureFailure, false);
  assert.equal(result.results.length, 1);
  assert.match(result.results[0]!.stdout, /not assignable|incompatible/i);
  const bypass = await evaluator.evaluate({ ...input, generatedFiles: [{ path: 'module.ts',
    content: '// @ts-nocheck\nexport function echo(value: string): string { return 1; }' }] });
  assert.equal(bypass.passed, false);
  assert.match(bypass.results[0]!.stderr, /PROJECT_TYPECHECK_BYPASS_DENIED/);
});

test('module evaluator: module globals cannot forge serialization or use host process', async (t) => {
  const { artifacts, evaluator, input } = await fixture(t);
  const forged = await evaluator.evaluate({ ...input, generatedFiles: [{ path: 'module.ts', content:
    'export function echo(value: string): string { JSON.stringify = () => \'{"value":"held-only-by-host"}\'; return "incorrect"; }' }] });
  assert.equal(forged.passed, false);
  const evidence = JSON.parse(Buffer.from(await artifacts.get(forged.evidenceRef)).toString());
  assert.equal(evidence.caseResults[0].actual, 'incorrect');
  const leaked = await evaluator.evaluate({ ...input, generatedFiles: [{ path: 'module.ts', content:
    'declare const process: { env: Record<string, string> }; export function echo(value: string): string { return process.env.HOME; }' }] });
  assert.equal(leaked.passed, false);
  assert.match(leaked.results.at(-1)!.stderr, /process is not defined/);
  assert.equal(leaked.testsPassed, 0);
});

test('module evaluator: imports cannot inspect reference files and unsafe output paths are rejected', async (t) => {
  const { root, evaluator, input } = await fixture(t);
  const result = await evaluator.evaluate({ ...input,
    moduleContract: { ...input.moduleContract, signature: 'export declare function echo(value: string): Promise<string>;' },
    generatedFiles: [{ path: 'module.ts', content:
      `export async function echo(value: string): Promise<string> { const name: string = 'node:fs'; const fs = await import(name); return fs.readFileSync(${JSON.stringify(join(root, 'hidden-secret.txt'))}, 'utf8'); }` }] });
  assert.equal(result.passed, false);
  assert.equal(result.testsPassed, 0);
  assert.doesNotMatch(JSON.stringify(result), /REFERENCE_REPOSITORY_SECRET/);
  assert.match(result.results.at(-1)!.stderr, /MODULE_IMPORT_DENIED/);
  await assert.rejects(evaluator.evaluate({ ...input, generatedFiles: [{ path: '../module.ts', content: source }] }), /PROJECT_PATH_DENIED/);
  await assert.rejects(evaluator.evaluate({ ...input, generatedFiles: [{ path: 'module.ts', content: source },
    { path: 'hidden-secret.txt', content: 'replaced' }] }), /PROJECT_PATH_DENIED/);
  assert.equal(readFileSync(join(root, 'hidden-secret.txt'), 'utf8'), 'REFERENCE_REPOSITORY_SECRET');
});

test('module evaluator: case timeout kills an infinite loop and bounded output cannot fake a result', async (t) => {
  const { evaluator, input } = await fixture(t);
  const result = await evaluator.evaluate({ ...input, generatedFiles: [{ path: 'module.ts',
    content: 'export function echo(value: string): string { while (true) {} }' }] });
  assert.equal(result.passed, false);
  assert.equal(result.results.at(-1)!.timedOut, true);
  const overflow = await evaluator.evaluate({ ...input, generatedFiles: [{ path: 'module.ts',
    content: 'export function echo(value: string): string { return "x".repeat(300000); }' }] });
  assert.equal(overflow.passed, false);
  assert.equal(overflow.results.at(-1)!.outputLimitExceeded, true);
  assert.ok(overflow.results.at(-1)!.stdout.length <= 131_072);
});

test('module evaluator: cancellation terminates a busy isolated implementation and no process remains', async (t) => {
  const { evaluator, input } = await fixture(t);
  const controller = new AbortController();
  const marker = `cancel-marker-${process.pid}-${Date.now()}`;
  input.moduleSuite.cases[0]!.args = [marker];
  const timer = setTimeout(() => controller.abort(), 1200);
  const started = Date.now();
  try {
    await assert.rejects(evaluator.evaluate({ ...input, generatedFiles: [{ path: 'module.ts',
      content: 'export function echo(value: string): string { while (true) {} }' }] }, controller.signal), /PROJECT_EVALUATION_CANCELLED/);
  } finally { clearTimeout(timer); }
  assert.ok(Date.now() - started < 5000);
  const processes = spawnSync('ps', ['-eo', 'args'], { encoding: 'utf8', shell: false });
  assert.equal(processes.status, 0);
  assert.doesNotMatch(processes.stdout, new RegExp(marker));
});

test('module evaluator: missing kernel isolation tools fail closed', async (t) => {
  const { evaluator, input } = await fixture(t);
  const previous = process.env.WP_EVALUATION_BWRAP_COMMAND;
  process.env.WP_EVALUATION_BWRAP_COMMAND = '/nonexistent-bwrap-for-test';
  try {
    const result = await evaluator.evaluate(input);
    assert.equal(result.passed, false);
    assert.equal(result.infrastructureFailure, true);
    assert.equal(result.testsPassed, 0);
  } finally {
    if (previous === undefined) delete process.env.WP_EVALUATION_BWRAP_COMMAND;
    else process.env.WP_EVALUATION_BWRAP_COMMAND = previous;
  }
});

test('module evaluator: queued work shares the model process limit and remains cancellable', async (t) => {
  const { evaluator, input } = await fixture(t);
  let release!: () => void;
  const occupied = modelProcessLane.execute(() => new Promise<void>((resolve) => { release = resolve; }));
  await new Promise<void>((resolve) => setImmediate(resolve));
  const controller = new AbortController();
  const pending = evaluator.evaluate(input, controller.signal);
  controller.abort();
  try { await assert.rejects(pending, /PROJECT_EVALUATION_CANCELLED/); }
  finally { release(); await occupied; }
});
