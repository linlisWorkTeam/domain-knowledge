/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：为原生命令创建独立cgroup，限制整棵进程树并确认清理。
 */
import { randomUUID } from 'node:crypto';
import { accessSync, constants, mkdirSync, readFileSync, realpathSync, rmdirSync, statfsSync, writeFileSync } from 'node:fs';
import { join, isAbsolute, delimiter } from 'node:path';

export class CommandResourceGroup {
  readonly directory: string;
  readonly membershipDirectory: string;
  constructor(memoryBytes: number, processes: number) {
    if (!Number.isSafeInteger(memoryBytes) || memoryBytes < 16_777_216 || !Number.isSafeInteger(processes) || processes < 8 || processes > 128) throw new Error('PROJECT_RESOURCE_LIMIT_INVALID');
    let directory: string | undefined;
    let created = false;
    try {
      const parent = realpathSync(process.env.WP_EVALUATION_CGROUP_ROOT ?? '/sys/fs/cgroup');
      if (statfsSync(parent).type !== 0x63677270) throw new Error('CGROUP_V2_REQUIRED');
      directory = join(parent, `knowledge-workbench-${randomUUID()}`);
      mkdirSync(directory); created = true;
      writeFileSync(join(directory, 'memory.max'), String(memoryBytes));
      writeFileSync(join(directory, 'memory.swap.max'), '0');
      writeFileSync(join(directory, 'memory.oom.group'), '1');
      writeFileSync(join(directory, 'pids.max'), String(processes));
      // 上限位于命名空间根之外；被测程序即使挂载自己的cgroup视图也不能提高父级配额。
      writeFileSync(join(directory, 'cgroup.max.descendants'), '1');
      writeFileSync(join(directory, 'cgroup.max.depth'), '1');
      writeFileSync(join(directory, 'cgroup.subtree_control'), '+memory +pids');
      this.membershipDirectory = join(directory, 'command');
      mkdirSync(this.membershipDirectory);
      accessSync(join(directory, 'cgroup.kill'), constants.W_OK);
      this.directory = directory;
    } catch {
      if (created && directory) { try { rmdirSync(join(directory, 'command')); } catch {} try { rmdirSync(directory); } catch {} }
      throw new Error('PROJECT_RESOURCE_ISOLATION_UNAVAILABLE');
    }
  }
  kill(): void { writeFileSync(join(this.directory, 'cgroup.kill'), '1'); }
  async close(): Promise<void> {
    this.kill();
    for (let attempt = 0; attempt < 500; attempt++) {
      if (/^populated 0$/m.test(readFileSync(join(this.directory, 'cgroup.events'), 'utf8'))) { rmdirSync(this.membershipDirectory); rmdirSync(this.directory); return; }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('PROJECT_ISOLATION_CLEANUP_FAILED');
  }
}

/** Node 24受信启动器先加入cgroup再原位exec，源码从未在资源组之外执行。 */
export const resourceLauncher = `import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
writeFileSync(join(process.argv[1], 'cgroup.procs'), String(process.pid));
process.execve(process.argv[2], process.argv.slice(2), process.env);`;

export function executablePath(command: string): string {
  const candidates = isAbsolute(command) ? [command] : (process.env.PATH ?? '').split(delimiter).filter(Boolean).map((directory) => join(directory, command));
  for (const candidate of candidates) { try { accessSync(candidate, constants.X_OK); return realpathSync(candidate); } catch {} }
  throw new Error('PROJECT_ISOLATION_UNAVAILABLE: executable missing');
}
