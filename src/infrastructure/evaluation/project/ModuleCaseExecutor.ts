/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：在 Linux 隔离进程内构建独立模块，由宿主执行不可伪造计数的行为门禁。
 */
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import type { ArtifactStore, GeneratedProjectFile, ProjectCommandResult, ProjectEvaluation, ProjectSnapshot } from '../../../application/ports/ApplicationPorts.ts';
import { assertModuleBehaviorSuite, type ModuleBehaviorSuite } from '../../../domain/agents/testGenAgent/ModuleBehaviorSuite.ts';
import { modelProcessLane } from '../../agentAdapters/ModelProcessLane.ts';
import { bundledLibraryEnvironment, bundledLibrarySandboxArgs } from '../../runtime/BundledLibraries.ts';

interface ModuleEvaluationInput {
  label: string;
  snapshot: ProjectSnapshot;
  generatedFiles: GeneratedProjectFile[];
  moduleSuite: ModuleBehaviorSuite;
  moduleContract?: { modulePath: string; exportName: string; signature: string };
}
interface ProcessResult {
  exitCode: number | null; timedOut: boolean; outputLimitExceeded: boolean; durationMs: number;
  stdout: string; stderr: string;
}
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const repetitions = 5;
const maxOutputBytes = 131_072;
async function fileDigest(path: string): Promise<string> {
  const value = createHash('sha256');
  for await (const chunk of createReadStream(path)) value.update(chunk);
  return value.digest('hex');
}

// 执行器本身不接收 expected；vm 隔开模块与序列化器的 JS 全局对象，内核隔离和权限模型另行约束逃逸后的能力。
const runner = `import { readFileSync } from 'node:fs';
import { createContext, SourceTextModule, runInContext } from 'node:vm';
const [path, exportName, encodedArgs] = process.argv.slice(2);
const context = createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } });
const source = readFileSync(path, 'utf8');
const module = new SourceTextModule(source, { context, identifier: 'generated-module',
  importModuleDynamically() { throw new Error('MODULE_IMPORT_DENIED'); } });
await module.link(() => { throw new Error('MODULE_IMPORT_DENIED'); });
await module.evaluate({ timeout: 1000 });
const fn = module.namespace[exportName];
if (typeof fn !== 'function') throw new Error('MODULE_EXPORT_MISSING');
const args = runInContext('JSON.parse(' + JSON.stringify(encodedArgs) + ')', context, { timeout: 1000 });
const output = await Reflect.apply(fn, undefined, args);
function plain(value, depth = 0, ancestors = new Set()) {
  if (depth > 16) throw new Error('MODULE_RESULT_TOO_DEEP');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || ancestors.has(value)) throw new Error('MODULE_RESULT_NOT_JSON');
  const proto = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && proto !== null && Object.getPrototypeOf(proto) !== null) throw new Error('MODULE_RESULT_NOT_PLAIN');
  if (Object.getOwnPropertySymbols(value).length) throw new Error('MODULE_RESULT_NOT_JSON');
  ancestors.add(value);
  const result = Array.isArray(value) ? [] : Object.create(null);
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (Array.isArray(value) && key === 'length') continue;
    if (!('value' in descriptor)) throw new Error('MODULE_RESULT_ACCESSOR_DENIED');
    result[key] = plain(descriptor.value, depth + 1, ancestors);
  }
  ancestors.delete(value);
  return result;
}
process.stdout.write(JSON.stringify({ value: plain(output) }));
`;

