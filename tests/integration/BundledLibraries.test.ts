/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证包内动态库只读挂载、真实加载及拒绝任意服务器目录配置。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { bundledLibraryDirectory, bundledLibraryEnvironment, bundledLibrarySandboxArgs } from '../../src/infrastructure/runtime/BundledLibraries.ts';

function fixture(t: { after(fn: () => void): void }) {
  const root = mkdtempSync(join(tmpdir(), 'wp-bundled-libs-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, 'tools', 'bin'), library = join(root, 'tools', 'lib');
  mkdirSync(bin, { recursive: true }); mkdirSync(library);
  const runtime = join(bin, 'node');
  writeFileSync(runtime, 'node-location-fixture');
  return { root, library, runtime, environment: { WP_BUNDLED_LIB_DIR: library } };
}

test('bundled libraries: development mode does not inherit arbitrary linker paths', () => {
  const environment = { LD_LIBRARY_PATH: '/unrelated-host-path', PRIVATE_TOKEN: 'never-forward' };
  assert.equal(bundledLibraryDirectory(process.execPath, environment), undefined);
  assert.deepEqual(bundledLibraryEnvironment(process.execPath, environment), {});
  assert.deepEqual(bundledLibrarySandboxArgs(process.execPath, environment), []);
});

test('bundled libraries: only the current runtime sibling lib directory can be mounted', (t) => {
  const { root, library, runtime, environment } = fixture(t);
  writeFileSync(join(library, 'libtest.so.1'), 'test');
  assert.equal(bundledLibraryDirectory(runtime, environment), library);
  assert.deepEqual(bundledLibraryEnvironment(runtime, { ...environment, LD_LIBRARY_PATH: '/untrusted', PRIVATE_TOKEN: 'secret' }), { LD_LIBRARY_PATH: library });
  assert.throws(() => bundledLibraryDirectory(runtime, { WP_BUNDLED_LIB_DIR: root }), /BUNDLED_LIBRARY_DIRECTORY_INVALID/);
  assert.throws(() => bundledLibraryDirectory(runtime, { WP_BUNDLED_LIB_DIR: library + ':/usr/lib64' }), /BUNDLED_LIBRARY_DIRECTORY_INVALID/);
});

test('bundled libraries: links, subdirectories and non-library files cannot expand the mount', (t) => {
  const { root, library, runtime, environment } = fixture(t);
  writeFileSync(join(root, 'private'), 'host-private');
  symlinkSync(join(root, 'private'), join(library, 'libescape.so'));
  assert.throws(() => bundledLibraryDirectory(runtime, environment), /BUNDLED_LIBRARY_DIRECTORY_INVALID/);
  rmSync(join(library, 'libescape.so'));
  mkdirSync(join(library, 'data'));
  assert.throws(() => bundledLibraryDirectory(runtime, environment), /BUNDLED_LIBRARY_DIRECTORY_INVALID/);
  rmSync(join(library, 'data'), { recursive: true });
  writeFileSync(join(library, 'Configuration.env'), 'private');
  assert.throws(() => bundledLibraryDirectory(runtime, environment), /BUNDLED_LIBRARY_DIRECTORY_INVALID/);
});

test('bundled libraries: Linux sandbox loads the copied exact library and keeps it read-only', (t) => {
  const { root, library, runtime, environment } = fixture(t);
  // 复制当前受测系统的精确 C++ 运行库，不下载、编译或复制开发工具。
  const loaded = (process.report.getReport() as { sharedObjects: string[] }).sharedObjects;
  const cppLibrary = loaded.find((path) => basename(path) === 'libstdc++.so.6');
  assert.ok(cppLibrary, 'the tested Node runtime must load a C++ system library');
  copyFileSync(realpathSync(cppLibrary), join(library, 'libstdc++.so.6'));
  const secret = join(root, 'host-secret'); writeFileSync(secret, 'host-secret');
  const script = `const fs = require('node:fs'); let denied = false; try { fs.writeFileSync('/runtime-libs/write-probe', 'x'); } catch (error) { denied = error.code === 'EROFS'; }
process.stdout.write(JSON.stringify({ path: process.env.LD_LIBRARY_PATH, denied, hidden: !fs.existsSync(${JSON.stringify(secret)}),
  loaded: process.report.getReport().sharedObjects.includes('/runtime-libs/libstdc++.so.6') }));`;
  const result = spawnSync('bwrap', [
    '--unshare-all', '--die-with-parent', '--new-session', '--cap-drop', 'ALL',
    '--ro-bind', '/usr', '/usr', '--symlink', 'usr/lib', '/lib', '--symlink', 'usr/lib64', '/lib64',
    '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp', '--ro-bind', process.execPath, '/runtime-node',
    '--clearenv', ...bundledLibrarySandboxArgs(runtime, environment), '--', '/runtime-node', '-e', script,
  ], { env: { PATH: process.env.PATH, ...bundledLibraryEnvironment(runtime, environment) }, encoding: 'utf8', timeout: 5000, maxBuffer: 32_768 });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { path: '/runtime-libs', denied: true, hidden: true, loaded: true });
});
