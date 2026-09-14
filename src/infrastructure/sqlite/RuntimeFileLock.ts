/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：以进程生命周期共享锁保护运行目录，删除维护时升级独占且失败关闭入口。
 */
import { spawnSync } from 'node:child_process';
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
export class RuntimeFileLock {
  readonly directory: string;
  private readonly root: number;
  private readonly handle: number;
  private mode: 'SHARED' | 'EXCLUSIVE' | 'NONE' | 'CLOSED' = 'NONE';
  private active: Promise<unknown> | null = null;
  constructor(directory: string) {
    if (process.platform !== 'linux') throw new Error('RUNTIME_LOCK_PLATFORM_UNSUPPORTED');
    mkdirSync(directory, { recursive: true }); this.directory = realpathSync(directory);
    this.root = openSync(this.directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { this.handle = openSync(`/proc/self/fd/${this.root}/runtime-access.lock`, constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW, 0o600); }
    catch (error) { closeSync(this.root); throw error; }
    try {
      if (!this.acquire('SHARED')) throw new Error('RUNTIME_MAINTENANCE');
    } catch (error) { closeSync(this.handle); closeSync(this.root); this.mode = 'CLOSED'; throw error; }
  }
  private assertIdentity(): void {
    if (this.mode === 'CLOSED') throw new Error('RUNTIME_LOCK_CLOSED');
    const root = fstatSync(this.root, { bigint: true }), current = lstatSync(this.directory, { bigint: true });
    const held = fstatSync(this.handle, { bigint: true }), lock = lstatSync(join(this.directory, 'runtime-access.lock'), { bigint: true });
    if (!current.isDirectory() || current.dev !== root.dev || current.ino !== root.ino
      || !lock.isFile() || held.dev !== lock.dev || held.ino !== lock.ino) throw new Error('RUNTIME_LOCK_CHANGED');
  }
  private acquire(mode: 'SHARED' | 'EXCLUSIVE'): boolean {
    this.assertIdentity();
    // 子进程的fd 3与父进程共享同一open-file-description；flock退出后锁仍由父句柄持有。
    const result = spawnSync('flock', ['--nonblock', mode === 'SHARED' ? '--shared' : '--exclusive', '3'],
      { stdio: ['ignore', 'ignore', 'pipe', this.handle], timeout: 1000, maxBuffer: 4096 });
    if (result.error || result.signal || ![0, 1].includes(result.status ?? -1)) throw new Error('RUNTIME_LOCK_UNAVAILABLE');
    if (result.status === 1) return false;
    this.mode = mode; return true;
  }
  get available(): boolean {
    if (this.mode === 'CLOSED' || this.mode === 'EXCLUSIVE') return false;
    try { this.assertIdentity(); return this.mode === 'SHARED' || this.acquire('SHARED'); } catch { return false; }
  }
  get idle(): boolean { return this.active === null && this.mode !== 'EXCLUSIVE'; }
  async whenIdle(): Promise<void> { try { await this.active; } catch { /* 工作失败不阻止关闭句柄。 */ } }
  exclusive<T>(work: () => Promise<T>): Promise<T> {
    if (this.active || this.mode === 'EXCLUSIVE') return Promise.reject(new Error('RUNTIME_OPERATIONS_ACTIVE'));
    try {
      if (!this.available) throw new Error('RUNTIME_LOCK_UNAVAILABLE');
      // flock升级失败后原共享锁可能已经释放，必须明确恢复，不能继续假装拥有锁。
      this.mode = 'NONE';
      if (!this.acquire('EXCLUSIVE')) { this.acquire('SHARED'); throw new Error('RUNTIME_OTHER_WRITERS'); }
    } catch (error) { return Promise.reject(error); }
    const operation = (async () => {
      try { return await work(); }
      finally {
        this.mode = 'NONE';
        try { this.acquire('SHARED'); } catch { /* available保持false，禁止恢复普通访问。 */ }
      }
    })();
    this.active = operation;
    void operation.finally(() => { this.active = null; }).catch(() => {});
    return operation;
  }
  close(): void {
    if (this.mode === 'CLOSED') return;
    if (this.active || this.mode === 'EXCLUSIVE') throw new Error('RUNTIME_OPERATIONS_ACTIVE');
    this.mode = 'CLOSED'; closeSync(this.handle); closeSync(this.root);
    // 保留锁文件，避免旧持有者与新inode各自获得锁；内核随所有句柄退出自动释放。
  }
}