/** 每个案例独占一个 PID / 网络 / 文件系统命名空间，取消或输出超限均杀死整组子进程。 */
async function captureIsolated(input: {
  workspace: string; command: string[]; compilerRoot?: string; buildOutput?: string; timeoutMs: number; memoryBytes: number;
}, signal?: AbortSignal): Promise<ProcessResult> {
  if (signal?.aborted) throw new Error('PROJECT_EVALUATION_CANCELLED');
  if (process.platform !== 'linux') throw new Error('PROJECT_ISOLATION_UNAVAILABLE: Linux namespaces required');
  const mounts = ['/usr', '/lib', '/lib64'].filter(existsSync).flatMap((path) => ['--ro-bind', path, path]);
  const args = [
    `--as=${input.memoryBytes}`, '--cpu=15', '--nofile=96', '--fsize=1048576', '--',
    process.env.WP_EVALUATION_BWRAP_COMMAND ?? 'bwrap',
    '--unshare-all', '--die-with-parent', '--new-session', '--cap-drop', 'ALL',
    ...mounts, '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp',
    '--ro-bind', realpathSync(process.execPath), '/runtime-node',
    '--ro-bind', input.workspace, '/workspace',
    ...(input.buildOutput ? ['--bind', input.buildOutput, '/workspace/build'] : []),
    ...(input.compilerRoot ? ['--ro-bind', input.compilerRoot, '/compiler'] : []),
    '--clearenv', '--setenv', 'HOME', '/tmp', '--setenv', 'TMPDIR', '/tmp',
    ...bundledLibrarySandboxArgs(),
    '--setenv', 'GOMAXPROCS', '1', '--setenv', 'GOMEMLIMIT', '128MiB',
    '--setenv', 'NODE_NO_WARNINGS', '1', '--chdir', '/workspace', '--', ...input.command,
  ];
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.WP_EVALUATION_PRLIMIT_COMMAND ?? 'prlimit', args, {
      env: { PATH: process.env.PATH, ...bundledLibraryEnvironment() }, detached: true, stdio: ['ignore', 'pipe', 'pipe'], shell: false,
    });
    let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0);
    let timedOut = false, outputLimitExceeded = false, cancelled = false;
    const kill = () => { if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already reaped */ } } };
    const append = (current: Buffer<ArrayBufferLike>, chunk: Buffer<ArrayBufferLike>) => {
      const remaining = Math.max(0, maxOutputBytes - stdout.length - stderr.length);
      if (chunk.length > remaining) { outputLimitExceeded = true; kill(); }
      return Buffer.concat([current, chunk.subarray(0, remaining)]);
    };
    child.stdout.on('data', (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr.on('data', (chunk: Buffer) => { stderr = append(stderr, chunk); });
    const timer = setTimeout(() => { timedOut = true; kill(); }, input.timeoutMs);
    const abort = () => { cancelled = true; kill(); };
    signal?.addEventListener('abort', abort, { once: true });
    // 覆盖 spawn 与监听器注册之间的取消竞态。
    if (signal?.aborted) abort();
    child.once('error', (error) => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      reject(new Error(`PROJECT_ISOLATION_UNAVAILABLE: ${error.message}`));
    });
    child.once('close', (exitCode) => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (cancelled) { reject(new Error('PROJECT_EVALUATION_CANCELLED')); return; }
      resolve({ exitCode, timedOut, outputLimitExceeded, durationMs: Date.now() - startedAt,
        stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8') });
    });
  });
}

function commandResult(result: ProcessResult, input: {
  purpose: 'check' | 'test'; args: string[]; attempt: number; passed?: boolean;
}): ProjectCommandResult {
  return { ...result, phase: 'gate', tool: input.purpose === 'check' ? 'typescript' : 'node', purpose: input.purpose, args: input.args,
    attempt: input.attempt, cwd: '.', testCountsParsed: input.purpose === 'test',
    testsPassed: input.passed ? 1 : 0, testsTotal: input.purpose === 'test' ? 1 : 0 };
}

