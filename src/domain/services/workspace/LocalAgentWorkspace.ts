/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：根据角色可读路径和固定 Git 提交构建只读工作空间，防止混入未授权源码。
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
export interface AgentWorkspaceView {
  /** 提供workspace根目录信息，供调用方读取或传入。 */
  workspaceRoot: string;
  /** 提供确定本角色允许读取的文件路径信息，供调用方读取或传入。 */
  readablePaths: string[];
}

/** 定义角色工作区提供方的数据结构与类型约束。 */
export interface AgentWorkspaceProvider {
  /** 提供 materialize 对应的materialize操作。 */
  materialize(input: {
    isolationKey: string;
    role: string;
    sourceRoot: string;
    /** When present, files must be read from this immutable Git commit, not the worktree. */
    sourceCommit?: string;
    readablePaths: string[];
  }): Promise<AgentWorkspaceView>;
}



/** 定义本地角色工作区选项的数据结构与类型约束。 */
export interface LocalAgentWorkspaceOptions {
  /** 提供workspace根目录信息，供调用方读取或传入。 */
  workspaceRoot: string;
  /** 提供allowed源码Roots信息，供调用方读取或传入。 */
  allowedSourceRoots: string[];
}

function digest(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeRelativePath(path: string): string {
  const normalized = normalize(path.replaceAll('\\', sep).replaceAll('/', sep));
  if (!path || isAbsolute(path) || normalized === '..' || normalized.startsWith(`..${sep}`)) {
    throw new Error(`AGENT_WORKSPACE_PATH_DENIED: ${path}`);
  }
  return normalized.split(sep).join('/');
}

async function assertNoSymlink(root: string, path: string): Promise<void> {
  let cursor = root;
  for (const segment of path.split('/')) {
    cursor = join(cursor, segment);
    if ((await lstat(cursor)).isSymbolicLink()) {
      throw new Error(`AGENT_WORKSPACE_SYMLINK_DENIED: ${path}`);
    }
  }
}

async function writeImmutable(path: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  try {
    await writeFile(path, bytes, { flag: 'wx', mode: 0o400 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const current = await readFile(path);
    if (!current.equals(bytes)) throw new Error(`AGENT_WORKSPACE_REPLAY_MISMATCH: ${path}`);
  }
}

function committedFile(repositoryRoot: string, commit: string, path: string): Buffer {
  if (!/^[a-f0-9]{40}$/i.test(commit)) throw new Error(`AGENT_WORKSPACE_COMMIT_INVALID: ${commit}`);
  const tree = spawnSync('git', ['ls-tree', commit, '--', path], {
    cwd: repositoryRoot, encoding: 'utf8', shell: false, windowsHide: true,
  });
  if (tree.error) throw tree.error;
  if (tree.status !== 0 || !tree.stdout.trim()) throw new Error(`AGENT_WORKSPACE_SOURCE_MISSING: ${path}`);
  const mode = tree.stdout.trim().split(/\s+/, 1)[0];
  if (mode !== '100644' && mode !== '100755') throw new Error(`AGENT_WORKSPACE_NOT_FILE: ${path}`);
  const content = spawnSync('git', ['show', `${commit}:${path}`], {
    cwd: repositoryRoot, encoding: null, shell: false, windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (content.error) throw content.error;
  if (content.status !== 0 || !content.stdout) throw new Error(`AGENT_WORKSPACE_SOURCE_MISSING: ${path}`);
  return content.stdout;
}

/**
 * Copies an explicit allowlist into an immutable per-node view. This prevents
 * accidental source visibility. The DSH process sandbox is responsible for
 * making this view the only project tree visible to the model runtime.
 */
/** 封装Local角色工作区的对外操作与协作依赖。 */
export class LocalAgentWorkspace implements AgentWorkspaceProvider {
  /** 提供workspace根目录信息，供调用方读取或传入。 */
  readonly workspaceRoot: string;
  /** 提供allowed源码Roots信息，供调用方读取或传入。 */
  readonly allowedSourceRoots: string[];

  /** 注入协作依赖并初始化实例状态。 */
  constructor(options: LocalAgentWorkspaceOptions) {
    if (options.allowedSourceRoots.length === 0) throw new Error('AGENT_WORKSPACE_ALLOWED_ROOT_REQUIRED');
    this.workspaceRoot = resolve(options.workspaceRoot);
    this.allowedSourceRoots = options.allowedSourceRoots.map((root) => resolve(root));
  }

  /** 提供 materialize 对应的materialize操作。 */
  async materialize(input: {
    isolationKey: string;
    role: string;
    sourceRoot: string;
    sourceCommit?: string;
    readablePaths: string[];
  }): Promise<AgentWorkspaceView> {
    const sourceRoot = await realpath(resolve(input.sourceRoot));
    const allowed = await Promise.all(this.allowedSourceRoots.map((root) => realpath(root)));
    if (!allowed.some((root) => sourceRoot === root || sourceRoot.startsWith(`${root}${sep}`))) {
      throw new Error('AGENT_WORKSPACE_SOURCE_DENIED');
    }
    const readablePaths = [...new Set(input.readablePaths.map(safeRelativePath))].sort();
    const viewIdentity = JSON.stringify({
      isolationKey: input.isolationKey,
      role: input.role,
      sourceRoot,
      sourceCommit: input.sourceCommit ?? null,
      readablePaths,
    });
    const viewRoot = join(this.workspaceRoot, digest(viewIdentity).slice(0, 32));
    await mkdir(viewRoot, { recursive: true, mode: 0o700 });
    const files: { path: string; sha256: string; bytes: number }[] = [];
    for (const path of readablePaths) {
      const pathSegments = path.split('/');
      let bytes: Uint8Array;
      if (input.sourceCommit) {
        bytes = committedFile(sourceRoot, input.sourceCommit, path);
      } else {
        await assertNoSymlink(sourceRoot, path);
        const source = await realpath(join(sourceRoot, ...pathSegments));
        if (relative(sourceRoot, source).startsWith('..')) throw new Error(`AGENT_WORKSPACE_PATH_DENIED: ${path}`);
        const stat = await lstat(source);
        if (!stat.isFile()) throw new Error(`AGENT_WORKSPACE_NOT_FILE: ${path}`);
        bytes = await readFile(source);
      }
      await writeImmutable(join(viewRoot, ...pathSegments), bytes);
      files.push({ path, sha256: digest(bytes), bytes: bytes.byteLength });
    }
    await writeImmutable(join(viewRoot, '.flywheel-workspace.json'), Buffer.from(JSON.stringify({
      schemaVersion: '1.0', role: input.role, sourceCommit: input.sourceCommit ?? null, readablePaths, files,
    }, null, 2)));
    return { workspaceRoot: viewRoot, readablePaths };
  }
}
