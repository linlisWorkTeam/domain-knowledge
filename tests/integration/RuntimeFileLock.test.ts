/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证跨进程运行目录共享、维护排他与退出释放。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { RuntimeFileLock } from '../../src/infrastructure/sqlite/RuntimeFileLock.ts';

test('normal holders coexist; maintenance excludes peers and restores sharing after failure', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'runtime-lock-'));
  const first = new RuntimeFileLock(dir), second = new RuntimeFileLock(dir);
  try {
    await assert.rejects(first.exclusive(async () => assert.fail('must not execute')), /RUNTIME_OTHER_WRITERS/);
    assert.equal(first.available, true);
    second.close();
    await assert.rejects(first.exclusive(async () => {
      assert.equal(first.available, false);
      assert.throws(() => first.close(), /RUNTIME_OPERATIONS_ACTIVE/);
      assert.throws(() => new RuntimeFileLock(dir), /RUNTIME_MAINTENANCE/);
      throw new Error('work failed');
    }), /work failed/);
    assert.equal(first.available, true);
    const third = new RuntimeFileLock(dir); third.close();
  } finally { first.close(); second.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('a live separate process prevents deletion; kernel releases its lock after termination', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'runtime-lock-'));
  const first = new RuntimeFileLock(dir);
  const url = new URL('../../src/infrastructure/sqlite/RuntimeFileLock.ts', import.meta.url).href;
  const child = spawn(process.execPath, ['--input-type=module', '-e',
    `import { RuntimeFileLock } from ${JSON.stringify(url)}; const lock = new RuntimeFileLock(process.argv[1]); process.stdout.write('ready'); setInterval(() => {}, 1000);`, dir],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const ready = await Promise.race([once(child.stdout!, 'data'), once(child, 'exit').then(() => { throw new Error('child exited before ready'); })]);
    assert.equal(String(ready[0]), 'ready');
    await assert.rejects(first.exclusive(async () => assert.fail()), /RUNTIME_OTHER_WRITERS/);
    const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
    assert.equal(await first.exclusive(async () => 'deleted'), 'deleted');
  } finally {
    if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited; }
    first.close(); rmSync(dir, { recursive: true, force: true });
  }
});

test('replacing the lock inode fails closed for an existing holder', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'runtime-lock-')), lock = new RuntimeFileLock(dir);
  try {
    renameSync(join(dir, 'runtime-access.lock'), join(dir, 'old-lock'));
    writeFileSync(join(dir, 'runtime-access.lock'), '');
    assert.equal(lock.available, false);
    await assert.rejects(lock.exclusive(async () => assert.fail()), /RUNTIME_LOCK_UNAVAILABLE/);
  } finally { lock.close(); rmSync(dir, { recursive: true, force: true }); }
});
