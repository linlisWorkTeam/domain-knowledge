/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：按编译器、系统头文件、运行库和评测器正文冻结可复用工具链身份。
 */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { readdir, realpath, stat } from 'node:fs/promises';
import { dirname, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildConstraints, type BuildConstraints } from '../../../domain/services/workbench/WorkbenchProject.ts';
import { sha256 } from '../../../domain/Domain.ts';
import { modelProcessLane } from '../../agentAdapters/ModelProcessLane.ts';
import { captureIsolated } from '../../runtime/IsolatedCommand.ts';
import type { NativeFingerprintRecord } from '../../../application/ports/NativeEvaluationPorts.ts';
export type { NativeFingerprintRecord } from '../../../application/ports/NativeEvaluationPorts.ts';

async function query(command: string, args: string[], signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted(); const workspace = mkdtempSync(join(tmpdir(), 'workbench-toolchain-'));
  try {
    const result = await captureIsolated({ workspace, command: [command, ...args.map((arg) => arg === process.execPath ? '/runtime-node' : arg)],
      timeoutMs: 10000, memoryBytes: 134217728, processLimit: 16, outputBytes: 1048576 }, signal);
    if (result.exitCode !== 0 || result.timedOut || result.outputLimitExceeded) throw new Error('TOOLCHAIN_FINGERPRINT_QUERY_FAILED', { cause: result });
    return result.stdout.trim();
  } finally { rmSync(workspace, { recursive: true, force: true }); }
}
export async function nativeFingerprint(language: 'c' | 'cpp', constraints: BuildConstraints, signal?: AbortSignal): Promise<NativeFingerprintRecord> {
  const build = buildConstraints(constraints);
  return modelProcessLane.execute(async () => {
    const compiler = `/usr/bin/${language === 'c' ? build.cCompiler : build.cppCompiler}`;
    const binaries = new Set([compiler, '/usr/bin/as', '/usr/bin/ld', '/usr/bin/bwrap', '/usr/bin/prlimit', process.execPath]);
    const roots = new Set(['/usr/include']);
    if (compiler.includes('clang')) roots.add(await query(compiler, ['-print-resource-dir'], signal));
    else {
      roots.add(dirname(await query(compiler, ['-print-libgcc-file-name'], signal)));
      for (const name of [language === 'c' ? 'cc1' : 'cc1plus', 'collect2']) binaries.add(await query(compiler, [`-print-prog-name=${name}`], signal));
    }
    for (const name of ['libasan.so', 'libubsan.so', 'libstdc++.so.6', 'libc.so.6', 'libm.so.6', 'libgcc_s.so.1']) {
      const path = await query(compiler, [`-print-file-name=${name}`], signal);
      if (isAbsolute(path) && existsSync(path)) binaries.add(path);
    }
    for (const path of [...binaries]) {
      if (!isAbsolute(path) || !existsSync(path)) throw new Error('TOOLCHAIN_FINGERPRINT_UNAVAILABLE');
      const libraries = await query('/usr/bin/ldd', [path], signal);
      for (const line of libraries.split('\n')) { const library = /(?:=>\s*)?(\/[^\s(]+)/.exec(line)?.[1]; if (library) binaries.add(library); }
    }
    const engine = ['NativeCaseHarness.ts', 'NativeCaseExecutor.ts', 'NativeToolchain.ts', 'NativeFingerprint.ts',
      '../../../domain/services/evaluation/NativeBehaviorSuite.ts', '../../../domain/services/evaluation/NativeTestCache.ts', '../../../domain/services/evaluation/NativeTrustedGates.ts',
      '../../../domain/services/evaluation/NativeBehaviorSchema.ts', '../../../domain/services/knowledge/KnowledgeSections.ts',
      '../../../application/services/NativeSuiteEvaluation.ts', '../../runtime/IsolatedCommand.ts', '../../runtime/CommandResourceGroup.ts'];
    for (const path of engine) binaries.add(fileURLToPath(new URL(path, import.meta.url)));
    const files: NativeFingerprintRecord['files'] = []; const visited = new Set<string>(); let bytes = 0; const deadline = Date.now() + 120000;
    const visit = async (path: string): Promise<void> => {
      signal?.throwIfAborted(); if (Date.now() > deadline || files.length > 40000 || bytes > 4294967296) throw new Error('TOOLCHAIN_FINGERPRINT_LIMIT');
      const resolved = await realpath(path); const before = await stat(resolved, { bigint: true });
      if (before.isDirectory()) {
        if (visited.has(resolved)) return; visited.add(resolved);
        for (const name of (await readdir(path)).sort()) await visit(join(path, name));
      } else if (before.isFile()) {
        const hash = createHash('sha256'); const stream = createReadStream(resolved, { highWaterMark: 262144, signal });
        for await (const chunk of stream) { bytes += chunk.length; hash.update(chunk); }
        const after = await stat(resolved, { bigint: true });
        if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ino !== after.ino) throw new Error('TOOLCHAIN_FINGERPRINT_CHANGED');
        files.push({ path, resolved, sha256: hash.digest('hex') });
      } else throw new Error('TOOLCHAIN_FINGERPRINT_UNAVAILABLE');
    };
    for (const root of [...roots, ...binaries].sort()) await visit(root);
    files.sort((a, b) => a.path.localeCompare(b.path));
    const record = { schemaVersion: 'native-toolchain-v1' as const, language, build, architecture: process.arch, files };
    // 清单按固定字段顺序构造并按路径排序；它是CAS工件，不是受256KiB限制的阶段输入。
    return { ...record, digest: sha256(JSON.stringify(record)) };
  }, signal);
}
