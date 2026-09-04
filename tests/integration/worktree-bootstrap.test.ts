import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  READY_FILE, assertReady, assertSupportedNode, bootstrapWorkspace, inspectWorkspace,
} from '../../scripts/bootstrap-worktree.ts';

function workspace(lockfile: 'pnpm-lock.yaml' | 'package-lock.json'): string {
  const root = mkdtempSync(join(tmpdir(), 'worktree-bootstrap-'));
  writeFileSync(join(root, '.git'), 'gitdir: /tmp/test.git\n');
  writeFileSync(join(root, lockfile), lockfile === 'pnpm-lock.yaml' ? 'lockfileVersion: 9\n' : '{}\n');
  return root;
}

test('worktree bootstrap enforces Node 24 or newer', () => {
  assert.doesNotThrow(() => assertSupportedNode('24.0.0'));
  assert.doesNotThrow(() => assertSupportedNode('25.1.0'));
  assert.throws(() => assertSupportedNode('22.22.0'), /WORKTREE_NODE_UNSUPPORTED/);
});

test('bootstrap prefers a frozen pnpm install and shared store without sharing node_modules', () => {
  const root = workspace('pnpm-lock.yaml');
  const calls: string[][] = [];
  try {
    const result = bootstrapWorkspace({
      root,
      env: {
        ...process.env,
        PATH: '',
        WP_WORKTREE_PNPM_STORE_DIR: join(root, 'cache', 'pnpm-store'),
      },
      commandRunner: (_command, args, options) => {
        calls.push(args);
        if (args.includes('install')) mkdirSync(join(root, 'node_modules'));
        return options.capture ? '11.25.0' : '';
      },
    });
    assert.equal(result.status, 'READY');
    assert.equal(result.packageManager, 'pnpm');
    const installArgs = calls.at(-1) as string[];
    const installIndex = installArgs.indexOf('install');
    assert.match(installArgs[0] as string, /corepack[/\\]dist[/\\]pnpm\.js$/);
    assert.deepEqual(
      installArgs.slice(installIndex, installIndex + 3),
      ['install', '--frozen-lockfile', '--prefer-offline'],
    );
    assert.ok(installArgs.includes('--store-dir'));
    assert.equal(assertReady(root).lockfileSha256, inspectWorkspace(root).lockfileSha256);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('bootstrap uses npm ci for package-lock and invalidates stale READY state', () => {
  const root = workspace('package-lock.json');
  const calls: string[][] = [];
  try {
    const result = bootstrapWorkspace({
      root,
      env: {
        ...process.env,
        WP_WORKTREE_NPM_BIN: process.execPath,
        WP_WORKTREE_NPM_CACHE_DIR: join(root, 'cache', 'npm'),
      },
      commandRunner: (_command, args, options) => {
        calls.push(args);
        if (args.includes('ci')) mkdirSync(join(root, 'node_modules'));
        return options.capture ? '11.6.2' : '';
      },
    });
    assert.equal(result.packageManager, 'npm');
    assert.deepEqual(calls.at(-1)?.slice(0, 4), ['ci', '--prefer-offline', '--no-audit', '--no-fund']);
    const ready = JSON.parse(readFileSync(join(root, READY_FILE), 'utf8')) as { status: string };
    assert.equal(ready.status, 'READY');
    writeFileSync(join(root, 'package-lock.json'), '{"changed":true}\n');
    assert.throws(() => assertReady(root), /WORKTREE_READY_STATE_STALE/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('bootstrap rejects missing locks and a shared node_modules symlink', () => {
  const noLock = mkdtempSync(join(tmpdir(), 'worktree-bootstrap-no-lock-'));
  writeFileSync(join(noLock, '.git'), 'gitdir: /tmp/test.git\n');
  const shared = workspace('package-lock.json');
  const target = mkdtempSync(join(tmpdir(), 'worktree-bootstrap-modules-'));
  try {
    assert.throws(() => inspectWorkspace(noLock), /WORKTREE_LOCKFILE_REQUIRED/);
    symlinkSync(target, join(shared, 'node_modules'), 'dir');
    assert.throws(() => inspectWorkspace(shared), /WORKTREE_NODE_MODULES_SHARED/);
  } finally {
    rmSync(noLock, { recursive: true, force: true });
    rmSync(shared, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
});
