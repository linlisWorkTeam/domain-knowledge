#!/usr/bin/env node
/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：使用已验证运行配置按原始三次及显式追加授权执行真实 MVP 飞轮并持久化脱敏验收证据。
 */
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createComposition } from '../../src/interfaces/runner/Composition.ts';
import { createMarkdownLiteScenario, MARKDOWN_LITE_BASELINE } from '../../src/infrastructure/evaluation/markdownLite/MarkdownLiteScenario.ts';
import { ROLE_EXECUTION_VERSION } from '../../src/domain/agents/AgentExecution.ts';

export interface AcceptanceOptions { source: string; runtime: string; evidence: string; authorization?: string; }
export interface AcceptanceSummary {
  gates: Array<{ outcome: string; testsPassed: number; testsTotal: number; criticalFailures: number; toolchainFingerprint: string; evidenceRefs: string[] }>;
  publications: Array<{ publicationKey: string; versionId: string; path: string; bodySha256: string }>;
  completedRoles: string[];
}
/** 测试可注入受控端口，真实入口始终使用 Composition 的同一生产飞轮。 */
export interface AcceptanceBackend {
  preflight(source: string): Promise<void>;
  start(source: string): Promise<{ runId: string }>;
  wait(runId: string): Promise<{ executionStatus: string; route?: string | null; error?: string | null }>;
  cancel(runId: string): Promise<void>;
  summarize(runId: string): Promise<AcceptanceSummary>;
  close(): void | Promise<void>;
}
export interface AcceptanceReport extends AcceptanceSummary {
  schemaVersion: 'mvp-real-acceptance-v1';
  attempt: number; runId: string | null; outcome: 'PASSED' | 'FAILED' | 'CANCELLED'; reasonCode: string;
  provider: 'deepseek-harness'; model: 'deepseek-v4-flash'; roleExecutionVersion: string;
  source: typeof MARKDOWN_LITE_BASELINE; startedAt: string; completedAt: string; reportPath: string;
}
interface Attempt { ordinal: number; startedAt: string; status: 'STARTING' | 'RUNNING' | 'PASSED' | 'FAILED' | 'CANCELLED'; runId?: string; reportPath?: string; }
interface AdditionalAuthorization { authorizationId: string; approvedAt: string; previousLedgerSha256: string; maximumAttempts: 4; }
interface Ledger { schemaVersion: 'mvp-real-attempts-v1' | 'mvp-real-attempts-v2'; attempts: Attempt[];
  authorization?: AdditionalAuthorization & { originalAttemptsSha256: string }; }
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
function validAuthorization(value: AdditionalAuthorization): boolean {
  return !!value && typeof value.authorizationId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value.authorizationId)
    && typeof value.approvedAt === 'string' && Number.isFinite(Date.parse(value.approvedAt))
    && /^[a-f0-9]{64}$/.test(value.previousLedgerSha256) && value.maximumAttempts === 4;
}
/** 只支持本次显式追加的一次启动；摘要绑定原账本，不能删旧记录或自动扩容。 */
function authorizeAdditionalAttempt(ledger: Ledger, ledgerPath: string, authorizationPath?: string): Ledger {
  if (!authorizationPath) return ledger;
  let authorization: AdditionalAuthorization;
  try { authorization = JSON.parse(readFileSync(authorizationPath, 'utf8')); } catch { throw new Error('ACCEPTANCE_AUTHORIZATION_INVALID'); }
  if (!validAuthorization(authorization) || Object.keys(authorization).sort().join(',') !== 'approvedAt,authorizationId,maximumAttempts,previousLedgerSha256') throw new Error('ACCEPTANCE_AUTHORIZATION_INVALID');
  if (ledger.schemaVersion === 'mvp-real-attempts-v2') {
    if (Object.keys(authorization).some((key) => authorization[key as keyof AdditionalAuthorization] !== ledger.authorization?.[key as keyof AdditionalAuthorization])) throw new Error('ACCEPTANCE_AUTHORIZATION_INVALID');
    return ledger;
  }
  if (ledger.attempts.length !== 3 || digest(readFileSync(ledgerPath, 'utf8')) !== authorization.previousLedgerSha256) throw new Error('ACCEPTANCE_AUTHORIZATION_INVALID');
  const next: Ledger = { schemaVersion: 'mvp-real-attempts-v2', attempts: ledger.attempts,
    authorization: { ...authorization, originalAttemptsSha256: digest(JSON.stringify(ledger.attempts)) } };
  atomicJson(ledgerPath, next);
  return next;
}
const reasons = new Set(['ACCEPTANCE_LOCKED', 'ACCEPTANCE_LEDGER_INVALID', 'ACCEPTANCE_LIMIT_REACHED',
  'ACCEPTANCE_ARGUMENT_INVALID', 'ACCEPTANCE_AUTHORIZATION_INVALID', 'ACCEPTANCE_PROVIDER_REQUIRED', 'ACCEPTANCE_MODEL_REQUIRED',
  'ACCEPTANCE_PUBLICATION_DIRECTORY_INVALID', 'ACCEPTANCE_CANCELLED', 'ACCEPTANCE_PUBLICATION_MISSING',
  'ACCEPTANCE_ROLE_COVERAGE_MISSING', 'DSH_CONFIGURATION_UNAVAILABLE', 'DSH_CONFIGURATION_CHANGED',
  'MODULE_BASELINE_MISMATCH', 'MODULE_ISOLATION_UNAVAILABLE', 'MODULE_ISOLATION_REQUIRED',
  'WORKFLOW_BUDGET_EXHAUSTED', 'WORKFLOW_ITERATION_BUDGET_EXHAUSTED', 'DSH_AGENT_TIMEOUT',
  'TEST_ORACLE_REJECTED', 'REFERENCE_GATE_FAILED', 'AGENT_OUTPUT_INVALID', 'AGENT_CANCELLED']);