/** 读取固定 Git 对象同样响应取消，不能让同步子进程拖延整次飞轮预算。 */
async function readReferenceSource(input: ModuleEvaluationInput, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) throw new Error('PROJECT_EVALUATION_CANCELLED');
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['--no-replace-objects', 'show', `${input.snapshot.commit}:${input.moduleSuite.modulePath}`], {
      cwd: input.snapshot.repositoryRoot, env: { PATH: process.env.PATH, ...bundledLibraryEnvironment() }, shell: false,
      detached: true, stdio: ['ignore', 'pipe', 'ignore'],
    });
    let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let cancelled = false, failed = false;
    const kill = () => { if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already exited */ } } };
    child.stdout.on('data', (chunk: Buffer) => {
      if (stdout.length + chunk.length > 1_048_576) { failed = true; kill(); return; }
      stdout = Buffer.concat([stdout, chunk]);
    });
    const timer = setTimeout(() => { failed = true; kill(); }, 10_000);
    const abort = () => { cancelled = true; kill(); };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    child.once('error', () => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      reject(new Error('PROJECT_SOURCE_MISSING'));
    });
    child.once('close', (code) => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (cancelled) reject(new Error('PROJECT_EVALUATION_CANCELLED'));
      else if (failed || code !== 0) reject(new Error('PROJECT_SOURCE_MISSING'));
      else resolve(stdout.toString('utf8'));
    });
  });
}

/** 固定提交只读取授权单文件；参考实现永远不会进入生成实现的进程视野。 */
async function moduleSource(artifacts: ArtifactStore, input: ModuleEvaluationInput, signal?: AbortSignal): Promise<string> {
  if (!await artifacts.verify(input.snapshot.manifestRef)) throw new Error('PROJECT_SNAPSHOT_INVALID');
  const manifest = JSON.parse(Buffer.from(await artifacts.get(input.snapshot.manifestRef)).toString('utf8'));
  const expected = manifest.files?.find((file: { path: string }) => file.path === input.moduleSuite.modulePath);
  if (manifest.commit !== input.snapshot.commit || !expected) throw new Error('PROJECT_SNAPSHOT_MISMATCH');
  if (input.generatedFiles.length) {
    if (input.generatedFiles.length !== 1 || input.generatedFiles[0]?.path !== input.moduleSuite.modulePath) {
      throw new Error('PROJECT_PATH_DENIED: module evaluation requires the exact generated module');
    }
    return input.generatedFiles[0].content;
  }
  if (!/^[0-9a-f]{40}$/i.test(input.snapshot.commit)) throw new Error('PROJECT_COMMIT_INVALID');
  const source = await readReferenceSource(input, signal);
  if (expected.sha256 !== hash(source)) throw new Error('PROJECT_SNAPSHOT_MISMATCH');
  return source;
}

/** 独立模块的确定性评测：受信编译，五次重复，宿主比较结果并持久化完整失败证据。 */
export async function evaluateModuleSuite(artifacts: ArtifactStore, input: ModuleEvaluationInput, signal?: AbortSignal): Promise<ProjectEvaluation> {
  if (signal?.aborted) throw new Error('PROJECT_EVALUATION_CANCELLED');
  // 排队前冻结参数，等待外部进程槽期间也不能被调用方换掉预期值或公开签名。
  const request = structuredClone(input);
  // 所有飞轮共享外部重进程槽，编译、案例执行与模型进程不能在小内存 ECS 上互相叠加。
  try { return await modelProcessLane.execute(() => evaluateInProcessLane(artifacts, request, signal), signal); }
  catch (error) {
    if (signal?.aborted) throw new Error('PROJECT_EVALUATION_CANCELLED');
    throw error;
  }
}

