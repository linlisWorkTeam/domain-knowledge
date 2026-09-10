/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证真实固定 Git 提交、目录边界、取消及仓库分析 HTTP 入口。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { GitRepositoryAnalyzer } from '../../src/infrastructure/source/GitRepositoryAnalyzer.ts';
import { createKnowledgeServer } from '../../src/interfaces/runner/Server.ts';

function repository() {
  const root = mkdtempSync(join(tmpdir(), 'repository-analysis-'));
  const git = (args: string[]) => execFileSync('git', ['-c', 'user.name=Analysis Test', '-c', 'user.email=analysis@example.test', ...args], {
    cwd: root, encoding: 'utf8', env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
  }).trim();
  git(['init', '-q']); mkdirSync(join(root, 'tests'));
  writeFileSync(join(root, 'parser.c'), 'int parse(void) { return 1; }\n');
  writeFileSync(join(root, 'parser.h'), 'int parse(void);\n');
  writeFileSync(join(root, 'tests', 'parser_test.c'), '/* fixed reference test */\n');
  writeFileSync(join(root, 'convert.cpp'), 'int convert() { return 2; }\n');
  writeFileSync(join(root, 'other.py'), 'print("unsupported")\n');
  writeFileSync(join(root, 'Makefile'), 'all:\n\tcc -c parser.c\n');
  symlinkSync('/etc/passwd', join(root, 'outside.h'));
  git(['add', '.']); git(['commit', '-qm', 'Pinned input']);
  return { root, commit: git(['rev-parse', 'HEAD']), git };
}

test('analysis pins Git objects and does not read dirty source, test bodies or symlink targets', async () => {
  const fixture = repository(); const analyzer = new GitRepositoryAnalyzer([fixture.root], fixture.root);
  try {
    const first = await analyzer.analyze(fixture.root);
    writeFileSync(join(fixture.root, 'parser.c'), 'DIRTY_IMPLEMENTATION_MUST_NOT_APPEAR');
    const second = await analyzer.analyze(fixture.root, fixture.commit);
    assert.equal(first.commit, fixture.commit); assert.equal(first.sourceDigest, second.sourceDigest);
    assert.ok(first.files.find((file) => file.path === 'tests/parser_test.c' && file.kind === 'test'));
    assert.ok(!first.modules.some((module) => module.sourcePaths.includes('tests/parser_test.c')));
    assert.deepEqual(first.modules.find((module) => module.moduleId === 'parser')?.sourcePaths, ['parser.c', 'parser.h']);
    assert.equal(first.modules.find((module) => module.moduleId === 'parser')?.language, 'c');
    assert.equal(first.modules.find((module) => module.moduleId === 'other')?.selectedByDefault, false);
    assert.equal(first.modules.find((module) => module.moduleId === 'convert')?.language, 'cpp');
    assert.ok(!first.files.some((file) => file.path === 'outside.h'));
    assert.ok(first.warnings.some((warning) => warning.includes('outside.h')));
    assert.ok(first.buildSystems.includes('make'));
    assert.ok(first.resources.availableMemoryBytes > 0 && first.resources.availableDiskBytes > 0);
    assert.ok(first.tools.some((tool) => tool.name === 'gcc'));
    assert.doesNotMatch(JSON.stringify(second), /DIRTY_IMPLEMENTATION_MUST_NOT_APPEAR|root:x:|return 1/);
    await assert.rejects(analyzer.analyze('/etc'), /SOURCE_ACCESS_DENIED/);
    await assert.rejects(analyzer.analyze(join(fixture.root, 'tests')), /REPOSITORY_ROOT_REQUIRED/);
    await assert.rejects(analyzer.analyze(fixture.root, '--help'), /REPOSITORY_REVISION_UNAVAILABLE/);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(analyzer.analyze(fixture.root, 'HEAD', controller.signal));
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('repository analysis API freezes a reusable manifest and rejects cross-site access', async () => {
  const fixture = repository(); const runtimeDir = mkdtempSync(join(tmpdir(), 'analysis-runtime-'));
  const instance = createKnowledgeServer({ runtimeDir, anonymousAccess: true });
  instance.server.listen(0, '127.0.0.1'); await once(instance.server, 'listening');
  const address = instance.server.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/api/v1/repository-analyses`;
  try {
    const request = () => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ directory: fixture.root, revision: fixture.commit }) });
    const response = await request(); assert.equal(response.status, 200);
    const first = await response.json(); const repeated = await (await request()).json();
    assert.equal(first.manifestRef.artifactId, repeated.manifestRef.artifactId);
    const manifest = JSON.parse(Buffer.from(await instance.composition.artifacts.get(first.manifestRef)).toString());
    assert.equal(manifest.commit, fixture.commit); assert.equal(manifest.resources, undefined);
    assert.equal(manifest.tools, undefined); assert.ok(manifest.files.length);
    const denied = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://other.test' },
      body: JSON.stringify({ directory: fixture.root }) });
    assert.equal(denied.status, 503);
    assert.equal(instance.composition.apps.workbenchStages.store.list().length, 0, 'analysis does not start generation');
  } finally {
    await instance.composition.shutdown(); instance.server.close(); await once(instance.server, 'close');
    rmSync(runtimeDir, { recursive: true, force: true }); rmSync(fixture.root, { recursive: true, force: true });
  }
});
