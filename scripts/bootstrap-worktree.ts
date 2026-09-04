#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { delimiter, dirname, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MINIMUM_NODE_MAJOR = 24;
export const READY_FILE = join('.workpanel', 'worktree-bootstrap.json');

type PackageManager = 'pnpm' | 'npm';

interface WorkspacePlan {
  workspaceRoot: string;
  packageManager: PackageManager;
  lockfile: string;
  lockfileSha256: string;
}

interface CommandOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  capture: boolean;
}

type CommandRunner = (
  command: string, args: string[], options: CommandOptions,
) => string;

interface ReadyState extends WorkspacePlan {
  schemaVersion: '1.0';
  status: 'READY';
  nodeVersion: string;
  packageManagerVersion: string;
  dependencyCache: string;
  nodeModules: string;
  completedAt: string;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function assertSupportedNode(version = process.versions.node): void {
  const major = Number(version.split('.', 1)[0]);
  if (!Number.isSafeInteger(major) || major < MINIMUM_NODE_MAJOR) {
    throw new Error(`WORKTREE_NODE_UNSUPPORTED: expected Node >=${MINIMUM_NODE_MAJOR}, received ${version}`);
  }
}

function assertLocalNodeModules(root: string): void {
  const path = join(root, 'node_modules');
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) {
    throw new Error('WORKTREE_NODE_MODULES_SHARED: remove the node_modules symlink and bootstrap again');
  }
}

export function inspectWorkspace(root: string): WorkspacePlan {
  const workspaceRoot = resolve(root);
  if (!existsSync(join(workspaceRoot, '.git'))) {
    throw new Error(`WORKTREE_GIT_ROOT_INVALID: ${workspaceRoot}`);
  }
  assertLocalNodeModules(workspaceRoot);
  const selected = existsSync(join(workspaceRoot, 'pnpm-lock.yaml'))
    ? { packageManager: 'pnpm' as const, lockfile: 'pnpm-lock.yaml' }
    : existsSync(join(workspaceRoot, 'package-lock.json'))
      ? { packageManager: 'npm' as const, lockfile: 'package-lock.json' }
      : null;
  if (!selected) throw new Error('WORKTREE_LOCKFILE_REQUIRED: expected pnpm-lock.yaml or package-lock.json');
  return {
    workspaceRoot,
    ...selected,
    lockfileSha256: sha256(readFileSync(join(workspaceRoot, selected.lockfile))),
  };
}

