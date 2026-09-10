/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：用已有原生编译器隔离提取声明、构建及运行，原始结果不充当可信门禁。
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statfsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir, freemem } from 'node:os';
import type { NativeLanguageToolchain, NativeToolchainInput, ToolchainFile } from '../../../application/ports/LanguageToolchainPorts.ts';
import { buildConstraints } from '../../../domain/services/workbench/WorkbenchProject.ts';
import { modelProcessLane } from '../../agentAdapters/ModelProcessLane.ts';
import { captureIsolated } from '../../runtime/IsolatedCommand.ts';
import { clangDeclarations } from './ClangDeclarations.ts';

const memoryBytes = 536_870_912;
function safePath(path: string): boolean {
  return typeof path === 'string' && path.length > 0 && path.length <= 1024 && !path.startsWith('/')
    && !path.includes('\\') && !/[\0-\x1f]/.test(path) && path.split('/').every((part) => part && part !== '.' && part !== '..' && part !== '.git');
}
function validateFiles(files: ToolchainFile[]): void {
  if (!Array.isArray(files) || !files.length || files.length > 2000
    || files.some((file) => !safePath(file.path) || typeof file.content !== 'string' || Buffer.byteLength(file.content) > 1_048_576)
    || files.reduce((sum, file) => sum + Buffer.byteLength(file.content), 0) > 8_388_608
    || new Set(files.map((file) => file.path)).size !== files.length) throw new Error('NATIVE_SOURCE_INVALID');
}
function preflight(): void {
  const disk = statfsSync(tmpdir());
  let memory = freemem();
  try { memory = Number(/^MemAvailable:\s+(\d+)\s+kB$/m.exec(readFileSync('/proc/meminfo', 'utf8'))?.[1] ?? memory / 1024) * 1024; } catch {}
  if (disk.bavail * disk.bsize < 33_554_432 || memory < memoryBytes + 67_108_864) throw new Error('WORKBENCH_RESOURCE_INSUFFICIENT');
}
export class NativeToolchain implements NativeLanguageToolchain {
  private async workspace<T>(input: NativeToolchainInput, work: (directory: string, flags: string[]) => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!['c', 'cpp'].includes(input.language)) throw new Error('NATIVE_LANGUAGE_UNSUPPORTED');
    validateFiles(input.files); const build = buildConstraints(input.build);
    return modelProcessLane.execute(async () => {
      signal?.throwIfAborted(); preflight();
      const directory = mkdtempSync(join(tmpdir(), 'workbench-native-'));
      try {
        mkdirSync(join(directory, 'source')); mkdirSync(join(directory, 'build'));
        for (const file of input.files) {
          signal?.throwIfAborted(); const path = join(directory, 'source', file.path);
          mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, file.content, { flag: 'wx', mode: 0o600 });
        }
        const flags = [`-std=${input.language === 'c' ? build.cStandard : build.cppStandard}`, '-I/workspace/source',
          ...build.includeDirectories.map((path) => `-I/workspace/source/${path}`), ...build.definitions.map((value) => `-D${value}`)];
        return await work(directory, flags);
      } finally { rmSync(directory, { recursive: true, force: true }); }
    }, signal);
  }
  async compileAndRun(input: NativeToolchainInput & { entryPaths: string[]; arguments?: string[] }, signal?: AbortSignal) {
    if (!Array.isArray(input.entryPaths) || !input.entryPaths.length || input.entryPaths.length > 64
      || input.entryPaths.some((path) => !safePath(path) || !input.files.some((file) => file.path === path))) throw new Error('NATIVE_ENTRY_INVALID');
    const args = input.arguments ?? [];
    if (!Array.isArray(args) || args.length > 100 || args.some((value) => typeof value !== 'string' || value.length > 65_536 || value.includes('\0'))) throw new Error('NATIVE_ARGUMENTS_INVALID');
    const build = buildConstraints(input.build);
    return this.workspace(input, async (directory, flags) => {
      const compiled = await captureIsolated({ workspace: directory, buildOutput: join(directory, 'build'),
        command: [input.language === 'c' ? build.cCompiler : build.cppCompiler, ...flags,
          ...(input.sanitizers ? ['-fsanitize=address,undefined', '-fno-sanitize-recover=all', '-fno-omit-frame-pointer'] : []),
          ...input.entryPaths.map((path) => `/workspace/source/${path}`), '-o', '/workspace/build/program'],
        timeoutMs: 30_000, memoryBytes, processLimit: 32, fileSizeBytes: 16_777_216 }, signal);
      if (compiled.exitCode !== 0 || compiled.timedOut || compiled.outputLimitExceeded) return { build: compiled, execution: null };
      const execution = await captureIsolated({ workspace: directory,
        command: [...(input.sanitizers ? ['env', 'ASAN_OPTIONS=detect_leaks=0:allocator_may_return_null=1'] : []), '/workspace/build/program', ...args],
        timeoutMs: 3000, memoryBytes: 134_217_728, processLimit: 16,
        ...(input.sanitizers ? { addressSpaceBytes: 140737488355328 } : {}),
      }, signal);
      return { build: compiled, execution };
    }, signal);
  }
  async publicInterface(input: NativeToolchainInput & { entryPath: string; symbols?: string[]; astFilter?: string }, signal?: AbortSignal) {
    if (!safePath(input.entryPath) || !input.files.some((file) => file.path === input.entryPath)) throw new Error('NATIVE_ENTRY_INVALID');
    if (input.astFilter !== undefined && !/^[A-Za-z_][\w]*(?:::[A-Za-z_][\w]*)*$/.test(input.astFilter)) throw new Error('NATIVE_INTERFACE_SYMBOL_INVALID');
    return this.workspace(input, async (directory, flags) => {
      const result = await captureIsolated({ workspace: directory,
        command: ['clang', ...flags, '-x', input.language === 'c' ? 'c' : 'c++', '-fsyntax-only', '-Xclang', '-ast-dump=json',
          ...(input.astFilter ? ['-Xclang', `-ast-dump-filter=${input.astFilter}`] : []), `/workspace/source/${input.entryPath}`],
        timeoutMs: 30_000, memoryBytes, processLimit: 32, outputBytes: 8_388_608 }, signal);
      if (result.exitCode !== 0 || result.timedOut || result.outputLimitExceeded) throw new Error('NATIVE_INTERFACE_COMPILE_FAILED', {
        cause: { exitCode: result.exitCode, timedOut: result.timedOut, outputLimitExceeded: result.outputLimitExceeded, stderr: result.stderr },
      });
      let ast: unknown; try { ast = JSON.parse(result.stdout); } catch { throw new Error('NATIVE_AST_AMBIGUOUS'); }
      return { schemaVersion: 'native-interface-v1' as const, language: input.language, sourcePath: input.entryPath,
        astFilter: input.astFilter ?? null, declarations: clangDeclarations(ast, input.symbols, `/workspace/source/${input.entryPath}`, input.astFilter) };
    }, signal);
  }
}
