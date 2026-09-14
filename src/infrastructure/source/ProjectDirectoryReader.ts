/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：以内容寻址冻结本地目录，保留 Git 固定版本读取和目录访问边界。
 */
import { constants, readFileSync, realpathSync, statfsSync } from 'node:fs';
import { lstat, mkdir, open, readdir, readFile, readlink, realpath, writeFile, rename, rm } from 'node:fs/promises';
import { basename, isAbsolute, join, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { freemem } from 'node:os';
import { sha256, type ArtifactRef } from '../../domain/Domain.ts';
import { groupRepositoryModules } from '../../domain/sourceScan/RepositoryAnalysis.ts';
import type { RepositoryAnalysis, RepositoryFile, RepositoryAnalyzer, RepositorySourceReader } from '../../application/ports/RepositoryAnalysisPorts.ts';
import type { ArtifactStore } from '../../application/ports/ApplicationPorts.ts';
import { GitRepositoryAnalyzer, buildSystem, readCommand, sourceExtension, sourceLanguage, testPath } from './GitRepositoryAnalyzer.ts';
import { compilationCandidates } from './CompilationDatabase.ts';
interface Entry { path: string; kind: 'file' | 'symlink'; ref: ArtifactRef }
interface Snapshot { schemaVersion: 'directory-snapshot-v1'; directory: string; entries: Entry[]; excluded: string[] }
const within = (root: string, path: string) => { const value = relative(root, path); return value === '' || (!isAbsolute(value) && value !== '..' && !value.startsWith('../')); };
export class ProjectDirectoryReader implements RepositoryAnalyzer, RepositorySourceReader {
  private readonly git: GitRepositoryAnalyzer;
  private readonly roots: string[];
  private readonly snapshots: string;
  private readonly runtime: string;
  private readonly artifacts: ArtifactStore;
  constructor(roots: string[], runtime: string, artifacts: ArtifactStore) {
    this.roots = roots.map(path => realpathSync(path)); this.runtime = realpathSync(runtime);
    this.snapshots = join(this.runtime, 'directory-snapshots'); this.artifacts = artifacts;
    this.git = new GitRepositoryAnalyzer(roots, runtime);
  }
  private root(directory: string) {
    let root: string;
    try { root = realpathSync(directory); } catch { throw new Error('SOURCE_DIRECTORY_INVALID'); }
    if (!this.roots.some(allowed => within(allowed, root))) throw new Error('SOURCE_ACCESS_DENIED');
    return root;
  }
  private resources() {
    const disk = statfsSync(this.runtime); let memory = freemem();
    try { memory = Number(/^MemAvailable:\s+(\d+)\s+kB$/m.exec(readFileSync('/proc/meminfo', 'utf8'))?.[1] ?? memory / 1024) * 1024; } catch {}
    const result = { availableMemoryBytes: memory, availableDiskBytes: disk.bavail * disk.bsize };
    if (memory < 128 * 1024 * 1024 || result.availableDiskBytes < 128 * 1024 * 1024) throw new Error('WORKBENCH_RESOURCE_INSUFFICIENT');
    return result;
  }
  private async capture(root: string, signal?: AbortSignal): Promise<{ snapshot: Snapshot; commit: string }> {
    if (within(root, this.runtime)) throw new Error('DIRECTORY_CONTAINS_RUNTIME');
    this.resources();
    const entries: Entry[] = [], excluded: string[] = [];
    const observations: Array<{ path: string; signature: string }> = [];
    const directories: Array<{ path: string; names: string[] }> = [];
    let total = 0, count = 0;
    const deadline = Date.now() + 60000;
    const signature = (value: Awaited<ReturnType<typeof lstat>>) => `${value.dev}:${value.ino}:${value.mode}:${value.size}:${value.mtimeMs}:${value.ctimeMs}`;
    const walk = async (directory: string, localDirectory = '') => {
      signal?.throwIfAborted(); if (Date.now() > deadline) throw new Error('DIRECTORY_SNAPSHOT_TIMEOUT');
      const directoryHandle = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      try {
      const anchored = `/proc/self/fd/${directoryHandle.fd}`;
      if (!within(root, await realpath(anchored))) throw new Error('SOURCE_ACCESS_DENIED');
      const names = (await readdir(anchored)).sort(); directories.push({ path: join(root, localDirectory), names });
      for (const name of names) {
        signal?.throwIfAborted(); if (Date.now() > deadline) throw new Error('DIRECTORY_SNAPSHOT_TIMEOUT');
        if (!within(root, await realpath(anchored))) throw new Error('SOURCE_ACCESS_DENIED');
        if (++count > 20000) throw new Error('REPOSITORY_MANIFEST_TOO_LARGE');
        const path = join(anchored, name), local = localDirectory ? `${localDirectory}/${name}` : name;
        if (name === '.git') { excluded.push(local); continue; }
        const before = await lstat(path);
        observations.push({ path: join(root, local), signature: signature(before) });
        if (before.isDirectory()) {
          if (!within(root, await realpath(path))) throw new Error('SOURCE_ACCESS_DENIED');
          await walk(path, local); continue;
        }
        if (!before.isFile() && !before.isSymbolicLink()) throw new Error('DIRECTORY_SPECIAL_FILE_UNSUPPORTED');
        if (before.size > 8_388_608 || (total += before.size) > 67_108_864) throw new Error('DIRECTORY_SNAPSHOT_TOO_LARGE');
        let bytes: Buffer;
        if (before.isSymbolicLink()) bytes = Buffer.from(await readlink(path));
        else {
          const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
          try {
            // 验证已打开描述符的实际目标，父目录被换成链接也不能读取边界外文件。
            if (!within(root, await realpath(`/proc/self/fd/${handle.fd}`))) throw new Error('SOURCE_ACCESS_DENIED');
            if (signature(await handle.stat()) !== signature(before)) throw new Error('DIRECTORY_SOURCE_CHANGED');
            bytes = Buffer.alloc(before.size + 1);
            let offset = 0;
            while (offset < bytes.length) {
              signal?.throwIfAborted();
              const read = await handle.read(bytes, offset, bytes.length - offset, offset);
              if (!read.bytesRead) break; offset += read.bytesRead;
            }
            bytes = bytes.subarray(0, offset);
            if (signature(await handle.stat()) !== signature(before) || bytes.length !== before.size) throw new Error('DIRECTORY_SOURCE_CHANGED');
          } finally { await handle.close(); }
        }
        entries.push({ path: local, kind: before.isSymbolicLink() ? 'symlink' : 'file', ref: await this.artifacts.put(bytes, 'application/octet-stream') });
      }
      } finally { await directoryHandle.close(); }
    };
    await walk(root);
    for (const observed of observations) {
      signal?.throwIfAborted();
      if (signature(await lstat(observed.path)) !== observed.signature) throw new Error('DIRECTORY_SOURCE_CHANGED');
    }
    for (const directory of directories) if (JSON.stringify((await readdir(directory.path)).sort()) !== JSON.stringify(directory.names)) throw new Error('DIRECTORY_SOURCE_CHANGED');
    const snapshot: Snapshot = { schemaVersion: 'directory-snapshot-v1', directory: root, entries: entries.sort((a, b) => a.path.localeCompare(b.path)), excluded: excluded.sort() };
    const bytes = JSON.stringify(snapshot), digest = sha256(bytes);
    await mkdir(this.snapshots, { recursive: true, mode: 0o700 });
    const temporary = join(this.snapshots, `${digest}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
      await rename(temporary, join(this.snapshots, `${digest}.json`));
    } finally { await rm(temporary, { force: true }); }
    return { snapshot, commit: `directory:${digest}` };
  }
  private async load(root: string, revision: string): Promise<Snapshot> {
    const digest = /^directory:([a-f0-9]{64})$/.exec(revision)?.[1];
    if (!digest) throw new Error('REPOSITORY_REVISION_INVALID');
    let bytes: Buffer;
    try { bytes = await readFile(join(this.snapshots, `${digest}.json`)); }
    catch { throw new Error('DIRECTORY_SNAPSHOT_UNAVAILABLE'); }
    if (sha256(bytes) !== digest) throw new Error('DIRECTORY_SNAPSHOT_CORRUPT');
    const snapshot = JSON.parse(bytes.toString()) as Snapshot;
    if (snapshot.schemaVersion !== 'directory-snapshot-v1' || snapshot.directory !== root) throw new Error('SOURCE_ACCESS_DENIED');
    for (const entry of snapshot.entries) if (!await this.artifacts.verify(entry.ref)) throw new Error('DIRECTORY_SNAPSHOT_CORRUPT');
    return snapshot;
  }
  async analyze(directory: string, revision?: string, signal?: AbortSignal): Promise<RepositoryAnalysis> {
    if (revision !== 'WORKTREE' && !revision?.startsWith('directory:')) return this.git.analyze(directory, revision, signal);
    const root = this.root(directory), resources = this.resources();
    const frozen = revision === 'WORKTREE' ? await this.capture(root, signal) : { snapshot: await this.load(root, revision), commit: revision };
    const { snapshot, commit } = frozen;
    const cpp = snapshot.entries.some(entry => /\.(cpp|cc|cxx|hpp)$/.test(entry.path) && !testPath.test(entry.path));
    const files: RepositoryFile[] = snapshot.entries.filter(entry => entry.kind === 'file' && (sourceExtension.test(entry.path) || buildSystem(entry.path))).map(entry => ({
      path: entry.path, objectId: entry.ref.sha256, size: entry.ref.size, language: sourceLanguage(entry.path, cpp),
      kind: buildSystem(entry.path) ? 'build' : /(?:^|\/)(?:fixtures?|examples?)(?:\/|$)/i.test(entry.path) ? 'example' : testPath.test(entry.path) ? 'test' : 'source',
    }));
    const tools: RepositoryAnalysis['tools'] = [];
    for (const name of ['gcc', 'g++', 'clang', 'clang++', 'make', 'cmake', 'bwrap', 'prlimit']) {
      signal?.throwIfAborted();
      try { tools.push({ name, available: true, version: (await readCommand(name, ['--version'], root, signal, 16384)).split('\n')[0]!.slice(0, 256) }); }
      catch (error) { if (signal?.aborted) throw error; tools.push({ name, available: false, version: null }); }
    }
    const buildCandidates: NonNullable<RepositoryAnalysis['buildCandidates']> = [];
    for (const entry of snapshot.entries.filter(entry => entry.kind === 'file' && basename(entry.path) === 'compile_commands.json')) {
      if (entry.ref.size > 1_048_576) throw new Error('REPOSITORY_SOURCE_TOO_LARGE');
      const content = await this.content(entry);
      buildCandidates.push(...compilationCandidates(content, entry.path, root));
      if (buildCandidates.length > 1000) throw new Error('REPOSITORY_MANIFEST_TOO_LARGE');
    }
    for (const candidate of buildCandidates) if (candidate.sourcePath && !files.some(file => file.kind === 'source' && file.path === candidate.sourcePath)) candidate.issues.push('编译单元不在当前固定源码范围内');
    const inventory = snapshot.entries.map(entry => ({ path: entry.path, objectId: entry.ref.sha256, size: entry.ref.size, kind: entry.kind }));
    return { schemaVersion: 'repository-analysis-v1', repositoryId: `repository-${sha256(root).slice(0, 32)}`, directory: root, requestedRevision: revision, commit,
      sourceDigest: sha256(JSON.stringify(inventory)), files, modules: groupRepositoryModules(files), tools, resources,
      buildSystems: [...new Set(files.map(file => buildSystem(file.path)).filter((value): value is string => !!value))], buildCandidates, inventory,
      directorySnapshot: { schemaVersion: 'directory-snapshot-v1', fileCount: inventory.length, totalBytes: inventory.reduce((sum, entry) => sum + entry.size, 0), excluded: snapshot.excluded },
      warnings: [...snapshot.excluded.map(path => `未纳入版本管理元数据：${path}`), ...snapshot.entries.filter(entry => entry.kind === 'symlink').map(entry => `链接仅保存目标文本，未跟随：${entry.path}`)] };
  }
  private async content(entry: Entry): Promise<string> {
    if (!await this.artifacts.verify(entry.ref)) throw new Error('DIRECTORY_SNAPSHOT_CORRUPT');
    const bytes = await this.artifacts.get(entry.ref);
    try { const value = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); if (value.includes('\0')) throw new Error(); return value; }
    catch { throw new Error('REPOSITORY_SOURCE_CONTENT_INVALID'); }
  }
  async readFiles(directory: string, commit: string, paths: string[], signal?: AbortSignal) {
    if (!commit.startsWith('directory:')) return this.git.readFiles(directory, commit, paths, signal);
    signal?.throwIfAborted();
    if (!Array.isArray(paths) || !paths.length || paths.length > 2000 || new Set(paths).size !== paths.length) throw new Error('REPOSITORY_SOURCE_SELECTION_INVALID');
    const snapshot = await this.load(this.root(directory), commit);
    const selected = paths.map(path => snapshot.entries.find(entry => entry.path === path && entry.kind === 'file'));
    if (selected.some(entry => !entry || (!sourceExtension.test(entry.path) && !buildSystem(entry.path)))) throw new Error('REPOSITORY_SOURCE_SELECTION_INVALID');
    const entries = selected as Entry[];
    if (entries.some(entry => entry.ref.size > 1_048_576) || entries.reduce((sum, entry) => sum + entry.ref.size, 0) > 8_388_608) throw new Error('REPOSITORY_SOURCE_TOO_LARGE');
    const result = [];
    for (const entry of entries) { signal?.throwIfAborted(); result.push({ path: entry.path, objectId: entry.ref.sha256, content: await this.content(entry) }); }
    return result;
  }
}
