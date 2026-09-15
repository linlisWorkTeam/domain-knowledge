/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：核对服务器授权产物根与源码目录的真实边界，不从历史收据扩展删除权限。
 */
import { lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
function canonical(path: string): string {
  if (!isAbsolute(path) || /[\0\r\n]/.test(path)) throw new Error('DELETION_DIRECTORY_INVALID');
  const absolute = resolve(path); let existing = absolute;
  while (true) {
    try { lstatSync(existing); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || dirname(existing) === existing) throw error;
      existing = dirname(existing);
    }
  }
  return resolve(realpathSync(existing), relative(existing, absolute));
}
function inside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return !path || !isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`);
}
/** 不创建目录；每次修改前重验，已删除/尚不存在的源码目录仍按最近真实父目录保护。 */
export function assertDeletionDirectoryScope(input: { roots: string[]; allowedRoots: string[]; sourceRoots: string[] }): void {
  if (!input.roots.length || !input.allowedRoots.length || !input.sourceRoots.length) throw new Error('DELETION_DIRECTORY_SCOPE_REQUIRED');
  const allowed = input.allowedRoots.map(canonical), sources = input.sourceRoots.map(canonical);
  const roots = input.roots.map(canonical);
  for (const root of roots) {
    if (!allowed.some(parent => inside(parent, root))) throw new Error('DELETION_DIRECTORY_UNAUTHORIZED');
    if (sources.some(source => inside(source, root) || inside(root, source))) throw new Error('DELETION_SOURCE_DIRECTORY_OVERLAP');
  }
  for (let i = 0; i < roots.length; i++) for (let j = i + 1; j < roots.length; j++) {
    if (inside(roots[i]!, roots[j]!) || inside(roots[j]!, roots[i]!)) throw new Error('DELETION_OUTPUT_DIRECTORY_OVERLAP');
  }
}
