/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：提供语言无关的有界Linux隔离命令执行。
 */
import { spawn } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { bundledLibraryEnvironment, bundledLibrarySandboxArgs } from './BundledLibraries.ts';
import { CommandResourceGroup, executablePath, resourceLauncher } from './CommandResourceGroup.ts';

export interface IsolatedCommandResult {
  exitCode: number | null; timedOut: boolean; outputLimitExceeded: boolean; durationMs: number;
  stdout: string; stderr: string;
}

/** 每个案例独占一个 PID / 网络 / 文件系统命名空间，取消或输出超限均杀死整组子进程。 */
export async function captureIsolated(input: {
  workspace: string; command: string[]; compilerRoot?: string; buildOutput?: string; timeoutMs: number; memoryBytes: number;
  processLimit?: number; outputBytes?: number;
}, signal?: AbortSignal): Promise<IsolatedCommandResult> {
  if (signal?.aborted) throw new Error('PROJECT_EVALUATION_CANCELLED');
  if (process.platform !== 'linux') throw new Error('PROJECT_ISOLATION_UNAVAILABLE: Linux namespaces required');
  const maxOutputBytes = input.outputBytes ?? 131_072;
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1 || maxOutputBytes > 8_388_608) throw new Error('PROJECT_RESOURCE_LIMIT_INVALID');
  const mounts = ['/usr', '/lib', '/lib64', '/etc/alternatives'].filter(existsSync).flatMap((path) => ['--ro-bind', path, path]);
  const args = [
    `--as=${input.memoryBytes}`, '--cpu=15', '--nofile=96', '--fsize=1048576', '--',
    process.env.WP_EVALUATION_BWRAP_COMMAND ?? 'bwrap',
    ...(input.processLimit === undefined ? ['--unshare-all'] : ['--unshare-user', '--unshare-ipc', '--unshare-pid', '--unshare-net', '--unshare-uts', '--unshare-cgroup']), '--die-with-parent', '--new-session', '--cap-drop', 'ALL',
    ...mounts, '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp',
    '--ro-bind', realpathSync(process.execPath), '/runtime-node',
    '--ro-bind', input.workspace, '/workspace',
    ...(input.buildOutput ? ['--bind', input.buildOutput, '/workspace/build'] : []),
    ...(input.compilerRoot ? ['--ro-bind', input.compilerRoot, '/compiler'] : []),
    '--clearenv', '--setenv', 'HOME', '/tmp', '--setenv', 'TMPDIR', '/tmp',
    ...bundledLibrarySandboxArgs(),
    '--setenv', 'GOMAXPROCS', '1', '--setenv', 'GOMEMLIMIT', '128MiB',
    '--setenv', 'NODE_NO_WARNINGS', '1', '--setenv', 'PATH', '/usr/bin:/bin', '--chdir', '/workspace', '--', ...input.command,
  ];
  const limiter = process.env.WP_EVALUATION_PRLIMIT_COMMAND ?? 'prlimit';
  const limiterPath = input.processLimit === undefined ? limiter : executablePath(limiter);
  const group = input.processLimit === undefined ? null : new CommandResourceGroup(input.memoryBytes, input.processLimit);
  let groupReleased = false;
  const startedAt = Date.now();
  try { return await new Promise<IsolatedCommandResult>((resolve, reject) => {
    const child = spawn(group ? process.execPath : limiterPath, group ? ['--max-old-space-size=32', '--no-warnings', '--input-type=module', '-e', resourceLauncher, group.membershipDirectory, limiterPath, ...args] : args, {
      env: { PATH: process.env.PATH, ...bundledLibraryEnvironment() }, detached: true, stdio: ['ignore', 'pipe', 'pipe'], shell: false,
    });
    let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0);
    let timedOut = false, outputLimitExceeded = false, cancelled = false;
    let failure: Error | null = null;
    const kill = () => {
      try { group?.kill(); } catch { failure = new Error('PROJECT_ISOLATION_CLEANUP_FAILED'); }
      if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already reaped */ } }
    };
    const append = (current: Buffer<ArrayBufferLike>, chunk: Buffer<ArrayBufferLike>) => {
      const remaining = Math.max(0, maxOutputBytes - stdout.length - stderr.length);
      if (chunk.length > remaining) { outputLimitExceeded = true; kill(); }
      return Buffer.concat([current, chunk.subarray(0, remaining)]);
    };
    child.stdout.on('data', (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr.on('data', (chunk: Buffer) => { stderr = append(stderr, chunk); });
    const timer = setTimeout(() => { timedOut = true; kill(); }, input.timeoutMs);
    const abort = () => { cancelled = true; kill(); };
    signal?.addEventListener('abort', abort, { once: true });
    // 覆盖 spawn 与监听器注册之间的取消竞态。
    if (signal?.aborted) abort();
    child.once('error', (error) => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      failure = new Error(`PROJECT_ISOLATION_UNAVAILABLE: ${error.message}`);
    });
    child.once('close', async (exitCode) => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      try { await group?.close(); groupReleased = true; } catch { reject(new Error('PROJECT_ISOLATION_CLEANUP_FAILED')); return; }
      if (failure) { reject(failure); return; }
      if (cancelled) { reject(new Error('PROJECT_EVALUATION_CANCELLED')); return; }
      resolve({ exitCode, timedOut, outputLimitExceeded, durationMs: Date.now() - startedAt,
        stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8') });
    });
  }); } catch (error) { if (group && !groupReleased) await group.close(); throw error; }
}
