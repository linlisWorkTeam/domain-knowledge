import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { LocalAgentWorkspace } from '../../src/infrastructure/agents/workspace/index.ts';

function git(root: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test('role workspace copies only the explicit readable-path allowlist', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wp-agent-view-'));
  const source = join(root, 'source');
  const views = join(root, 'views');
  mkdirSync(join(source, 'src'), { recursive: true });
  writeFileSync(join(source, 'src', 'secret.ts'), 'REFERENCE_SECRET');
  writeFileSync(join(source, 'src', 'public.ts'), 'export interface Public {}');
  try {
    const provider = new LocalAgentWorkspace({ workspaceRoot: views, allowedSourceRoots: [source] });
    const view = await provider.materialize({
      isolationKey: 'run:code:0', role: 'code', sourceRoot: source,
      readablePaths: ['src/public.ts'],
    });
    assert.equal(readFileSync(join(view.workspaceRoot, 'src', 'public.ts'), 'utf8'), 'export interface Public {}');
    assert.equal(existsSync(join(view.workspaceRoot, 'src', 'secret.ts')), false);
    assert.deepEqual(view.readablePaths, ['src/public.ts']);
    assert.match(readFileSync(join(view.workspaceRoot, '.flywheel-workspace.json'), 'utf8'), /"role": "code"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('role workspace materializes the fixed Git commit instead of mutable worktree bytes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wp-agent-view-commit-'));
  const source = join(root, 'source');
  mkdirSync(join(source, 'src'), { recursive: true });
  writeFileSync(join(source, 'src', 'module.ts'), 'export const value = "committed";\n');
  try {
    git(source, ['init']);
    git(source, ['config', 'user.email', 'workspace@example.invalid']);
    git(source, ['config', 'user.name', 'Workspace Test']);
    git(source, ['add', '.']);
    git(source, ['commit', '-m', 'fixture']);
    const commit = git(source, ['rev-parse', 'HEAD']);
    writeFileSync(join(source, 'src', 'module.ts'), 'export const value = "dirty";\n');

    const provider = new LocalAgentWorkspace({
      workspaceRoot: join(root, 'views'), allowedSourceRoots: [source],
    });
    const view = await provider.materialize({
      isolationKey: 'fixed-commit', role: 'doc-worker', sourceRoot: source, sourceCommit: commit,
      readablePaths: ['src/module.ts'],
    });
    assert.equal(
      readFileSync(join(view.workspaceRoot, 'src', 'module.ts'), 'utf8'),
      'export const value = "committed";\n',
    );
    assert.match(
      readFileSync(join(view.workspaceRoot, '.flywheel-workspace.json'), 'utf8'),
      new RegExp(commit),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('role workspace rejects traversal', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wp-agent-view-deny-'));
  const source = join(root, 'source');
  const outside = join(root, 'outside.txt');
  mkdirSync(source);
  writeFileSync(outside, 'not allowed');
  try {
    const provider = new LocalAgentWorkspace({ workspaceRoot: join(root, 'views'), allowedSourceRoots: [source] });
    await assert.rejects(provider.materialize({
      isolationKey: 'traversal', role: 'code', sourceRoot: source, readablePaths: ['../outside.txt'],
    }), /AGENT_WORKSPACE_PATH_DENIED/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('role workspace rejects source symlinks when the host permits creating them', async (context) => {
  const root = mkdtempSync(join(tmpdir(), 'wp-agent-view-symlink-'));
  const source = join(root, 'source');
  const outside = join(root, 'outside.txt');
  mkdirSync(source);
  writeFileSync(outside, 'not allowed');
  try {
    try {
      symlinkSync(outside, join(source, 'linked.txt'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') {
        context.skip('当前 Windows 主机未授予创建符号链接的权限');
        return;
      }
      throw error;
    }
    const provider = new LocalAgentWorkspace({ workspaceRoot: join(root, 'views'), allowedSourceRoots: [source] });
    await assert.rejects(provider.materialize({
      isolationKey: 'symlink', role: 'code', sourceRoot: source, readablePaths: ['linked.txt'],
    }), /AGENT_WORKSPACE_SYMLINK_DENIED/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('reusing an isolation key with a different allowlist cannot expose stale files', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wp-agent-view-reuse-'));
  const source = join(root, 'source');
  mkdirSync(source);
  writeFileSync(join(source, 'first.txt'), 'first');
  writeFileSync(join(source, 'second.txt'), 'second');
  try {
    const provider = new LocalAgentWorkspace({ workspaceRoot: join(root, 'views'), allowedSourceRoots: [source] });
    const first = await provider.materialize({
      isolationKey: 'same-key', role: 'review', sourceRoot: source, readablePaths: ['first.txt'],
    });
    const second = await provider.materialize({
      isolationKey: 'same-key', role: 'review', sourceRoot: source, readablePaths: ['second.txt'],
    });
    assert.notEqual(first.workspaceRoot, second.workspaceRoot);
    assert.equal(existsSync(join(second.workspaceRoot, 'first.txt')), false);
    assert.equal(readFileSync(join(second.workspaceRoot, 'second.txt'), 'utf8'), 'second');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