async function evaluateInProcessLane(artifacts: ArtifactStore, input: ModuleEvaluationInput, signal?: AbortSignal): Promise<ProjectEvaluation> {
  assertModuleBehaviorSuite(input.moduleSuite, input.snapshot.sourcePaths);
  const suite = structuredClone(input.moduleSuite);
  input = { ...input, moduleSuite: suite, generatedFiles: structuredClone(input.generatedFiles) };
  if (input.moduleContract && (input.moduleContract.modulePath !== suite.modulePath
    || input.moduleContract.exportName !== suite.exportName || input.moduleContract.signature.length > 8192)) {
    throw new Error('PROJECT_MODULE_CONTRACT_INVALID');
  }
  if (signal?.aborted) throw new Error('PROJECT_EVALUATION_CANCELLED');
  const source = await moduleSource(artifacts, input, signal);
  if (Buffer.byteLength(source) > 262_144) throw new Error('PROJECT_SOURCE_TOO_LARGE');
  const temporary = mkdtempSync(join(tmpdir(), 'wp-module-eval-'));
  const workspace = join(temporary, 'workspace');
  const runtimeWorkspace = join(temporary, 'runtime');
  const extension = suite.modulePath.endsWith('.ts') ? '.ts' : '.mjs';
  const modulePath = '/workspace/implementation.mjs';
  const results: ProjectCommandResult[] = [];
  const caseResults: { caseId: string; description: string; attempt: number; passed: boolean; expected: unknown; actual?: unknown; error?: string }[] = [];
  const generatedFileDigests = input.generatedFiles.length ? { [suite.modulePath]: hash(source) } : {};
  try {
    mkdirSync(workspace);
    mkdirSync(runtimeWorkspace);
    mkdirSync(join(workspace, 'build'));
    writeFileSync(join(workspace, `implementation${extension}`), source);
    writeFileSync(join(runtimeWorkspace, 'runner.mjs'), runner);
    writeFileSync(join(workspace, 'package.json'), '{"type":"module"}');
    const compilerRoot = dirname(fileURLToPath(import.meta.resolve(`@typescript/typescript-${process.platform}-${process.arch}/package.json`))) + '/lib';
    if (!existsSync(join(compilerRoot, 'tsc'))) throw new Error('PROJECT_TOOL_UNAVAILABLE: bundled TypeScript compiler');
    const files = [`implementation${extension}`];
    if (input.moduleContract) {
      writeFileSync(join(workspace, 'contract.d.ts'), input.moduleContract.signature);
      writeFileSync(join(workspace, 'contract-check.ts'), `import * as implementation from './implementation${extension}';\nimport type * as contract from './contract.d.ts';\nconst conforms: typeof contract = implementation;\nvoid conforms;\n`);
      files.push('contract-check.ts', 'contract.d.ts');
    }
    writeFileSync(join(workspace, 'tsconfig.json'), JSON.stringify({ files, compilerOptions: {
      target: 'es2022', module: 'nodenext', strict: true, noEmitOnError: true, outDir: './build', skipLibCheck: true,
      rewriteRelativeImportExtensions: true, erasableSyntaxOnly: true, types: [], allowJs: true, checkJs: true,
    } }));
    // 忽略指令会绕过编译门禁。它们可出现在注释中，仍不能在候选实现中启用。
    const bypass = /@ts-(?:nocheck|ignore|expect-error)\b/.test(source);
    const build = bypass ? { exitCode: 1, timedOut: false, outputLimitExceeded: false, durationMs: 0,
      stdout: '', stderr: 'PROJECT_TYPECHECK_BYPASS_DENIED' } : await captureIsolated({
      workspace, compilerRoot, buildOutput: join(workspace, 'build'), command: ['/compiler/tsc', '--project', '/workspace/tsconfig.json'],
      timeoutMs: 30_000, memoryBytes: 2_147_483_648,
    }, signal);
    results.push(commandResult(build, { purpose: 'check', args: ['typescript', '--strict', '--noEmitOnError', '--project', 'tsconfig.json'], attempt: 1 }));
    const compiledPath = join(workspace, 'build', extension === '.ts' ? 'implementation.js' : 'implementation.mjs');
    const buildPassed = build.exitCode === 0 && !build.timedOut && !build.outputLimitExceeded && existsSync(compiledPath);
    if (buildPassed) {
      // 执行视野仅含已通过类型门禁的 JS 和受信 runner，无参考源码、编译器、签名材料或任何预期值。
      writeFileSync(join(runtimeWorkspace, 'implementation.mjs'), readFileSync(compiledPath));
      for (let attempt = 1; attempt <= repetitions; attempt += 1) {
        for (const item of suite.cases) {
          const captured = await captureIsolated({ workspace: runtimeWorkspace, command: [
            '/runtime-node', '--jitless', '--max-old-space-size=64', '--permission', '--allow-fs-read=/workspace',
            '--experimental-vm-modules', '/workspace/runner.mjs', modulePath, suite.exportName, JSON.stringify(item.args),
          ], timeoutMs: 5_000, memoryBytes: 1_073_741_824 }, signal);
          let actual: unknown, error: string | undefined;
          try {
            const parsed = JSON.parse(captured.stdout);
            if (!parsed || typeof parsed !== 'object' || Object.keys(parsed).length !== 1 || !Object.hasOwn(parsed, 'value')) throw new Error('MODULE_RESULT_INVALID');
            actual = parsed.value;
          } catch { error = 'MODULE_RESULT_INVALID'; }
          const passed = captured.exitCode === 0 && !captured.timedOut && !captured.outputLimitExceeded
            && !error && isDeepStrictEqual(actual, item.expected);
          // stdout 是实际 JSON 返回值；通过数由这里计算，绝不解析被测代码的 TAP 或自评文字。
          results.push(commandResult(captured, { purpose: 'test', args: ['module-case', item.caseId], attempt, passed }));
          caseResults.push({ caseId: item.caseId, description: item.description, attempt, passed, expected: item.expected,
            ...(error ? { error } : { actual }) });
          if (!passed) break;
        }
        if (caseResults.some((item) => !item.passed)) break;
      }
    }
    const testsPassed = caseResults.filter((item) => item.passed).length;
    const testsTotal = suite.cases.length * repetitions;
    const passed = buildPassed && testsPassed === testsTotal && caseResults.length === testsTotal;
    const infrastructureFailure = results.some((result) => result.exitCode === null || result.timedOut || result.outputLimitExceeded
      || /bwrap:|prlimit:|failed to reserve|out of memory|cannot allocate memory/i.test(result.stderr));
    const toolchain = { node: process.version, nodeSha256: await fileDigest(realpathSync(process.execPath)),
      typescriptSha256: await fileDigest(join(compilerRoot, 'tsc')), runnerSha256: hash(runner),
      isolation: 'linux-bwrap-unshare-all-node-permission-vm-v1', processMemoryBytes: 1_073_741_824,
      heapMiB: 64, compilerMemoryBytes: 2_147_483_648, maxConcurrentProcesses: 1 };
    const stability = testsTotal ? testsPassed / testsTotal : 0;
    const evidence = { schemaVersion: 'module-evaluation-v1', label: input.label, commit: input.snapshot.commit,
      modulePath: suite.modulePath, exportName: suite.exportName, sourceSha256: hash(source),
      suiteSha256: hash(JSON.stringify(suite)), sourceManifestRef: input.snapshot.manifestRef,
      mode: input.generatedFiles.length ? 'generated' : 'reference',
      toolchain, toolchainFingerprint: `sha256:${hash(JSON.stringify(toolchain))}`,
      generatedFileDigests, passed, testsPassed, testsTotal, stability, infrastructureFailure, results, caseResults };
    if (signal?.aborted) throw new Error('PROJECT_EVALUATION_CANCELLED');
    const evidenceRef = await artifacts.put(Buffer.from(JSON.stringify(evidence, null, 2)), 'application/json');
    return { label: input.label, commit: input.snapshot.commit, passed, testsPassed, testsTotal, stability,
      infrastructureFailure, toolchainFingerprint: evidence.toolchainFingerprint, generatedFileDigests, results, evidenceRef };
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}
