#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, parse, resolve, sep } from 'node:path';

function requiredPath(name) {
  const value = process.env[name];
  if (!value || !isAbsolute(value) || !existsSync(value)) {
    process.stderr.write(`DSH_AGENT_SANDBOX_CONFIG_INVALID: ${name}\n`);
    process.exit(78);
  }
  return realpathSync(value);
}

function ancestors(path) {
  const values = [];
  let cursor = dirname(path);
  const root = parse(cursor).root;
  while (cursor !== root) {
    values.push(cursor);
    cursor = dirname(cursor);
  }
  return values.reverse();
}

const command = process.env.WP_DSH_SANDBOX_COMMAND || 'bwrap';
const runtimeBin = requiredPath('WP_DSH_SANDBOX_RUNTIME_BIN');
const nodeModules = requiredPath('WP_DSH_SANDBOX_NODE_MODULES');
const nodeBin = requiredPath('WP_DSH_SANDBOX_NODE_BIN');
const workspace = requiredPath('WP_DSH_SANDBOX_WORKSPACE');
const dshHome = requiredPath('WP_DSH_SANDBOX_HOME');
const patches = JSON.parse(process.env.WP_DSH_SANDBOX_PATCHES || '[]').map((path) => requiredPathValue(path));

function requiredPathValue(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || !existsSync(path)) {
    process.stderr.write('DSH_AGENT_SANDBOX_CONFIG_INVALID: patch path\n');
    process.exit(78);
  }
  return realpathSync(path);
}

if (!nodeModules.endsWith(`${sep}node_modules`) || !existsSync(nodeModules)) {
  process.stderr.write('DSH_AGENT_SANDBOX_CONFIG_INVALID: node_modules root\n');
  process.exit(78);
}

const mounts = [nodeModules, workspace, dshHome, runtimeBin, nodeBin, ...patches];
const directories = [...new Set(mounts.flatMap(ancestors))]
  .sort((left, right) => left.split(sep).length - right.split(sep).length);
const args = [
  '--die-with-parent', '--unshare-pid', '--as-pid-1', '--new-session',
  '--ro-bind', '/usr', '/usr',
  '--symlink', 'usr/bin', '/bin',
  '--symlink', 'usr/lib', '/lib',
  '--symlink', 'usr/lib64', '/lib64',
  '--symlink', 'usr/sbin', '/sbin',
  '--dir', '/etc',
  '--ro-bind-try', '/etc/ssl', '/etc/ssl',
  '--ro-bind-try', '/etc/pki', '/etc/pki',
  '--ro-bind-try', '/etc/resolv.conf', '/etc/resolv.conf',
  '--ro-bind-try', '/etc/hosts', '/etc/hosts',
  '--ro-bind-try', '/etc/nsswitch.conf', '/etc/nsswitch.conf',
  '--ro-bind-try', '/etc/passwd', '/etc/passwd',
  '--ro-bind-try', '/etc/group', '/etc/group',
  '--ro-bind-try', '/etc/localtime', '/etc/localtime',
  '--proc', '/proc', '--dev', '/dev',
  '--ro-bind', '/dev/null', '/proc/1/environ',
  '--tmpfs', '/tmp',
  ...directories.flatMap((path) => ['--dir', path]),
  '--ro-bind', nodeModules, nodeModules,
  '--ro-bind', nodeBin, nodeBin,
  '--ro-bind', workspace, workspace,
  '--bind', dshHome, dshHome,
  ...patches.flatMap((path) => ['--ro-bind', path, path]),
  '--setenv', 'HOME', dshHome,
  '--setenv', 'TMPDIR', '/tmp',
  '--chdir', workspace,
  '--', nodeBin, runtimeBin, ...process.argv.slice(2),
];

const child = spawn(command, args, { stdio: 'inherit', env: process.env });
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => child.kill(signal));
}
child.on('error', (error) => {
  process.stderr.write(`DSH_AGENT_SANDBOX_START_FAILED: ${error.code || 'UNKNOWN'}\n`);
  process.exitCode = 70;
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 70);
});