/** 只公开固定错误码，不能把提供方异常中的 URL、token 或响应正文写到证据。 */
export function acceptanceReason(error: unknown): string {
  const code = error instanceof Error ? error.message.split(':', 1)[0] ?? '' : '';
  return reasons.has(code) ? code : 'ACCEPTANCE_FAILED';
}
function atomicJson(path: string, value: unknown): void {
  const temporary = `${path}.${randomUUID()}.tmp`;
  const fd = openSync(temporary, 'wx', 0o600);
  try { writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temporary, path);
  const directory = openSync(dirname(path), 'r');
  try { fsyncSync(directory); } finally { closeSync(directory); }
}
function loadLedger(path: string): Ledger {
  if (!existsSync(path)) return { schemaVersion: 'mvp-real-attempts-v1', attempts: [] };
  let value: Ledger;
  try { value = JSON.parse(readFileSync(path, 'utf8')); } catch { throw new Error('ACCEPTANCE_LEDGER_INVALID'); }
  if (!value || typeof value !== 'object' || !['mvp-real-attempts-v1', 'mvp-real-attempts-v2'].includes(value.schemaVersion) || !Array.isArray(value.attempts) || value.attempts.length > (value.schemaVersion === 'mvp-real-attempts-v2' ? 4 : 3)
    || value.attempts.some((attempt, index) => !attempt || typeof attempt !== 'object' || attempt.ordinal !== index + 1 || typeof attempt.startedAt !== 'string'
      || !['STARTING', 'RUNNING', 'PASSED', 'FAILED', 'CANCELLED'].includes(attempt.status))) throw new Error('ACCEPTANCE_LEDGER_INVALID');
  if (value.schemaVersion === 'mvp-real-attempts-v2' && (!validAuthorization(value.authorization!)
    || value.attempts.length < 3 || value.authorization?.originalAttemptsSha256 !== digest(JSON.stringify(value.attempts.slice(0, 3))))) throw new Error('ACCEPTANCE_LEDGER_INVALID');
  return value;
}
function processIdentity(pid: number): string | undefined {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
  } catch { return undefined; }
}
/** 独占文件锁跨进程生效；死进程锁仅在持有清理锁且再次核对身份后回收。 */
function acquireLock(path: string): () => void {
  const owner = { pid: process.pid, identity: processIdentity(process.pid), nonce: randomUUID() };
  const create = () => {
    const fd = openSync(path, 'wx', 0o600);
    try { writeFileSync(fd, JSON.stringify(owner)); fsyncSync(fd); } finally { closeSync(fd); }
  };
  const stale = () => {
    try {
      const current = JSON.parse(readFileSync(path, 'utf8')) as typeof owner;
      return Number.isSafeInteger(current.pid) && current.pid > 0 && typeof current.identity === 'string'
        && current.identity !== processIdentity(current.pid);
    } catch { return false; } // 不完整锁不能被猜测为死锁。
  };
  try { create(); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    if (!stale()) throw new Error('ACCEPTANCE_LOCKED');
    const recovery = `${path}.recovery`;
    let guard: number;
    try { guard = openSync(recovery, 'wx', 0o600); } catch { throw new Error('ACCEPTANCE_LOCKED'); }
    try {
      if (!stale()) throw new Error('ACCEPTANCE_LOCKED');
      unlinkSync(path);
      try { create(); } catch { throw new Error('ACCEPTANCE_LOCKED'); }
    } finally { closeSync(guard); unlinkSync(recovery); }
  }
  return () => {
    try { if (JSON.parse(readFileSync(path, 'utf8')).nonce === owner.nonce) unlinkSync(path); } catch { /* 锁丢失不能覆盖主错误。 */ }
  };
}
function futurePath(path: string): string {
  const target = resolve(path);
  let existing = target;
  while (!existsSync(existing)) existing = dirname(existing);
  return resolve(realpathSync(existing), relative(existing, target));
}
function contained(root: string, target: string): boolean {
  const suffix = relative(root, target);
  return suffix === '' || (suffix !== '..' && !suffix.startsWith('../') && !isAbsolute(suffix));
}

