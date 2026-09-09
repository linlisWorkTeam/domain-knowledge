/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证发布崩溃恢复、幂等、来源绑定、目录隔离和 Git 冲突保留。
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { LocalMarkdownPublisher } from '../../src/infrastructure/publication/LocalMarkdownPublisher.ts';
import { PublicationOperations } from '../../src/application/services/PublicationOperations.ts';
import type { LocalPublicationInput } from '../../src/application/ports/PublicationPorts.ts';

const material = (key = 'publication_1'): LocalPublicationInput => ({
  publicationKey: key, gateDecisionId: 'gate_1', runId: 'run_1', versionId: key + '_version',
  moduleId: 'markdown-lite', title: 'Markdown Lite', body: '# Markdown Lite\n\nValidated knowledge.',
  sourceCommit: 'a'.repeat(40), sourceDigest: 'b'.repeat(64), evidenceRefs: [{ sha256: 'c'.repeat(64) }],
});
function fixture(t: { after(fn: () => void): void }) {
  const root = mkdtempSync(join(tmpdir(), 'knowledge-publication-test-'));
  const runtimeDir = join(root, 'data');
  const directory = join(root, 'published');
  const port = new LocalMarkdownPublisher({ runtimeDir, defaultDirectory: directory, directoryRoots: [root], excludedRoots: [join(root, 'source')], allowLocalRemotes: true });
  const app = new PublicationOperations(port);
  t.after(() => { port.close(); rmSync(root, { recursive: true, force: true }); });
  return { root, runtimeDir, directory, port, app };
}

test('only complete gate evidence is published; retries preserve receipt and reject replacement', async (t) => {
  const { app, directory } = fixture(t);
  assert.throws(() => app.publish({ ...material(), evidenceRefs: [] }), /EVIDENCE_REQUIRED/);
  assert.equal(app.list().length, 0);
  const first = await app.publish(material());
  assert.equal(first.status, 'PUBLISHED');
  assert.equal(dirname(dirname(first.path)), directory);
  assert.deepEqual(await app.publish(material()), first);
  assert.equal(app.list().length, 1);
  const detail = app.get(first.publicationKey);
  assert.match(detail.markdown, /gate_1/);
  assert.equal(detail.metadata.sourceCommit, 'a'.repeat(40));
  assert.equal(first.bodySha256, createHash('sha256').update(material().body).digest('hex'));
  await assert.rejects(app.publish({ ...material(), body: 'Changed' }), /PUBLICATION_CONFLICT/);
  writeFileSync(first.path, 'tampered');
  assert.throws(() => app.get(first.publicationKey), /PUBLICATION_CONFLICT/);
});

test('failed file commit stays PENDING and recovery completes exactly once after restart', async () => {
  const root = mkdtempSync(join(tmpdir(), 'knowledge-recover-test-'));
  const runtimeDir = join(root, 'data');
  const directory = join(root, 'published');
  const config = { runtimeDir, defaultDirectory: directory, directoryRoots: [root] };
  let port = new LocalMarkdownPublisher(config);
  try {
    port.putSettings({ directory });
    const obstruction = join(directory, createHash('sha256').update(material().publicationKey).digest('hex'));
    writeFileSync(obstruction, 'simulated interrupted filesystem');
    await assert.rejects(port.publish(material()));
    assert.equal(port.list()[0]!.status, 'PENDING');
    const pending = port.list()[0]!;
    port.close();
    rmSync(obstruction);
    port = new LocalMarkdownPublisher(config);
    const recovered = await port.recover();
    assert.equal(recovered.length, 1);
    assert.equal(recovered[0]!.createdAt, pending.createdAt);
    assert.equal(recovered[0]!.status, 'PUBLISHED');
    assert.deepEqual(await port.recover(), []);
    assert.equal(port.list().length, 1);
  } finally { port.close(); rmSync(root, { recursive: true, force: true }); }
});

test('directory browsing, source overlap and symlink escape are rejected', (t) => {
  const { app, root } = fixture(t);
  mkdirSync(join(root, 'source'));
  assert.throws(() => app.putSettings({ directory: join(root, 'source', 'knowledge') }), /DIRECTORY_DENIED/);
  assert.throws(() => app.listDirectories('/'), /DIRECTORY_DENIED/);
  symlinkSync('/', join(root, 'escape'));
  assert.throws(() => app.listDirectories(join(root, 'escape')), /DIRECTORY_DENIED/);
  assert.throws(() => app.putSettings({ directory: join(root, 'escape', 'tmp') }), /DIRECTORY_DENIED/);
  assert.ok(app.listDirectories(root).directories.includes(join(root, 'source')));
});

test('Git is disabled by default; only explicit published paths are committed, credentials remain private', async (t) => {
  const { app, root, directory } = fixture(t);
  assert.equal(app.getSettings().git.enabled, false);
  await assert.rejects(app.sync(), /GIT_DISABLED/);
  const remote = join(root, 'remote.git');
  execFileSync('git', ['init', '--bare', remote], { stdio: 'ignore' });
  app.putSettings({ git: { enabled: true, remote, branch: 'main', token: 'never-return-this-secret' } });
  assert.equal(JSON.stringify(app.getSettings()).includes('never-return-this-secret'), false);
  const published = await app.publish(material());
  writeFileSync(join(directory, 'unrelated.txt'), 'private');
  const result = await app.sync();
  assert.equal(result.publishedCount, 1);
  const tracked = execFileSync('git', ['ls-files'], { cwd: directory, encoding: 'utf8' });
  assert.doesNotMatch(tracked, /unrelated/);
  assert.match(tracked, /Knowledge.md/);
  assert.equal((await app.sync()).commit, result.commit);
  assert.equal(app.get(published.publicationKey).receipt.status, 'PUBLISHED');
});

test('divergent remote rejects synchronization without forcing or rolling back local publication', async (t) => {
  const { app, root, directory } = fixture(t);
  const remote = join(root, 'remote.git');
  const other = join(root, 'other');
  const git = (args: string[], cwd?: string) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git(['init', '--bare', remote]);
  app.putSettings({ git: { enabled: true, remote, branch: 'main' } });
  await app.publish(material());
  await app.sync();
  git(['clone', '--branch', 'main', remote, other]);
  writeFileSync(join(other, 'remote-change.md'), 'remote change');
  git(['add', '.'], other);
  git(['-c', 'user.name=Test', '-c', 'user.email=test@localhost', 'commit', '-m', 'remote change'], other);
  git(['push'], other);
  const remoteBefore = git(['rev-parse', 'HEAD'], other);
  const next = await app.publish(material('publication_2'));
  await assert.rejects(app.sync(), /GIT_CONFLICT/);
  assert.equal(git(['--git-dir', remote, 'rev-parse', 'main']), remoteBefore);
  assert.equal(app.get(next.publicationKey).receipt.status, 'PUBLISHED');
  assert.match(readFileSync(next.path, 'utf8'), /Validated knowledge/);
  assert.equal(dirname(dirname(next.path)), directory);
});
