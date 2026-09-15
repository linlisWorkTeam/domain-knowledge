/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：从编译器诊断中提取明确缺失依赖，不推测安装包或运行安装命令。
 */
export interface NativeBuildIssue { kind: 'MISSING_HEADER' | 'MISSING_LIBRARY'; name: string }
export function nativeBuildIssues(stderr: string): NativeBuildIssue[] {
  const issues: NativeBuildIssue[] = []; const seen = new Set<string>();
  for (const line of stderr.slice(0, 131072).split('\n')) {
    const clang = /fatal error:\s*['‘]([^'’\r\n]+)['’]\s+file not found/.exec(line);
    const gcc = /fatal error:\s*([^:\r\n]+):\s*No such file or directory/.exec(line);
    const library = /cannot find\s+(-l[^\s:]+)(?::|\s|$)/.exec(line);
    const name = (clang?.[1] ?? gcc?.[1] ?? library?.[1])?.trim();
    if (!name || name.length > 256 || /[\x00-\x1f\x7f]/.test(name)) continue;
    const kind = library ? 'MISSING_LIBRARY' : 'MISSING_HEADER'; const key = `${kind}:${name}`;
    if (!seen.has(key)) { seen.add(key); issues.push({ kind, name }); }
    if (issues.length === 20) break;
  }
  return issues;
}
