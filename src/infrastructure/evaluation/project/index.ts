import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import {
  delimiter, dirname, isAbsolute, join, resolve, sep,
} from 'node:path';
import type {
  ArtifactStore, GeneratedProjectFile, ProjectCommand, ProjectCommandResult,
  ProjectEvaluation, ProjectEvaluator, ProjectSnapshot, ProjectTool,
} from '../../../application/ports/index.ts';

interface ResolvedTool {
  executable: string;
  prefixArgs: string[];
  env?: NodeJS.ProcessEnv;
}

interface CapturedProcess {
  exitCode: number | null;
  timedOut: boolean;
  outputLimitExceeded: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
}

function digest(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function syncText(executable: string, args: string[], cwd: string, allowFailure = false): string {
  const result = spawnSync(executable, args, {
    cwd,
    env: executionEnvironment(),
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    throw new Error(`PROJECT_TOOL_FAILED: ${executable} ${args.join(' ')}: ${result.stderr.trim()}`);
  }
  return result.status === 0 ? result.stdout.trim() : '';
}

function safeRelativePath(path: string): string {
  if (!path || isAbsolute(path) || path.includes('\0')) throw new Error(`PROJECT_PATH_DENIED: ${path}`);
  const parts = path.replaceAll('\\', '/').split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) throw new Error(`PROJECT_PATH_DENIED: ${path}`);
  return parts.join('/');
}

function pathInside(root: string, path: string): string {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(resolvedRoot, safeRelativePath(path));
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${sep}`)) {
    throw new Error(`PROJECT_PATH_DENIED: ${path}`);
  }
  return resolvedPath;
}

function assertNoSymlink(root: string, path: string): void {
  const normalized = safeRelativePath(path);
  let cursor = resolve(root);
  for (const part of normalized.split('/')) {
    cursor = join(cursor, part);
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) {
      throw new Error(`PROJECT_SYMLINK_DENIED: ${path}`);
    }
  }
}

function pnpmScript(): string {
  const candidates: string[] = [];
  const pathDirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  for (const pathDir of pathDirs) {
    const pathEntry = join(pathDir, process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm');
    if (existsSync(pathEntry)) candidates.push(realpathSync(pathEntry));
    candidates.push(join(pathDir, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'));
    candidates.push(join(pathDir, '..', '..', 'node', 'node_modules', 'pnpm', 'bin', 'pnpm.mjs'));
  }
  if (process.env.APPDATA) candidates.push(join(process.env.APPDATA, 'npm', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'));
  if (process.env.PNPM_HOME) candidates.push(join(process.env.PNPM_HOME, 'pnpm.cjs'));
  // Corepack may query pnpm/latest when a target repository has no
  // packageManager field. Prefer an already installed standalone runtime so a
  // frozen-lockfile evaluation does not gain an unrelated network dependency.
  candidates.push(join(dirname(process.execPath), 'node_modules', 'corepack', 'dist', 'pnpm.js'));
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error('PROJECT_TOOL_UNAVAILABLE: pnpm.cjs');
  return realpathSync(found);
}

function installedRustTool(name: 'cargo' | 'rustc' | 'rustdoc'): string {
  const result = spawnSync('rustup', ['which', name], {
    env: process.env, encoding: 'utf8', shell: false, windowsHide: true,
  });
  if (result.error || result.status !== 0 || !result.stdout.trim()) {
    throw new Error(`PROJECT_TOOL_UNAVAILABLE: rustup which ${name}`);
  }
  return realpathSync(result.stdout.trim());
}

function installedPnpmStore(script: string): string | null {
  const result = spawnSync(process.execPath, [script, 'store', 'path'], {
    env: process.env, encoding: 'utf8', shell: false, windowsHide: true,
  });
  return result.status === 0 && result.stdout.trim() ? realpathSync(result.stdout.trim()) : null;
}

function resolveTool(tool: ProjectTool, usePackageStore = false): ResolvedTool {
  if (tool === 'node') return { executable: process.execPath, prefixArgs: [] };
  if (tool === 'pnpm') {
    const script = pnpmScript();
    const store = installedPnpmStore(script);
    return {
      executable: process.execPath,
      prefixArgs: [script, ...(usePackageStore && store ? ['--store-dir', store] : [])],
    };
  }
  if (tool === 'cargo') return {
    executable: installedRustTool('cargo'), prefixArgs: [],
    env: { RUSTC: installedRustTool('rustc'), RUSTDOC: installedRustTool('rustdoc') },
  };
  throw new Error(`PROJECT_TOOL_DENIED: ${String(tool)}`);
}

function executionEnvironment(isolationRoot?: string): NodeJS.ProcessEnv {
  const allowed = new Set([
    'PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT',
    'ProgramFiles', 'ProgramFiles(x86)', 'ProgramData',
    'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE',
  ]);
  const env: NodeJS.ProcessEnv = { CI: '1', NO_COLOR: '1', FORCE_COLOR: '0' };
  for (const [key, value] of Object.entries(process.env)) {
    if (allowed.has(key) && value !== undefined) env[key] = value;
  }
  if (isolationRoot) {
    const home = join(isolationRoot, 'home');
    const appData = join(isolationRoot, 'appdata');
    const localAppData = join(isolationRoot, 'localappdata');
    const temporary = join(isolationRoot, 'tmp');
    for (const path of [home, appData, localAppData, temporary]) mkdirSync(path, { recursive: true });
    Object.assign(env, {
      HOME: home,
      USERPROFILE: home,
      APPDATA: appData,
      LOCALAPPDATA: localAppData,
      TEMP: temporary,
      TMP: temporary,
      XDG_CONFIG_HOME: join(home, '.config'),
      XDG_CACHE_HOME: join(home, '.cache'),
      XDG_DATA_HOME: join(home, '.local', 'share'),
      CARGO_HOME: join(isolationRoot, 'cargo-home'),
      RUSTUP_HOME: join(isolationRoot, 'rustup-home'),
    });
  }
  return env;
}

function terminateProcessTree(childPid: number | undefined): void {
  if (!childPid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(childPid), '/t', '/f'], {
      shell: false, windowsHide: true, stdio: 'ignore',
    }).unref();
    return;
  }
  try {
    process.kill(-childPid, 'SIGKILL');
  } catch {
    try { process.kill(childPid, 'SIGKILL'); } catch { /* process already exited */ }
  }
}

function redact(text: string, roots: string[]): string {
  let value = text;
  for (const root of roots.filter(Boolean).sort((left, right) => right.length - left.length)) {
    value = value.replaceAll(root, '<workspace>');
    value = value.replaceAll(root.replaceAll('\\', '/'), '<workspace>');
  }
  return value
    .replace(/((?:api[_-]?key|authorization|token|secret)\s*[:=]\s*)[^\s,;]+/gi, '$1<redacted>')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer <redacted>');
}

function redactArgs(args: string[], roots: string[]): string[] {
  const secretFlag = /^--?(?:api[-_]?key|authorization|token|secret|password|passwd)$/i;
  return args.map((arg, index) => (
    index > 0 && secretFlag.test(args[index - 1] ?? '') ? '<redacted>' : redact(arg, roots)
  ));
}

async function capture(
  tool: ResolvedTool,
  args: string[],
  cwd: string,
  timeoutMs: number,
  maxOutputBytes: number,
  roots: string[],
  isolationRoot: string,
  signal?: AbortSignal,
): Promise<CapturedProcess> {
  if (signal?.aborted) throw new Error('PROJECT_EVALUATION_CANCELLED');
  const startedAt = Date.now();
  return new Promise<CapturedProcess>((resolvePromise, reject) => {
    const child = spawn(tool.executable, [...tool.prefixArgs, ...args], {
      cwd,
      env: { ...executionEnvironment(isolationRoot), ...(tool.env ?? {}) },
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let timedOut = false;
    let outputLimitExceeded = false;
    let aborted = false;
    let settled = false;

    const append = (current: Buffer<ArrayBufferLike>, chunk: Buffer<ArrayBufferLike>): Buffer<ArrayBufferLike> => {
      const remaining = Math.max(0, maxOutputBytes - stdout.byteLength - stderr.byteLength);
      if (chunk.byteLength > remaining) outputLimitExceeded = true;
      return remaining > 0 ? Buffer.concat([current, chunk.subarray(0, remaining)]) : current;
    };
    child.stdout.on('data', (chunk: Buffer) => {
      stdout = append(stdout, chunk);
      if (outputLimitExceeded) terminateProcessTree(child.pid);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = append(stderr, chunk);
      if (outputLimitExceeded) terminateProcessTree(child.pid);
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      terminateProcessTree(child.pid);
    }, timeoutMs);
    const abort = () => {
      aborted = true;
      terminateProcessTree(child.pid);
    };
    signal?.addEventListener('abort', abort, { once: true });
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      reject(error);
    });
    child.once('close', (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      if (aborted) {
        reject(new Error('PROJECT_EVALUATION_CANCELLED'));
        return;
      }
      resolvePromise({
        exitCode,
        timedOut,
        outputLimitExceeded,
        durationMs: Date.now() - startedAt,
        stdout: redact(stdout.toString('utf8'), roots),
        stderr: redact(stderr.toString('utf8'), roots),
      });
    });
  });
}

export function parseTestCounts(output: string): { passed: number; total: number; parsed: boolean } {
  const cargo = output.match(/test result:\s+(?:ok|FAILED)\.\s+(\d+) passed;\s+(\d+) failed/i);
  if (cargo) {
    return { passed: Number(cargo[1]), total: Number(cargo[1]) + Number(cargo[2]), parsed: true };
  }
  const jestSummary = output.match(/^Tests:\s*(.+)$/im)?.[1];
  if (jestSummary) {
    const passed = Number(jestSummary.match(/(\d+)\s+passed\b/i)?.[1] ?? 0);
    const totalMatch = jestSummary.match(/(\d+)\s+total\b/i);
    if (totalMatch) return { passed, total: Number(totalMatch[1]), parsed: true };
  }
  const passedMatch = output.match(/\bTests\s+(\d+) passed\b/i);
  const failedMatch = output.match(/\bTests\s+(\d+) failed\b/i);
  if (passedMatch || failedMatch) {
    const passed = Number(passedMatch?.[1] ?? 0);
    return { passed, total: passed + Number(failedMatch?.[1] ?? 0), parsed: true };
  }
  const nodeTotal = output.match(/^[\s#\u2139]*tests\s+(\d+)\s*$/im);
  const nodePassed = output.match(/^[\s#\u2139]*pass\s+(\d+)\s*$/im);
  if (nodeTotal && nodePassed) {
    return { passed: Number(nodePassed[1]), total: Number(nodeTotal[1]), parsed: true };
  }
  return { passed: 0, total: 0, parsed: false };
}

export class TrustedProjectEvaluator implements ProjectEvaluator {
  readonly artifacts: ArtifactStore;

  constructor(artifacts: ArtifactStore) {
    this.artifacts = artifacts;
  }

  async inspect(input: {
    repositoryRoot: string;
    expectedCommit?: string;
    sourcePaths: string[];
    publicInterfacePaths: string[];
  }): Promise<ProjectSnapshot> {
    const repositoryRoot = realpathSync(resolve(input.repositoryRoot));
    const checkoutHead = syncText('git', ['rev-parse', 'HEAD'], repositoryRoot);
    if (input.expectedCommit && !/^[0-9a-f]{40}$/i.test(input.expectedCommit)) {
      throw new Error(`PROJECT_COMMIT_INVALID: ${input.expectedCommit}`);
    }
    const commit = input.expectedCommit
      ? syncText('git', ['rev-parse', '--verify', `${input.expectedCommit}^{commit}`], repositoryRoot)
      : checkoutHead;
    if (input.expectedCommit && commit.toLowerCase() !== input.expectedCommit.toLowerCase()) {
      throw new Error(`PROJECT_COMMIT_MISMATCH: expected ${input.expectedCommit}, resolved ${commit}`);
    }
    const sourcePaths = input.sourcePaths.map(safeRelativePath);
    const publicInterfacePaths = input.publicInterfacePaths.map(safeRelativePath);
    const files = [...new Set([...sourcePaths, ...publicInterfacePaths])].map((path) => {
      const bytes = spawnSync('git', ['show', `${commit}:${path}`], {
        cwd: repositoryRoot, env: executionEnvironment(),
        encoding: null, shell: false, windowsHide: true, maxBuffer: 16 * 1024 * 1024,
      });
      if (bytes.error) throw bytes.error;
      if (bytes.status !== 0 || !bytes.stdout) throw new Error(`PROJECT_SOURCE_MISSING: ${path}`);
      return { path, sha256: digest(bytes.stdout), size: bytes.stdout.byteLength };
    });
    const remote = syncText('git', ['config', '--get', 'remote.origin.url'], repositoryRoot, true);
    const dirty = syncText('git', ['status', '--porcelain=v1'], repositoryRoot, true).length > 0;
    const manifest = {
      schemaVersion: '1.0', repositoryRoot, remote, checkoutHead, commit, dirty,
      sourcePaths, publicInterfacePaths, files,
    };
    const manifestRef = await this.artifacts.put(Buffer.from(JSON.stringify(manifest, null, 2)), 'application/json');
    return { repositoryRoot, remote, checkoutHead, commit, dirty, sourcePaths, publicInterfacePaths, manifestRef };
  }

  async evaluate(input: {
    label: string;
    snapshot: ProjectSnapshot;
    generatedFiles: GeneratedProjectFile[];
    prepareCommands: ProjectCommand[];
    commands: ProjectCommand[];
  }, signal?: AbortSignal): Promise<ProjectEvaluation> {
    if (input.commands.length === 0) throw new Error('PROJECT_GATE_EMPTY');
    const tempRoot = mkdtempSync(join(tmpdir(), 'wp-project-eval-'));
    const workspace = join(tempRoot, 'workspace');
    const archivePath = join(tempRoot, 'snapshot.tar');
    const generatedFileDigests: Record<string, string> = {};
    try {
      mkdirSync(workspace, { recursive: true });
      syncText('git', ['-C', input.snapshot.repositoryRoot, 'archive', '--format=tar', `--output=${archivePath}`, input.snapshot.commit], tempRoot);
      syncText('tar', ['-xf', archivePath, '-C', workspace], tempRoot);
      for (const file of input.generatedFiles) {
        const normalized = safeRelativePath(file.path);
        assertNoSymlink(workspace, normalized);
        const target = pathInside(workspace, normalized);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, file.content, 'utf8');
        generatedFileDigests[normalized] = digest(file.content);
      }

      const declaredTools = new Set([...input.prepareCommands, ...input.commands].map((command) => command.tool));
      const toolchain: Record<string, string> = {
        platform: `${process.platform}-${process.arch}`,
        node: process.version,
        git: syncText('git', ['--version'], workspace),
        tar: syncText('tar', ['--version'], workspace).split('\n')[0],
      };
      if (declaredTools.has('pnpm')) toolchain.pnpm = syncText(process.execPath, [pnpmScript(), '--version'], workspace);
      if (declaredTools.has('cargo')) {
        toolchain.cargo = syncText('cargo', ['--version'], workspace);
        toolchain.rustc = syncText('rustc', ['--version'], workspace);
      }
      const results: ProjectCommandResult[] = [];
      const redactionRoots = [input.snapshot.repositoryRoot, workspace, tempRoot];
      const execute = async (
        command: ProjectCommand, attempt: number, phase: ProjectCommandResult['phase'],
      ): Promise<ProjectCommandResult> => {
        if (!Array.isArray(command.args) || command.args.some((arg) => typeof arg !== 'string' || arg.includes('\0'))) {
          throw new Error('PROJECT_ARGUMENT_DENIED');
        }
        const timeoutMs = command.timeoutMs ?? 120_000;
        const maxOutputBytes = command.maxOutputBytes ?? 1_048_576;
        if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 1_800_000) {
          throw new Error(`PROJECT_TIMEOUT_INVALID: ${timeoutMs}`);
        }
        if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1 || maxOutputBytes > 16_777_216) {
          throw new Error(`PROJECT_OUTPUT_LIMIT_INVALID: ${maxOutputBytes}`);
        }
        const commandCwd = command.cwd ? pathInside(workspace, command.cwd) : workspace;
        if (command.cwd) assertNoSymlink(workspace, command.cwd);
        const captured = await capture(
          resolveTool(command.tool, phase === 'prepare'), command.args, commandCwd,
          timeoutMs, maxOutputBytes,
          redactionRoots, tempRoot, signal,
        );
        const counts = command.purpose === 'test'
          ? parseTestCounts(`${captured.stdout}\n${captured.stderr}`)
          : { passed: 0, total: 0, parsed: false };
        return {
          phase, tool: command.tool, purpose: command.purpose,
          args: redactArgs(command.args, redactionRoots), cwd: command.cwd ?? '.', attempt,
          ...captured, testsPassed: counts.passed, testsTotal: counts.total, testCountsParsed: counts.parsed,
        };
      };

      let prepareFailed = false;
      for (const command of input.prepareCommands) {
        const result = await execute(command, 1, 'prepare');
        results.push(result);
        if (result.exitCode !== 0 || result.timedOut || result.outputLimitExceeded) {
          prepareFailed = true;
          break;
        }
      }
      const generatedFilesIntact = Object.entries(generatedFileDigests).every(([path, expectedDigest]) => {
        const generatedPath = pathInside(workspace, path);
        return existsSync(generatedPath) && digest(readFileSync(generatedPath)) === expectedDigest;
      });
      if (!generatedFilesIntact) prepareFailed = true;
      if (!prepareFailed) {
        for (const command of input.commands) {
          const repetitions = command.repetitions ?? 1;
          if (!Number.isSafeInteger(repetitions) || repetitions < 1 || repetitions > 10) {
            throw new Error(`PROJECT_REPETITION_INVALID: ${repetitions}`);
          }
          for (let attempt = 1; attempt <= repetitions; attempt += 1) {
            const result = await execute(command, attempt, 'gate');
            results.push(result);
            if (result.exitCode !== 0 || result.timedOut || result.outputLimitExceeded) break;
          }
          const last = results[results.length - 1];
          if (!last || last.exitCode !== 0 || last.timedOut || last.outputLimitExceeded) break;
        }
      }

      const infrastructureFailure = prepareFailed || results.some((result) =>
        result.exitCode === null || result.timedOut || result.outputLimitExceeded,
      );
      const expectedExecutions = input.commands.reduce((sum, command) => sum + (command.repetitions ?? 1), 0);
      const gateResults = results.filter((result) => result.phase === 'gate');
      const testResults = gateResults.filter((result) => result.purpose === 'test');
      const passedExecutions = gateResults.filter((result) =>
        result.exitCode === 0 && !result.timedOut && !result.outputLimitExceeded,
      ).length;
      const passed = !prepareFailed && gateResults.length >= expectedExecutions
        && gateResults.every((result) => result.exitCode === 0 && !result.timedOut && !result.outputLimitExceeded)
        && testResults.length > 0
        && testResults.every((result) => result.testCountsParsed && result.testsTotal > 0);
      const testsPassed = testResults.reduce((sum, result) => sum + result.testsPassed, 0);
      const testsTotal = testResults.reduce((sum, result) => sum + result.testsTotal, 0);
      const stability = expectedExecutions > 0 ? Math.min(1, passedExecutions / expectedExecutions) : 0;
      const evidence = {
        schemaVersion: '1.0', label: input.label, commit: input.snapshot.commit,
        repository: {
          remote: input.snapshot.remote, repositoryRoot: input.snapshot.repositoryRoot,
          checkoutHead: input.snapshot.checkoutHead, commit: input.snapshot.commit, dirty: input.snapshot.dirty,
        },
        toolchain,
        toolchainFingerprint: `sha256:${digest(JSON.stringify(toolchain))}`,
        generatedFileDigests, generatedFilesIntact,
        passed, testsPassed, testsTotal, stability, infrastructureFailure, results,
      };
      const evidenceRef = await this.artifacts.put(Buffer.from(JSON.stringify(evidence, null, 2)), 'application/json');
      return {
        label: input.label, commit: input.snapshot.commit, passed, testsPassed, testsTotal,
        stability, infrastructureFailure,
        toolchainFingerprint: evidence.toolchainFingerprint,
        generatedFileDigests, results, evidenceRef,
      };
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }
}
