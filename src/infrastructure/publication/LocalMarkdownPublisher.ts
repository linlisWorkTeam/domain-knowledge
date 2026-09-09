/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：用 SQLite 发布日志、原子目录和独立 Git 仓库持久化 Markdown。
 */
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import {
  chmodSync, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync,
  readdirSync, realpathSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type {
  LocalPublicationInput, LocalPublicationPort, LocalPublicationReceipt, PublicationSettings,
} from '../../application/ports/PublicationPorts.ts';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const marker = '.knowledge-publications';
function inside(root: string, path: string): boolean {
  const suffix = relative(root, path);
  return suffix === '' || (suffix !== '..' && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix));
}
function durable(path: string, content: string): void {
  const handle = openSync(path, 'wx', 0o600);
  try { writeFileSync(handle, content); fsyncSync(handle); } finally { closeSync(handle); }
}
function syncDirectory(path: string): void {
  const handle = openSync(path, 'r');
  try { fsyncSync(handle); } finally { closeSync(handle); }
}

/** 单个服务进程内串行提交；SQLite 持久日志让重启恢复保持幂等。 */
export class LocalMarkdownPublisher implements LocalPublicationPort {
  private readonly database: DatabaseSync;
  private readonly runtimeDir: string;
  private readonly directoryRoots: string[];
  private readonly excludedRoots: string[];
  private readonly allowLocalRemotes: boolean;
  private syncing = false;
  constructor(input: { runtimeDir: string; defaultDirectory?: string; directoryRoots?: string[]; excludedRoots?: string[]; allowLocalRemotes?: boolean }) {
    this.runtimeDir = resolve(input.runtimeDir);
    mkdirSync(this.runtimeDir, { recursive: true, mode: 0o700 });
    this.directoryRoots = (input.directoryRoots ?? [dirname(this.runtimeDir)]).map((path) => realpathSync(path));
    this.excludedRoots = (input.excludedRoots ?? []).map((path) => resolve(path));
    this.allowLocalRemotes = input.allowLocalRemotes ?? false;
    this.database = new DatabaseSync(join(this.runtimeDir, 'publications.sqlite'));
    chmodSync(join(this.runtimeDir, 'publications.sqlite'), 0o600);
    this.database.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS publication_settings (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS local_publications_v1 (
        publication_key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, input_json TEXT NOT NULL,
        receipt_json TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('PENDING','PUBLISHED'))
      );`);
    if (!this.database.prepare('SELECT id FROM publication_settings WHERE id=1').get()) {
      const directory = resolve(input.defaultDirectory ?? join(this.runtimeDir, 'knowledge'));
      this.database.prepare('INSERT INTO publication_settings VALUES (1, ?)').run(JSON.stringify({ directory, git: { enabled: false, remote: '', branch: 'main', token: '' } }));
    }
  }
  private rawSettings(): { directory: string; git: { enabled: boolean; remote: string; branch: string; token: string } } {
    return JSON.parse(String(this.database.prepare('SELECT json FROM publication_settings WHERE id=1').get()!.json));
  }
  /** 返回经过脱敏的设置。 */
  getSettings(): PublicationSettings {
    const raw = this.rawSettings();
    return { directory: raw.directory, git: { enabled: raw.git.enabled, remote: raw.git.remote, branch: raw.git.branch, tokenConfigured: Boolean(raw.git.token) } };
  }
  private checkedDirectory(path: string): string {
    if (!isAbsolute(path) || /[\0\r\n]/.test(path)) throw new Error('DIRECTORY_INVALID: absolute server directory required');
    const resolved = resolve(path);
    let existing = resolved;
    while (!existsSync(existing)) existing = dirname(existing);
    const canonical = resolve(realpathSync(existing), relative(existing, resolved));
    if (!this.directoryRoots.some((root) => inside(root, canonical))) throw new Error('DIRECTORY_DENIED: outside allowed server roots');
    return canonical;
  }
  private publicationDirectory(path: string): string {
    const directory = this.checkedDirectory(path);
    if (this.excludedRoots.some((root) => inside(root, directory) || inside(directory, root))) {
      throw new Error('DIRECTORY_DENIED: knowledge must use a separate directory from project sources');
    }
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (!existsSync(join(directory, marker))) {
      if (readdirSync(directory).length) throw new Error('DIRECTORY_DENIED: choose an empty knowledge directory');
      durable(join(directory, marker), 'domain-knowledge local publication store v1\n');
    } else if (lstatSync(join(directory, marker)).isSymbolicLink()) {
      throw new Error('DIRECTORY_DENIED: symbolic publication marker');
    }
    return directory;
  }
  /** 配置只接受隔离知识目录；认证仅保存到权限受限的运行数据库。 */
  putSettings(input: Parameters<LocalPublicationPort['putSettings']>[0]): PublicationSettings {
    if (this.syncing) throw new Error('SYNC_IN_PROGRESS: wait for the active synchronization');
    const next = this.rawSettings();
    if (input.directory !== undefined) next.directory = this.publicationDirectory(input.directory);
    if (input.git) {
      const git = input.git;
      if (typeof git.enabled !== 'boolean' || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(git.branch)
        || /\.\.|\/\/|\.lock(?:\/|$)|\/$/.test(git.branch)) throw new Error('GIT_SETTINGS_INVALID: invalid branch');
      if (git.remote && !/^https:\/\/[^\s]+$/.test(git.remote)
        && !/^ssh:\/\/[^\s]+$/.test(git.remote)
        && !(this.allowLocalRemotes && isAbsolute(git.remote))) throw new Error('GIT_SETTINGS_INVALID: use HTTPS or SSH repository URL');
      if (git.remote.startsWith('https://')) {
        const url = new URL(git.remote);
        if (url.username || url.password || url.search || url.hash) throw new Error('GIT_SETTINGS_INVALID: credentials belong in the token field');
      }
      if (git.enabled && !git.remote) throw new Error('GIT_SETTINGS_INVALID: remote required');
      next.git = { enabled: git.enabled, remote: git.remote, branch: git.branch, token: git.clearToken ? '' : git.token || next.git.token };
    }
    this.database.prepare('UPDATE publication_settings SET json=? WHERE id=1').run(JSON.stringify(next));
    return this.getSettings();
  }
  /** 在写文件之前提交持久 outbox，重试保留同一正文、路径与时间。 */
  async publish(input: LocalPublicationInput): Promise<LocalPublicationReceipt> {
    if (!input.publicationKey || !input.gateDecisionId || !input.evidenceRefs.length || !input.body.trim()) throw new Error('PUBLICATION_EVIDENCE_REQUIRED');
    const fingerprint = digest(JSON.stringify(input));
    const old = this.database.prepare('SELECT * FROM local_publications_v1 WHERE publication_key=?').get(input.publicationKey);
    if (old) {
      if (old.fingerprint !== fingerprint) throw new Error('PUBLICATION_CONFLICT: publication key is bound to different content');
      return this.complete(input, JSON.parse(String(old.receipt_json)));
    }
    const directory = this.publicationDirectory(this.rawSettings().directory);
    const receipt: LocalPublicationReceipt = {
      schemaVersion: '1.0', publicationKey: input.publicationKey, versionId: input.versionId,
      runId: input.runId, moduleId: input.moduleId, bodySha256: digest(input.body),
      path: join(directory, digest(input.publicationKey), 'Knowledge.md'), status: 'PENDING', createdAt: new Date().toISOString(),
    };
    this.database.prepare('INSERT INTO local_publications_v1 VALUES (?, ?, ?, ?, ?)')
      .run(input.publicationKey, fingerprint, JSON.stringify(input), JSON.stringify(receipt), 'PENDING');
    return this.complete(input, receipt);
  }
  private complete(input: LocalPublicationInput, receipt: LocalPublicationReceipt): LocalPublicationReceipt {
    const target = dirname(receipt.path);
    const root = this.publicationDirectory(dirname(target));
    const metadata = { schemaVersion: '1.0', ...input, body: undefined, bodySha256: receipt.bodySha256, createdAt: receipt.createdAt };
    const markdown = `${input.body.trimEnd()}\n\n---\n\n来源提交：${input.sourceCommit}\n\n来源摘要：${input.sourceDigest}\n\n运行：${input.runId} · 版本：${input.versionId} · 门禁：${input.gateDecisionId}\n`;
    const metadataText = `${JSON.stringify(metadata, null, 2)}\n`;
    if (existsSync(target)) {
      if (lstatSync(target).isSymbolicLink() || lstatSync(receipt.path).isSymbolicLink()
        || lstatSync(join(target, 'Provenance.json')).isSymbolicLink()
        || readFileSync(receipt.path, 'utf8') !== markdown
        || readFileSync(join(target, 'Provenance.json'), 'utf8') !== metadataText) throw new Error('PUBLICATION_CONFLICT: published files changed');
    } else {
      const temporary = join(root, `.pending-${randomUUID()}`);
      mkdirSync(temporary, { mode: 0o700 });
      try {
        durable(join(temporary, 'Knowledge.md'), markdown);
        durable(join(temporary, 'Provenance.json'), metadataText);
        syncDirectory(temporary);
        renameSync(temporary, target);
        syncDirectory(root);
      } finally { if (existsSync(temporary)) rmSync(temporary, { recursive: true }); }
    }
    const published = { ...receipt, status: 'PUBLISHED' as const };
    this.database.prepare('UPDATE local_publications_v1 SET status=?, receipt_json=? WHERE publication_key=?')
      .run('PUBLISHED', JSON.stringify(published), input.publicationKey);
    return published;
  }
  /** 仅恢复已有授权日志，不推断候选是否通过门禁。 */
  async recover(): Promise<LocalPublicationReceipt[]> {
    return this.database.prepare("SELECT * FROM local_publications_v1 WHERE status='PENDING'").all()
      .map((row) => this.complete(JSON.parse(String(row.input_json)), JSON.parse(String(row.receipt_json))));
  }
  /** 返回包含待恢复状态的审计列表。 */
  list(): LocalPublicationReceipt[] {
    return this.database.prepare('SELECT receipt_json FROM local_publications_v1 ORDER BY rowid DESC').all()
      .map((row) => JSON.parse(String(row.receipt_json)));
  }
  /** 正文与元数据都来自同一发布目录。 */
  get(publicationKey: string): ReturnType<LocalPublicationPort['get']> {
    const row = this.database.prepare('SELECT * FROM local_publications_v1 WHERE publication_key=?').get(publicationKey);
    if (!row) throw new Error('PUBLICATION_NOT_FOUND');
    const receipt: LocalPublicationReceipt = JSON.parse(String(row.receipt_json));
    if (receipt.status !== 'PUBLISHED') throw new Error('PUBLICATION_PENDING: retry publication recovery');
    const input: LocalPublicationInput = JSON.parse(String(row.input_json));
    this.complete(input, receipt);
    return { receipt, markdown: readFileSync(receipt.path, 'utf8'), metadata: input };
  }
  /** 目录枚举限制在明确授权的服务器根目录，拒绝符号链接逃逸。 */
  listDirectories(path?: string): ReturnType<LocalPublicationPort['listDirectories']> {
    const directory = this.checkedDirectory(path || this.directoryRoots[0]!);
    const parent = dirname(directory);
    return { path: directory, parent: this.directoryRoots.some((root) => inside(root, parent)) ? parent : null,
      directories: readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map((entry) => join(directory, entry.name)).sort().slice(0, 200) };
  }
  private git(args: string[], cwd: string, token: string, acceptFailure = false): Promise<string> {
    return new Promise((resolveResult, reject) => {
      const child = spawn('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'protocol.file.allow=' + (this.allowLocalRemotes ? 'always' : 'never'), ...args], {
        cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_ASKPASS: join(this.runtimeDir, 'GitAskpass.sh'), WP_PUBLICATION_GIT_TOKEN: token,
          GIT_AUTHOR_NAME: 'Domain Knowledge', GIT_AUTHOR_EMAIL: 'knowledge@localhost', GIT_COMMITTER_NAME: 'Domain Knowledge', GIT_COMMITTER_EMAIL: 'knowledge@localhost' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = ''; let error = ''; let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, 60_000);
      const hardTimer = setTimeout(() => child.kill('SIGKILL'), 65_000);
      child.stdout.on('data', (chunk) => { if (output.length < 2_000_000) output += chunk; });
      child.stderr.on('data', (chunk) => { if (error.length < 32_000) error += chunk; });
      child.once('error', () => { clearTimeout(timer); clearTimeout(hardTimer); reject(new Error('GIT_UNAVAILABLE: bundled Git could not start')); });
      child.once('close', (code) => {
        clearTimeout(timer); clearTimeout(hardTimer);
        if (code === 0 || (acceptFailure && !timedOut)) resolveResult(output.trim());
        else reject(new Error(timedOut ? 'GIT_TIMEOUT: synchronization exceeded 60 seconds'
          : /Authentication|Permission denied|could not read Username|403|401/i.test(error)
            ? 'GIT_AUTHENTICATION_FAILED: check repository access and credentials'
            : /rejected|non-fast-forward|diverg|conflict|Not possible to fast-forward/i.test(error)
              ? 'GIT_CONFLICT: remote changed; resolve in the dedicated knowledge repository and retry'
              : 'GIT_SYNC_FAILED: repository or network unavailable; local publications are preserved'));
      });
    });
  }
  /** Git 默认关闭；仅手动同步当前目录中已完成的发布，绝不强推。 */
  async sync(): Promise<{ status: 'SYNCED'; commit: string; publishedCount: number }> {
    if (this.syncing) throw new Error('SYNC_IN_PROGRESS');
    const settings = this.rawSettings();
    if (!settings.git.enabled) throw new Error('GIT_DISABLED: enable manual Git synchronization first');
    this.syncing = true;
    try {
      const directory = this.publicationDirectory(settings.directory);
      const askpass = join(this.runtimeDir, 'GitAskpass.sh');
      if (!existsSync(askpass)) { durable(askpass, '#!/bin/sh\ncase "$1" in *Username*) printf "%s\\n" "oauth2" ;; *) printf "%s\\n" "$WP_PUBLICATION_GIT_TOKEN" ;; esac\n'); chmodSync(askpass, 0o700); }
      const git = (args: string[], soft = false) => this.git(args, directory, settings.git.token, soft);
      if (!existsSync(join(directory, '.git'))) await git(['init', '-b', settings.git.branch]);
      if (lstatSync(join(directory, '.git')).isSymbolicLink() || !lstatSync(join(directory, '.git')).isDirectory()) throw new Error('DIRECTORY_DENIED: Git metadata must belong to the knowledge directory');
      if (await git(['rev-parse', '--show-toplevel']) !== realpathSync(directory)) throw new Error('DIRECTORY_DENIED: not an independent knowledge repository');
      const publications = this.list().filter((receipt) => receipt.status === 'PUBLISHED' && dirname(dirname(receipt.path)) === directory);
      const allowed = new Set([marker, ...publications.flatMap((receipt) => [relative(directory, receipt.path), relative(directory, join(dirname(receipt.path), 'Provenance.json'))])]);
      const tracked = (await git(['ls-files', '-z'])).split('\0').filter(Boolean);
      if (tracked.some((path) => !allowed.has(path))) throw new Error('GIT_UNRELATED_FILES_DENIED: repository tracks unrelated files');
      for (const receipt of publications) this.get(receipt.publicationKey);
      await git(['add', '--', ...allowed]);
      if (await git(['diff', '--cached', '--name-only'])) await git(['commit', '-m', 'Publish verified knowledge']);
      await git(['remote', 'remove', 'origin'], true);
      await git(['remote', 'add', 'origin', settings.git.remote]);
      const remoteHead = await git(['ls-remote', '--heads', 'origin', `refs/heads/${settings.git.branch}`]);
      if (remoteHead) {
        await git(['fetch', '--no-tags', 'origin', settings.git.branch]);
        await git(['merge', '--ff-only', 'FETCH_HEAD']);
      }
      await git(['push', 'origin', `HEAD:refs/heads/${settings.git.branch}`]);
      return { status: 'SYNCED', commit: await git(['rev-parse', 'HEAD']), publishedCount: publications.length };
    } finally { this.syncing = false; }
  }
  /** 关闭发布数据库。 */
  close(): void { this.database.close(); }
}