function executableOnPath(name: string, env: NodeJS.ProcessEnv): string | null {
  const suffixes = process.platform === 'win32'
    ? (env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';')
    : [''];
  for (const directory of (env.PATH ?? '').split(delimiter).filter(Boolean)) {
    for (const suffix of suffixes) {
      const candidate = join(directory, `${name}${suffix}`);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function managerInvocation(name: PackageManager, env: NodeJS.ProcessEnv): {
  executable: string;
  prefixArgs: string[];
} {
  const configured = name === 'pnpm' ? env.WP_WORKTREE_PNPM_BIN : env.WP_WORKTREE_NPM_BIN;
  const npmScript = name === 'npm' ? env.npm_execpath : undefined;
  const corepackPnpm = join(
    dirname(process.execPath), '..', 'lib', 'node_modules', 'corepack', 'dist', 'pnpm.js',
  );
  const candidate = configured || npmScript || executableOnPath(name, env)
    || (name === 'pnpm' && existsSync(corepackPnpm) ? corepackPnpm : null);
  if (!candidate) throw new Error(`WORKTREE_PACKAGE_MANAGER_UNAVAILABLE: ${name}`);
  const resolved = realpathSync(resolve(candidate));
  return ['.js', '.cjs', '.mjs'].includes(extname(resolved).toLowerCase())
    ? { executable: process.execPath, prefixArgs: [resolved] }
    : { executable: resolved, prefixArgs: [] };
}

function run(command: string, args: string[], options: CommandOptions): string {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: options.capture ? 'utf8' : undefined,
    stdio: options.capture ? 'pipe' : 'inherit',
    shell: false,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = options.capture ? String(result.stderr || result.stdout || '').trim() : '';
    throw new Error(`WORKTREE_BOOTSTRAP_COMMAND_FAILED: ${command} ${args.join(' ')}${detail ? `: ${detail}` : ''}`);
  }
  return options.capture ? String(result.stdout).trim() : '';
}

function sharedCache(
  plan: WorkspacePlan,
  manager: ReturnType<typeof managerInvocation>,
  env: NodeJS.ProcessEnv,
  commandRunner: CommandRunner,
): string {
  const override = plan.packageManager === 'pnpm'
    ? env.WP_WORKTREE_PNPM_STORE_DIR
    : env.WP_WORKTREE_NPM_CACHE_DIR;
  if (override?.trim()) return resolve(override.trim());
  const args = plan.packageManager === 'pnpm' ? ['store', 'path', '--silent'] : ['config', 'get', 'cache'];
  const value = commandRunner(manager.executable, [...manager.prefixArgs, ...args], {
    cwd: plan.workspaceRoot, env, capture: true,
  });
  if (!value) throw new Error(`WORKTREE_CACHE_PATH_INVALID: ${plan.packageManager}`);
  return resolve(value.split(/\r?\n/).at(-1) as string);
}

function writeReady(root: string, payload: ReadyState): void {
  const target = join(root, READY_FILE);
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  renameSync(temporary, target);
}

function invalidateReady(root: string): void {
  const target = join(root, READY_FILE);
  if (existsSync(target)) unlinkSync(target);
}

export function assertReady(
  root: string,
  nodeVersion = process.versions.node,
  env = process.env,
  commandRunner: CommandRunner = run,
): ReadyState {
  assertSupportedNode(nodeVersion);
  const plan = inspectWorkspace(root);
  const target = join(plan.workspaceRoot, READY_FILE);
  if (!existsSync(target)) throw new Error('WORKTREE_NOT_READY: run npm run bootstrap:worktree');
  let value: Partial<ReadyState>;
  try {
    value = JSON.parse(readFileSync(target, 'utf8')) as Partial<ReadyState>;
  } catch {
    throw new Error('WORKTREE_READY_STATE_INVALID');
  }
  if (value.schemaVersion !== '1.0') {
    throw new Error('WORKTREE_READY_STATE_INVALID');
  }
  if (value.status !== 'READY'
    || value.nodeVersion !== nodeVersion
    || value.lockfile !== plan.lockfile
    || value.lockfileSha256 !== plan.lockfileSha256
    || value.nodeModules !== join(plan.workspaceRoot, 'node_modules')
    || !existsSync(value.nodeModules)) {
    throw new Error('WORKTREE_READY_STATE_STALE: run npm run bootstrap:worktree');
  }
  const manager = managerInvocation(plan.packageManager, env);
  const packageManagerVersion = commandRunner(manager.executable, [...manager.prefixArgs, '--version'], {
    cwd: plan.workspaceRoot, env, capture: true,
  });
  if (value.packageManager !== plan.packageManager
    || value.packageManagerVersion !== packageManagerVersion) {
    throw new Error('WORKTREE_READY_STATE_STALE: run npm run bootstrap:worktree');
  }
  assertLocalNodeModules(plan.workspaceRoot);
  return value as ReadyState;
}

export function bootstrapWorkspace({
  root = process.cwd(), env = process.env, commandRunner = run,
}: {
  root?: string;
  env?: NodeJS.ProcessEnv;
  commandRunner?: CommandRunner;
} = {}): ReadyState {
  assertSupportedNode();
  const plan = inspectWorkspace(root);
  const manager = managerInvocation(plan.packageManager, env);
  const packageManagerVersion = commandRunner(manager.executable, [...manager.prefixArgs, '--version'], {
    cwd: plan.workspaceRoot, env, capture: true,
  });
  const cachePath = sharedCache(plan, manager, env, commandRunner);
  mkdirSync(cachePath, { recursive: true });
  const installArgs = plan.packageManager === 'pnpm'
    ? ['install', '--frozen-lockfile', '--prefer-offline', '--store-dir', cachePath]
    : ['ci', '--prefer-offline', '--no-audit', '--no-fund', '--cache', cachePath];
  invalidateReady(plan.workspaceRoot);
  commandRunner(manager.executable, [...manager.prefixArgs, ...installArgs], {
    cwd: plan.workspaceRoot, env, capture: false,
  });
  assertLocalNodeModules(plan.workspaceRoot);
  if (!existsSync(join(plan.workspaceRoot, 'node_modules'))) {
    throw new Error('WORKTREE_DEPENDENCIES_MISSING: package manager did not create node_modules');
  }
  const payload: ReadyState = {
    schemaVersion: '1.0', status: 'READY', ...plan,
    nodeVersion: process.versions.node,
    packageManagerVersion,
    dependencyCache: cachePath,
    nodeModules: join(plan.workspaceRoot, 'node_modules'),
    completedAt: new Date().toISOString(),
  };
  writeReady(plan.workspaceRoot, payload);
  return payload;
}

function parseArgs(argv: string[]): { check: boolean; root: string } {
  const options = { check: false, root: process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--check') options.check = true;
    else if (argv[index] === '--root' && argv[index + 1]) options.root = argv[++index] as string;
    else throw new Error(`WORKTREE_BOOTSTRAP_ARGUMENT_INVALID: ${argv[index]}`);
  }
  return options;
}

export function main(argv = process.argv.slice(2)): void {
  const options = parseArgs(argv);
  const result = options.check ? assertReady(options.root) : bootstrapWorkspace({ root: options.root });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const directEntry = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href === import.meta.url
  : false;

if (directEntry) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
