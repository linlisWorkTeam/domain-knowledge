/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证 Git 基线增量范围与共享输入回退规则。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { gitGenerationScope } from '../../src/domain/workbench/GitGenerationScope.ts';
import { buildConstraints, createProjectSnapshot, type ProjectSource } from '../../src/domain/workbench/WorkbenchProject.ts';

const ref = { artifactId: 'test', sha256: 'test', mediaType: 'text/plain', size: 1 };
const one = { moduleId: 'one', language: 'c' as const, sourcePaths: ['one.c', 'one-util.c'], testPaths: [], selectedByDefault: true, reasons: [] };
const two = { ...one, moduleId: 'two', sourcePaths: ['two.c'] };
const file = (path: string, objectId = 'a', kind: ProjectSource['kind'] = 'source'): ProjectSource => ({ path, objectId, kind, ref });
const snapshot = (commit: string, sourceFiles: ProjectSource[], modules = [one, two], repositoryId = 'repo') =>
  createProjectSnapshot({ repositoryId, directory: '/repo', commit, sourceDigest: commit, sourceFiles, modules, build: buildConstraints(), manifestRef: ref }, '');
const base = snapshot('a'.repeat(40), [file('one.c'), file('one-util.c'), file('two.c')]);
const targetCommit = 'b'.repeat(40);

test('只重新生成修改、增删或移动了实现文件的模块', () => {
  const moved = { ...one, sourcePaths: ['one.c', 'one-helper.c'] };
  const target = snapshot(targetCommit, [file('one.c', 'b'), file('one-helper.c'), file('two.c')], [moved, two]);
  assert.deepEqual(gitGenerationScope(base, target, {}, {}, false), {
    moduleIds: ['one'], removedModuleIds: [], changedFileCount: 3, sharedInputsChanged: false, configurationChanged: false,
  });
});

test('新提交但冻结输入未变时不生成，删除整个模块时单独列出', () => {
  const target = snapshot(targetCommit, [...base.sourceFiles].reverse());
  assert.deepEqual(gitGenerationScope(base, target, {}, {}, false).moduleIds, []);
  const removed = snapshot(targetCommit, [file('two.c')], [two]);
  const delta = gitGenerationScope(base, removed, {}, {}, false);
  assert.deepEqual(delta.moduleIds, []);
  assert.deepEqual(delta.removedModuleIds, ['one']);
  assert.deepEqual(gitGenerationScope(removed, target, {}, {}, false).moduleIds, ['one']);
});

test('共享头文件、构建文件和模型配置变化时扩大生成范围', () => {
  for (const shared of [file('include/shared.h'), file('Makefile', 'a', 'build')]) {
    const target = snapshot(targetCommit, [...base.sourceFiles, shared]);
    assert.deepEqual(gitGenerationScope(base, target, {}, {}, false).moduleIds, ['one', 'two']);
  }
  assert.deepEqual(gitGenerationScope(base, base, {}, {}, true).moduleIds, ['one', 'two']);
});

test('模块构建及接口选择独立纳入范围，空接口设置等同于省略', () => {
  const target = { ...base, moduleBuilds: { two: buildConstraints({ definitions: ['LIMIT=2'] }) } };
  assert.deepEqual(gitGenerationScope(base, target, {}, { one: {} }, false).moduleIds, ['two']);
  assert.deepEqual(gitGenerationScope(base, target, {}, { one: { symbols: ['parse'] } }, false).moduleIds, ['one', 'two']);
});

test('拒绝不同仓库和本地目录快照', () => {
  const other = snapshot(targetCommit, base.sourceFiles, [one, two], 'other');
  assert.throws(() => gitGenerationScope(base, other, {}, {}, false), /GENERATION_BASE_PROJECT_MISMATCH/);
  const directory = { ...base, commit: 'directory:snapshot' };
  assert.throws(() => gitGenerationScope(directory, base, {}, {}, false), /GENERATION_GIT_REQUIRED/);
  assert.throws(() => gitGenerationScope(base, directory, {}, {}, false), /GENERATION_GIT_REQUIRED/);
});