/** 本地预检不请求模型，也不写入验收计数。 */
function productionBackend(options: AcceptanceOptions): AcceptanceBackend {
  const composition = createComposition({ runtimeDir: options.runtime, repositoryRoot: options.source });
  const workflow = () => composition.automatedWorkflow();
  return {
    async preflight(source) {
      if ((process.env.WP_DSH_PROCESS_ISOLATION?.trim() || 'bubblewrap') !== 'bubblewrap') throw new Error('MODULE_ISOLATION_REQUIRED');
      const app = composition.apps.providerOperations;
      const settings = app.getSettings();
      if (settings.provider !== 'deepseek-harness' || !settings.enabled || settings.verification.status !== 'VERIFIED') {
        throw new Error('ACCEPTANCE_PROVIDER_REQUIRED');
      }
      if (settings.model !== 'deepseek-v4-flash') throw new Error('ACCEPTANCE_MODEL_REQUIRED');
      const provider = app.runConfigurationProvider({ kind: 'fixture', model: 'preflight-only', parametersSha256: '0'.repeat(64) });
      const runtime = app.requireRuntimeConfiguration(provider);
      if (runtime.settings.model !== 'deepseek-v4-flash') throw new Error('ACCEPTANCE_MODEL_REQUIRED');
      await createMarkdownLiteScenario(source);
      const directory = futurePath(composition.apps.publicationOperations.getSettings().directory);
      if (contained(source, directory) || contained(directory, source)) throw new Error('ACCEPTANCE_PUBLICATION_DIRECTORY_INVALID');
      composition.apps.publicationOperations.putSettings({ directory });
      await workflow();
    },
    async start(source) {
      const handle = await composition.apps.markdownLite.start(source);
      const provider = composition.runConfiguration.get(handle.runId)?.provider;
      if (provider?.kind !== 'deepseek-harness' || provider.model !== 'deepseek-v4-flash') {
        const engine = await workflow();
        await engine.cancel(handle.runId).catch(() => {});
        await engine.wait(handle.runId).catch(() => {});
        throw new Error('ACCEPTANCE_MODEL_REQUIRED');
      }
      return handle;
    },
    async wait(runId) { return (await workflow()).wait(runId); },
    async cancel(runId) { await (await workflow()).cancel(runId); },
    async summarize(runId) {
      const gates = composition.service.listKnowledgeVersions().flatMap((version) => {
        const result = composition.repository.getEvaluationAndDecision(runId, version.versionId);
        return result ? [{ outcome: result.decision.outcome, testsPassed: result.report.testsPassed,
          testsTotal: result.report.testsTotal, criticalFailures: result.report.criticalFailures,
          toolchainFingerprint: result.report.toolchainFingerprint,
          evidenceRefs: result.report.evidenceRefs.map((ref) => ref.artifactId) }] : [];
      });
      const publications = composition.apps.publicationOperations.list().filter((item) => item.runId === runId && item.status === 'PUBLISHED')
        .map((item) => {
          composition.apps.publicationOperations.get(item.publicationKey); // 核对文件仍匹配已发布正文和来源。
          return { publicationKey: item.publicationKey, versionId: item.versionId, path: item.path, bodySha256: item.bodySha256 };
        });
      const completedRoles = [...new Set(composition.repository.listWorkflowNodeProjections(runId)
        .filter((item) => item.status === 'COMPLETED' && item.agentId).map((item) => item.agentId!))].sort();
      return { gates, publications, completedRoles };
    },
    async close() { try { await composition.shutdown(); } finally { composition.close(); } },
  };
}

