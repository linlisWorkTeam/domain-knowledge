#!/usr/bin/env node
/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：确认离线工具存在，且发行物中的符号链接没有修改或越界。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';

const root = realpathSync(resolve(process.argv[2] || '.'));
const manifest = JSON.parse(readFileSync(join(root, 'Manifest.json'), 'utf8'));
const packageVersion = JSON.parse(readFileSync(join(root, 'app', 'package.json'), 'utf8')).version;
if (manifest.version !== packageVersion || (process.argv[3] && manifest.version !== process.argv[3])) throw new Error('Bundle version does not match the installation target');
const inventory = JSON.parse(readFileSync(join(root, 'Links.json'), 'utf8'));
if (inventory.schemaVersion !== '1.0' || !Array.isArray(inventory.links)) throw new Error('Unsupported bundle link manifest');
for (const entry of inventory.links) {
  if (typeof entry.path !== 'string' || typeof entry.target !== 'string' || isAbsolute(entry.path)) throw new Error('Invalid bundle link');
  const path = resolve(root, entry.path);
  if (!path.startsWith(root + '/')) throw new Error('Bundle link path escapes installation');
  if (!lstatSync(path).isSymbolicLink() || readlinkSync(path) !== entry.target) throw new Error(`Bundle link changed: ${entry.path}`);
  if (!realpathSync(path).startsWith(root + '/')) throw new Error(`Bundle link target escapes installation: ${entry.path}`);
}
for (const tool of ['node', 'git', 'bwrap', 'bash', 'prlimit', 'ssh']) {
  const path = join(root, 'tools', 'bin', tool);
  if (!existsSync(path)) throw new Error(`Missing bundled tool: ${tool}`);
  execFileSync(path, [tool === 'ssh' ? '-V' : '--version'], { stdio: 'pipe', timeout: 10_000, env: { ...process.env, LD_LIBRARY_PATH: join(root, 'tools', 'lib') } });
}
const compiler = join(root, 'app', 'node_modules', '@typescript', 'typescript-linux-x64', 'lib', 'tsc');
execFileSync(compiler, ['--version'], { stdio: 'pipe', timeout: 10_000 });
const dshPackage = join(root, 'app', 'node_modules', '@deepseek-ai', 'dsh', 'package.json');
if (!JSON.parse(readFileSync(dshPackage, 'utf8')).version) throw new Error('Missing bundled DSH package');
// 实际加载原生扩展，版本文件存在不能证明离线运行库完整。
const requireApp = createRequire(join(root, 'app', 'package.json'));
requireApp('node-pty');
const Database = requireApp('better-sqlite3');
const database = new Database(':memory:');
try { database.prepare('SELECT 1').get(); } finally { database.close(); }
console.log(JSON.stringify({ status: 'VERIFIED', schemaVersion: '1.0', symbolicLinks: inventory.links.length, nativeCompiler: relative(root, compiler) }));
