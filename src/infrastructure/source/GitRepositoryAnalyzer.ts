/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：只读固定 Git 对象及本机工具，形成有资源边界的仓库分析清单。
 */
import { spawn } from 'node:child_process';
import { realpathSync, readFileSync, statfsSync } from 'node:fs';
import { freemem } from 'node:os';
import { relative, isAbsolute, basename, extname } from 'node:path';
import { groupRepositoryModules } from '../../domain/sourceScan/RepositoryAnalysis.ts';
import { compilationCandidates } from './CompilationDatabase.ts';
import { sha256 } from '../../domain/Domain.ts';
import type { RepositoryAnalyzer, RepositorySourceReader, RepositoryAnalysis, RepositoryFile, SourceLanguage } from '../../application/ports/RepositoryAnalysisPorts.ts';

/** 只启动明确的只读命令，限制时间和输出；取消始终结束整个进程组。 */
export async function readCommand(command: string, args: string[], directory: string, signal?: AbortSignal, maximum = 2_097_152): Promise<string> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: directory, shell: false, detached: true,
      env: { PATH: process.env.PATH, LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH, LANG: 'C', LC_ALL: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_OPTIONAL_LOCKS: '0', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'] });
    let output = Buffer.alloc(0); let failure: Error | null = null;
    const kill = () => { if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} } };
    const abort = () => { failure = new Error('REPOSITORY_ANALYSIS_CANCELLED'); kill(); };
    const timer = setTimeout(() => { failure = new Error('REPOSITORY_ANALYSIS_TIMEOUT'); kill(); }, 10_000);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    child.stdout.on('data', (chunk: Buffer) => {
      if (output.length + chunk.length > maximum) { failure = new Error('REPOSITORY_MANIFEST_TOO_LARGE'); kill(); }
      else output = Buffer.concat([output, chunk]);
    });
    // 错误消息可能携带机器路径或远程凭据，不将原始 stderr 回填接口。
    child.stderr.resume();
    child.once('error', () => { failure ??= new Error('REPOSITORY_COMMAND_UNAVAILABLE'); });
    child.once('close', (code) => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error('REPOSITORY_REVISION_UNAVAILABLE'));
      else { try { resolve(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(output)); } catch { reject(new Error('REPOSITORY_ENCODING_UNSUPPORTED')); } }
    });
  });
}
export function sourceLanguage(path: string, cpp: boolean): SourceLanguage {
  const extension = extname(path).toLowerCase();
  if (['.cpp', '.cc', '.cxx', '.hpp', '.hh', '.hxx'].includes(extension)) return 'cpp';
  if (extension === '.c') return 'c';
  if (extension === '.h') return cpp ? 'cpp' : 'c';
  if (['.ts', '.tsx'].includes(extension)) return 'typescript';
  return 'unsupported';
}
export const sourceExtension = /\.(?:c|h|cpp|cc|cxx|hpp|hh|hxx|ts|tsx|js|mjs|rs|go|py|java|cs|swift|kt|dart|rb|lua|php|sh|m|mm|s|asm)$/i;
export const testPath = /(?:^|\/)(?:tests?|__tests__|specs?)(?:\/|$)|(?:^|[/_.-])(?:test|spec)(?:[_.-]|$)|(?:[_.-])test\.[^.]+$/i;
export function buildSystem(path: string): string | null {
  const name = basename(path);
  if (name === 'compile_commands.json') return 'compilation-database';
  if (name === 'CMakeLists.txt' || name.endsWith('.cmake')) return 'cmake';
  if (/^(?:GNUmakefile|Makefile|makefile)$/.test(name)) return 'make';
  if (name === 'package.json' || name === 'tsconfig.json') return 'node';
  return null;
}
/** 分析只覆盖固定提交；脏工作区不被悄悄并入。测试与示例保留清单但不成为默认生成输入。 */
export class GitRepositoryAnalyzer implements RepositoryAnalyzer, RepositorySourceReader {
  constructor(privateRoots: string[], resourceDirectory: string) {
    this.roots = privateRoots.map((root) => realpathSync(root)); this.resourceDirectory = resourceDirectory;
  }
  private readonly roots: string[];
  private readonly resourceDirectory: string;
  async readFiles(directory: string, commit: string, paths: string[], signal?: AbortSignal) {
    if (!/^[a-f0-9]{40,64}$/.test(commit) || !Array.isArray(paths) || !paths.length || paths.length > 2000) throw new Error('REPOSITORY_SOURCE_SELECTION_INVALID');
    const report = await this.analyze(directory, commit, signal);
    const selected = [...new Set(paths)].sort().map((path) => report.files.find((file) => file.path === path));
    if (selected.some((file) => !file || !['source', 'build'].includes(file.kind))) throw new Error('REPOSITORY_SOURCE_SELECTION_INVALID');
    const files = selected as RepositoryFile[];
    if (files.some((file) => file.size > 1_048_576) || files.reduce((sum, file) => sum + file.size, 0) > 8_388_608) throw new Error('REPOSITORY_SOURCE_TOO_LARGE');
    const result: Array<{ path: string; objectId: string; content: string }> = [];
    for (const file of files) {
      const content = await readCommand('git', ['--no-replace-objects', 'cat-file', 'blob', file.objectId], report.directory, signal, 1_048_576);
      if (Buffer.byteLength(content) !== file.size || content.includes('\0')) throw new Error('REPOSITORY_SOURCE_CONTENT_INVALID');
      result.push({ path: file.path, objectId: file.objectId, content });
    }
    return result;
  }
  async analyze(directory: string, revision = 'HEAD', signal?: AbortSignal): Promise<RepositoryAnalysis> {
    let root: string;
    try { root = realpathSync(directory); } catch { throw new Error('SOURCE_DIRECTORY_INVALID'); }
    if (!this.roots.some((allowed) => { const path = relative(allowed, root); return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith('../')); })) throw new Error('SOURCE_ACCESS_DENIED');
    if (typeof revision !== 'string' || !revision || revision.length > 256 || revision.includes('\0')) throw new Error('REPOSITORY_REVISION_INVALID');
    const disk = statfsSync(this.resourceDirectory);
    const availableDiskBytes = disk.bavail * disk.bsize;
    let availableMemoryBytes = freemem();
    try { availableMemoryBytes = Number(/^MemAvailable:\s+(\d+)\s+kB$/m.exec(readFileSync('/proc/meminfo', 'utf8'))?.[1] ?? availableMemoryBytes / 1024) * 1024; } catch {}
    if (availableDiskBytes < 16 * 1024 * 1024 || availableMemoryBytes < 64 * 1024 * 1024) throw new Error('WORKBENCH_RESOURCE_INSUFFICIENT');
    const top = (await readCommand('git', ['rev-parse', '--show-toplevel'], root, signal)).trim();
    if (realpathSync(top) !== root) throw new Error('REPOSITORY_ROOT_REQUIRED');
    const commit = (await readCommand('git', ['--no-replace-objects', 'rev-parse', '--verify', '--end-of-options', `${revision}^{commit}`], root, signal)).trim();
    if (!/^[a-f0-9]{40,64}$/.test(commit)) throw new Error('REPOSITORY_REVISION_INVALID');
    const tree = await readCommand('git', ['--no-replace-objects', 'ls-tree', '-r', '-l', '-z', commit], root, signal);
    const entries = tree.split('\0').filter(Boolean).map((record) => {
      const match = /^(\d+) (blob|tree|commit) ([a-f0-9]+)\s+(-|\d+)\t([\s\S]+)$/.exec(record);
      if (!match) throw new Error('REPOSITORY_MANIFEST_INVALID');
      return { mode: match[1], type: match[2], objectId: match[3]!, size: Number(match[4]), path: match[5]! };
    });
    if (entries.length > 20_000) throw new Error('REPOSITORY_MANIFEST_TOO_LARGE');
    const cpp = entries.some((entry) => /\.(cpp|cc|cxx|hpp)$/.test(entry.path) && !testPath.test(entry.path) && !/(?:^|\/)(?:examples?|fixtures?)(?:\/|$)/i.test(entry.path));
    const files: RepositoryFile[] = [];
    const warnings: string[] = [];
    for (const entry of entries) {
      if (entry.type === 'commit') { warnings.push(`未展开子模块：${entry.path}`); continue; }
      if (!sourceExtension.test(entry.path) && !buildSystem(entry.path)) continue;
      if (entry.mode === '120000') { warnings.push(`未跟随符号链接：${entry.path}`); continue; }
      files.push({ path: entry.path, objectId: entry.objectId, size: entry.size,
        language: sourceLanguage(entry.path, cpp), kind: buildSystem(entry.path) ? 'build' : /(?:^|\/)(?:fixtures?|examples?)(?:\/|$)/i.test(entry.path) ? 'example' : testPath.test(entry.path) ? 'test' : 'source' });
    }
    const sources = files.filter((file) => file.kind === 'source');
    const modules = groupRepositoryModules(files);
    const tools: RepositoryAnalysis['tools'] = [];
    for (const name of ['gcc', 'g++', 'clang', 'clang++', 'make', 'cmake', 'bwrap', 'prlimit']) {
      signal?.throwIfAborted();
      try { tools.push({ name, available: true, version: (await readCommand(name, ['--version'], root, signal, 16_384)).split('\n')[0]!.slice(0, 256) }); }
      catch (error) { if (signal?.aborted) throw error; tools.push({ name, available: false, version: null }); }
    }
    const buildSystems = [...new Set(files.map((file) => buildSystem(file.path)).filter((name): name is string => !!name))];
    const buildCandidates: ReturnType<typeof compilationCandidates> = [];
    for (const file of files.filter(file => basename(file.path) === 'compile_commands.json')) {
      if (file.size > 1_048_576 || buildCandidates.length >= 1000) { warnings.push(`编译数据库超出分析限额：${file.path}`); continue; }
      const content = await readCommand('git', ['--no-replace-objects', 'cat-file', 'blob', file.objectId], root, signal, 1_048_576);
      const candidates = compilationCandidates(content, file.path, root);
      for (const item of candidates) {
        if (item.sourcePath && !files.some(source => source.path === item.sourcePath && source.kind === 'source')) item.issues.push('编译单元不在当前固定源码范围内');
        if (buildCandidates.length < 1000) buildCandidates.push(item);
        else { warnings.push('编译候选超过 1000 条，剩余记录未解析。'); break; }
      }
    }
    if (buildSystems.includes('cmake') && !tools.find((tool) => tool.name === 'cmake')?.available) warnings.push('检测到 CMake 配置，但服务器没有可用的 cmake。');
    if (!sources.length) warnings.push('固定提交中没有可分析的源码。');
    return { schemaVersion: 'repository-analysis-v1', repositoryId: `repository-${sha256(root).slice(0, 32)}`, directory: root,
      requestedRevision: revision, commit, sourceDigest: sha256(JSON.stringify(files)), files, modules, buildSystems, tools, ...(buildCandidates.length ? { buildCandidates } : {}),
      resources: { availableMemoryBytes, availableDiskBytes }, warnings };
  }
}