/** 预检通过后先持久化启动占额；启动失败、取消和进程中断都不能返还已消耗次数。 */
export async function runMvpAcceptance(options: AcceptanceOptions, input: {
  backend?: () => AcceptanceBackend; signal?: AbortSignal; now?: () => string;
} = {}): Promise<AcceptanceReport> {
  const normalized = { source: realpathSync(resolve(options.source)), runtime: futurePath(options.runtime), evidence: futurePath(options.evidence) };
  if ([normalized.runtime, normalized.evidence].some((path) => contained(normalized.source, path) || contained(path, normalized.source))) {
    throw new Error('ACCEPTANCE_PUBLICATION_DIRECTORY_INVALID');
  }
  mkdirSync(normalized.runtime, { recursive: true, mode: 0o700 });
  normalized.runtime = realpathSync(normalized.runtime);
  const release = acquireLock(join(normalized.runtime, 'MvpAcceptance.lock'));
  const ledgerPath = join(normalized.runtime, 'MvpAcceptanceLedger.json');
  const now = input.now ?? (() => new Date().toISOString());
  let backend: AcceptanceBackend | undefined;
  let runId: string | undefined;
  let cancellation: Promise<void> | undefined;
  const cancel = () => {
    if (backend && runId && !cancellation) cancellation = backend.cancel(runId).catch(() => {});
  };
  try {
    const ledger = authorizeAdditionalAttempt(loadLedger(ledgerPath), ledgerPath, options.authorization);
    if (ledger.attempts.length >= (ledger.schemaVersion === 'mvp-real-attempts-v2' ? 4 : 3)) throw new Error('ACCEPTANCE_LIMIT_REACHED');
    backend = (input.backend ?? (() => productionBackend(normalized)))();
    await backend.preflight(normalized.source);
    if (input.signal?.aborted) throw new Error('ACCEPTANCE_CANCELLED');
    mkdirSync(normalized.evidence, { recursive: true, mode: 0o700 });
    const reportPath = join(normalized.evidence, `MvpAcceptance-${ledger.attempts.length + 1}.json`);
    if (existsSync(reportPath)) throw new Error('ACCEPTANCE_ARGUMENT_INVALID');
    const probe = join(normalized.evidence, `.write-check-${randomUUID()}`);
    const probeFd = openSync(probe, 'wx', 0o600);
    try { fsyncSync(probeFd); } finally { closeSync(probeFd); unlinkSync(probe); }
    const attempt: Attempt = { ordinal: ledger.attempts.length + 1, startedAt: now(), status: 'STARTING' };
    ledger.attempts.push(attempt);
    atomicJson(ledgerPath, ledger); // 必须先落盘，之后才允许启动真实模型链路。
    input.signal?.addEventListener('abort', cancel, { once: true });
    let summary: AcceptanceSummary = { gates: [], publications: [], completedRoles: [] };
    let outcome: AcceptanceReport['outcome'] = 'FAILED';
    let reasonCode = 'ACCEPTANCE_FAILED';
    try {
      runId = (await backend.start(normalized.source)).runId;
      attempt.runId = runId; attempt.status = 'RUNNING'; atomicJson(ledgerPath, ledger);
      if (input.signal?.aborted) cancel();
      const view = await backend.wait(runId);
      if (cancellation) await cancellation;
      summary = await backend.summarize(runId);
      if (input.signal?.aborted || view.executionStatus === 'CANCELLED') {
        outcome = 'CANCELLED'; reasonCode = 'ACCEPTANCE_CANCELLED';
      } else if (view.executionStatus === 'COMPLETED' && view.route === 'PASS' && summary.gates.some((gate) => gate.outcome === 'PASS')) {
        if (!summary.publications.length) throw new Error('ACCEPTANCE_PUBLICATION_MISSING');
        if (['orchestrator', 'doc-worker', 'doc-gen', 'test-gen', 'code', 'check', 'review'].some((role) => !summary.completedRoles.includes(role))) {
          throw new Error('ACCEPTANCE_ROLE_COVERAGE_MISSING');
        }
        outcome = 'PASSED'; reasonCode = 'ALL_DETERMINISTIC_GATES_PASSED';
      } else reasonCode = acceptanceReason(new Error(view.error ?? ''));
    } catch (error) {
      cancel();
      if (cancellation) await cancellation;
      if (runId) {
        await backend.wait(runId).catch(() => {});
        summary = await backend.summarize(runId).catch(() => summary);
      }
      outcome = input.signal?.aborted ? 'CANCELLED' : 'FAILED';
      reasonCode = outcome === 'CANCELLED' ? 'ACCEPTANCE_CANCELLED' : acceptanceReason(error);
    }
    const report: AcceptanceReport = { schemaVersion: 'mvp-real-acceptance-v1', attempt: attempt.ordinal,
      runId: runId ?? null, outcome, reasonCode, provider: 'deepseek-harness', model: 'deepseek-v4-flash',
      roleExecutionVersion: ROLE_EXECUTION_VERSION, source: MARKDOWN_LITE_BASELINE,
      startedAt: attempt.startedAt, completedAt: now(), reportPath, ...summary };
    attempt.status = outcome; attempt.reportPath = reportPath;
    atomicJson(ledgerPath, ledger);
    atomicJson(reportPath, report);
    return report;
  } finally {
    input.signal?.removeEventListener('abort', cancel);
    if (cancellation) await cancellation;
    try { await backend?.close(); } finally { release(); }
  }
}

/** CLI 接受三个目录及可选的追加授权文件，凭据始终由运行配置提供。 */
export function parseAcceptanceArguments(args: string[]): AcceptanceOptions {
  const values: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]; const value = args[index + 1];
    if (!name || !['--source', '--runtime', '--evidence', '--authorization'].includes(name) || !value || value.startsWith('--') || values[name]) {
      throw new Error('ACCEPTANCE_ARGUMENT_INVALID');
    }
    values[name] = value;
  }
  if (!values['--source'] || !values['--runtime'] || !values['--evidence']) throw new Error('ACCEPTANCE_ARGUMENT_INVALID');
  return { source: values['--source'], runtime: values['--runtime'], evidence: values['--evidence'], ...values['--authorization'] ? { authorization: values['--authorization'] } : {} };
}

const direct = process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url;
if (direct) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  try {
    const report = await runMvpAcceptance(parseAcceptanceArguments(process.argv.slice(2)), { signal: controller.signal });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = report.outcome === 'PASSED' ? 0 : report.outcome === 'CANCELLED' ? 130 : 1;
  } catch (error) {
    process.stderr.write(`${acceptanceReason(error)}\n`);
    process.exitCode = 1;
  } finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); }
}
