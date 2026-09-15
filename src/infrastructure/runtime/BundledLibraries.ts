/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证安装版专属动态库目录，并生成宿主子进程与隔离进程的最小库路径配置。
 */
import { lstatSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

/** 只允许当前安装版 Node 的 tools/lib，避免环境配置把任意服务器目录挂入角色空间。 */
export function bundledLibraryDirectory(nodeExecutable = process.execPath, environment: NodeJS.ProcessEnv = process.env): string | undefined {
  const requested = environment.WP_BUNDLED_LIB_DIR;
  if (requested === undefined) return undefined;
  const fail = (): never => { throw new Error('BUNDLED_LIBRARY_DIRECTORY_INVALID'); };
  if (!requested || !isAbsolute(requested) || requested.includes(':') || requested.includes('\0')) return fail();
  const expected = resolve(dirname(realpathSync(nodeExecutable)), '..', 'lib');
  let directory: string;
  try {
    directory = realpathSync(requested);
    if (directory !== expected || !lstatSync(directory).isDirectory()) return fail();
    const entries = readdirSync(directory, { withFileTypes: true });
    // 发行库目录只含实际动态库文件；不允许子目录、脚本或指向其他位置的链接。
    if (!entries.length || entries.some((entry) => !entry.isFile() || !/\.so(?:\.[A-Za-z0-9._-]+)?$/.test(entry.name))) return fail();
  } catch { return fail(); }
  return directory;
}

/** 宿主 git/prlimit/bwrap 可使用包内库，不继承其余动态链接器环境设置。 */
export function bundledLibraryEnvironment(nodeExecutable = process.execPath, environment: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const directory = bundledLibraryDirectory(nodeExecutable, environment);
  return directory ? { LD_LIBRARY_PATH: directory } : {};
}

/** 使用固定隔离路径只读映射动态库；源路径不包含用户数据或应用工作区。 */
export function bundledLibrarySandboxArgs(nodeExecutable = process.execPath, environment: NodeJS.ProcessEnv = process.env): string[] {
  const directory = bundledLibraryDirectory(nodeExecutable, environment);
  return directory ? ['--ro-bind', directory, '/runtime-libs', '--setenv', 'LD_LIBRARY_PATH', '/runtime-libs'] : [];
}
