/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证普通本地目录的全文件冻结、重启读取及访问边界。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectDirectoryReader } from '../../src/infrastructure/source/ProjectDirectoryReader.ts';
import { LocalCasArtifactStore } from '../../src/infrastructure/sqlite/SqliteCas.ts';
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'directory-snapshot-test-'));
  const source = join(root, 'source'), runtime = join(root, 'runtime');
  mkdirSync(source); mkdirSync(runtime); mkdirSync(join(source, 'core'));
  writeFileSync(join(source, 'core', 'parse.c'), 'int parse(void) { return 1; }');
  const artifacts = new LocalCasArtifactStore(join(runtime, 'cas'));
  return { root, source, runtime, artifacts, reader: new ProjectDirectoryReader([source], runtime, artifacts) };
}
test('plain directory freezes all files and restart reads immutable source without Git', async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.source, 'README.md'), 'original documentation');
    writeFileSync(join(f.source, 'fixture.bin'), Buffer.from([0, 255, 7]));
    const first = await f.reader.analyze(f.source, 'WORKTREE');
    assert.equal(existsSync(join(f.source, '.git')), false);
    assert.match(first.commit, /^directory:[a-f0-9]{64}$/);
    assert.equal(first.directorySnapshot!.fileCount, 3);
    assert.deepEqual(first.inventory!.map(file => file.path), ['core/parse.c', 'fixture.bin', 'README.md']);
    assert.equal((await f.reader.analyze(f.source, 'WORKTREE')).commit, first.commit);
    writeFileSync(join(f.source, 'README.md'), 'changed documentation');
    const documentationChanged = await f.reader.analyze(f.source, 'WORKTREE');
    assert.notEqual(documentationChanged.commit, first.commit);
    assert.notEqual(documentationChanged.sourceDigest, first.sourceDigest);
    writeFileSync(join(f.source, 'core', 'parse.c'), 'int parse(void) { return 2; }');
    const restarted = new ProjectDirectoryReader([f.source], f.runtime, f.artifacts);
    assert.equal((await restarted.analyze(f.source, first.commit)).commit, first.commit);
    assert.equal((await restarted.readFiles(f.source, first.commit, ['core/parse.c']))[0]!.content, 'int parse(void) { return 1; }');
    await assert.rejects(restarted.readFiles(f.source, first.commit, ['../outside.c']), /REPOSITORY_SOURCE_SELECTION_INVALID/);
    await assert.rejects(restarted.readFiles(f.source, first.commit, ['fixture.bin']), /REPOSITORY_SOURCE_SELECTION_INVALID/);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(restarted.analyze(f.source, 'WORKTREE', controller.signal), /abort/i);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test('links are inventory only, outside roots and runtime recursion are rejected', async () => {
  const f = fixture();
  try {
    const outside = join(f.root, 'outside.c'); writeFileSync(outside, 'OUTSIDE_SECRET');
    symlinkSync(outside, join(f.source, 'outside.c'));
    const snapshot = await f.reader.analyze(f.source, 'WORKTREE');
    assert.equal(snapshot.inventory!.find(file => file.path === 'outside.c')!.kind, 'symlink');
    assert.ok(!snapshot.files.some(file => file.path === 'outside.c'));
    await assert.rejects(f.reader.readFiles(f.source, snapshot.commit, ['outside.c']), /REPOSITORY_SOURCE_SELECTION_INVALID/);
    await assert.rejects(f.reader.analyze(f.root, 'WORKTREE'), /SOURCE_ACCESS_DENIED/);
    const broad = new ProjectDirectoryReader([f.root], f.runtime, f.artifacts);
    await assert.rejects(broad.analyze(f.root, 'WORKTREE'), /DIRECTORY_CONTAINS_RUNTIME/);
    await assert.rejects(broad.analyze(f.runtime, snapshot.commit), /SOURCE_ACCESS_DENIED/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test('concurrent content changes cannot silently enter a saved directory snapshot', async () => {
  const f = fixture();
  try {
    const put = f.artifacts.put.bind(f.artifacts); let changed = false;
    f.artifacts.put = async (...args) => {
      const ref = await put(...args);
      if (!changed) { changed = true; writeFileSync(join(f.source, 'core', 'parse.c'), 'changed during snapshot'); }
      return ref;
    };
    await assert.rejects(f.reader.analyze(f.source, 'WORKTREE'), /DIRECTORY_SOURCE_CHANGED/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
