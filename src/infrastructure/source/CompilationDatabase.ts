/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：只读解析编译数据库为可审核的声明式构建候选，不执行命令。
 */
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { buildConstraints } from '../../domain/workbench/WorkbenchProject.ts';
import type { RepositoryBuildCandidate } from '../../domain/sourceScan/RepositoryAnalysis.ts';

function words(command: string): string[] {
  if (command.length > 65536 || /[$`;|&<>\n\r]/.test(command)) throw new Error('命令包含未支持的展开或操作符');
  const result: string[] = []; let current = ''; let quoted = false; let started = false;
  for (let i = 0; i < command.length; i++) {
    const c = command[i]!;
    if (c === '"') { quoted = !quoted; started = true; }
    else if (c === '\\') { if (++i >= command.length) throw new Error('命令转义不完整'); current += command[i]; started = true; }
    else if (/\s/.test(c) && !quoted) { if (started) result.push(current); current = ''; started = false; }
    else { current += c; started = true; }
  }
  if (quoted) throw new Error('命令引号未闭合');
  if (started) result.push(current);
  return result;
}
export function compilationCandidates(content: string, origin: string, root: string): RepositoryBuildCandidate[] {
  let rows: unknown;
  try { rows = JSON.parse(content); } catch { return [{ origin, record: 0, sourcePath: null, build: {}, issues: ['编译数据库不是合法 JSON'] }]; }
  if (!Array.isArray(rows) || rows.length > 1000) return [{ origin, record: 0, sourcePath: null, build: {}, issues: ['编译数据库必须是最多 1000 条记录的数组'] }];
  return rows.map((row, index) => {
    const item: RepositoryBuildCandidate = { origin, record: index + 1, sourcePath: null, build: {}, issues: [] };
    try {
      if (!row || typeof row !== 'object' || typeof row.directory !== 'string' || typeof row.file !== 'string') throw new Error('缺少工作目录或源码路径');
      const directory = resolve(root, dirname(origin), row.directory);
      const local = (path: string) => {
        const value = relative(root, resolve(directory, path));
        if (isAbsolute(value) || value === '..' || value.startsWith('../')) throw new Error(`仓库外路径：${path}`);
        return value || '.';
      };
      item.sourcePath = local(row.file);
      const args = row.arguments !== undefined ? row.arguments : typeof row.command === 'string' ? words(row.command) : null;
      if (!Array.isArray(args) || !args.length || args.length > 1024 || args.some(value => typeof value !== 'string' || value.length > 4096 || value.includes('\0'))) throw new Error('编译参数列表无效');
      const compiler = basename(args[0]); const cpp = /\.(?:cpp|cc|cxx)$/.test(item.sourcePath);
      const build: Record<string, unknown> = { includeDirectories: [], definitions: [] };
      if (cpp ? ['g++', 'clang++'].includes(compiler) : ['gcc', 'clang'].includes(compiler)) build[cpp ? 'cppCompiler' : 'cCompiler'] = compiler;
      else item.issues.push(`编译器尚未支持：${compiler}`);
      for (let i = 1; i < args.length; i++) {
        const arg: string = args[i];
        const next = () => { if (i + 1 >= args.length) throw new Error(`参数缺少值：${arg}`); return args[++i] as string; };
        try {
          if (arg === '-I' || arg.startsWith('-I')) (build.includeDirectories as string[]).push(local(arg === '-I' ? next() : arg.slice(2)));
          else if (arg === '-D' || arg.startsWith('-D')) (build.definitions as string[]).push(arg === '-D' ? next() : arg.slice(2));
          else if (arg.startsWith('-std=')) build[cpp ? 'cppStandard' : 'cStandard'] = arg.slice(5);
          else if (['-o', '-MF', '-MT', '-MQ'].includes(arg)) next();
          else if (['-c', '-g', '-MMD', '-MD', '-MP'].includes(arg) || /^-O[0-3sg]$/.test(arg) || /^-W(?:all|extra|error|pedantic)$/.test(arg)) { /* output/diagnostic flags do not enter declarative constraints */ }
          else if (!arg.startsWith('-') && local(arg) === item.sourcePath) { /* translation unit identity */ }
          else item.issues.push(`参数尚未支持：${arg}`);
        } catch (error) { item.issues.push((error as Error).message); }
      }
      try {
        const validated = buildConstraints(build);
        for (const key of Object.keys(build) as Array<keyof typeof validated>) Object.assign(item.build, { [key]: validated[key] });
      } catch { item.issues.push('提取的标准、目录或定义超出当前构建约束，请手动调整'); }
    } catch (error) { item.issues.push((error as Error).message); }
    return item;
  });
}
