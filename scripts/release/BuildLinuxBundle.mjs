#!/usr/bin/env node
/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：串行构建带锁定工具与依赖的 Linux 自解压安装包，不下载任何依赖。
 */
import { createHash } from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, symlinkSync, unlinkSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const version = process.argv[2];
const output = resolve(process.argv[3] || join(root, 'dist'));
if (!/^0\.2\.\d+$/.test(version || '')) throw new Error('Usage: node scripts/release/BuildLinuxBundle.mjs 0.2.0 /absolute/output');
if (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version !== version) throw new Error('Bundle version must match package.json');
if (!process.version.startsWith('v24.')) throw new Error('Node.js 24 build runtime required');
if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('Linux x86_64 build host required');
const hostRelease = readFileSync('/etc/os-release', 'utf8');
if (!/^ID="?opencloudos"?$/m.test(hostRelease) || !/^VERSION_ID="?9\.4"?$/m.test(hostRelease)) throw new Error('Build host must be OpenCloudOS 9.4');
const command = (name, args, options = {}) => execFileSync(name, args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options }).trim();
if (command('git', ['status', '--porcelain'])) throw new Error('Build requires a clean committed worktree');
command(process.execPath, ['scripts/BootstrapWorktree.ts', '--check']);
const stage = mkdtempSync(join(tmpdir(), 'knowledge-bundle-'));
const payload = join(stage, 'payload');
mkdirSync(join(payload, 'app'), { recursive: true });
mkdirSync(join(payload, 'tools', 'bin'), { recursive: true });
mkdirSync(join(payload, 'tools', 'lib'), { recursive: true });
mkdirSync(join(payload, 'licenses'), { recursive: true });
mkdirSync(output, { recursive: true });
const tools = [];
const hash = async (path) => { const h = createHash('sha256'); for await (const chunk of createReadStream(path)) h.update(chunk); return h.digest('hex'); };
const copy = (from, to) => command('cp', ['-a', from, to]);
try {
  // 只打包 Git 跟踪的允许目录；工作目录中的密钥、运行库和截图不会隐式进入发行物。
  const tracked = command('git', ['ls-files', '-z']).split('\0').filter((path) => path &&
    (/^(src|web|docs|scripts|tests)\//.test(path) || ['package.json', 'package-lock.json', 'Runner.config.json', 'LICENSE', 'README.md', 'tsconfig.json', 'Playwright.config.ts'].includes(path)) &&
    !/(^|\/)(\.env[^/]*|\.workpanel|secrets|node_modules)(\/|$)/.test(path));
  writeFileSync(join(stage, 'files'), tracked.join('\0') + '\0');
  command('tar', ['--null', '-T', join(stage, 'files'), '-cf', join(stage, 'source.tar')]);
  command('tar', ['-xf', join(stage, 'source.tar'), '-C', join(payload, 'app')]);
  copy(join(root, 'node_modules'), join(payload, 'app', 'node_modules'));
  const nativeBinaries = [process.execPath, '/usr/bin/git', '/usr/bin/bwrap', '/usr/bin/bash', '/usr/bin/prlimit', '/usr/bin/ssh'];
  for (const binary of nativeBinaries) {
    const destination = join(payload, 'tools', 'bin', basename(binary));
    copy(realpathSync(binary), destination);
    const versionResult = spawnSync(binary, [basename(binary) === 'ssh' ? '-V' : '--version'], { encoding: 'utf8', timeout: 10_000 });
    if (versionResult.status !== 0) throw new Error(`Cannot verify tool version: ${basename(binary)}`);
    tools.push({ name: basename(binary), version: (versionResult.stdout || versionResult.stderr).trim().split('\n')[0], sha256: await hash(destination) });
  }
  const gitExecPath = command('/usr/bin/git', ['--exec-path']);
  copy(gitExecPath, join(payload, 'tools', 'git-core'));
  // 系统 git-core 别名相对 /usr/libexec；安装布局不同，需要重建为包内链接。
  for (const entry of readdirSync(gitExecPath, { withFileTypes: true })) {
    if (!entry.isSymbolicLink()) continue;
    const original = realpathSync(join(gitExecPath, entry.name));
    const installed = join(payload, 'tools', 'git-core', entry.name);
    let target = original === realpathSync('/usr/bin/git') ? join(payload, 'tools', 'bin', 'git')
      : original.startsWith(gitExecPath + '/') ? join(payload, 'tools', 'git-core', relative(gitExecPath, original)) : null;
    if (!target) {
      target = join(payload, 'tools', 'bin', basename(original));
      copy(original, target);
      tools.push({ name: basename(original), sha256: await hash(target) });
      if (readFileSync(original).subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) nativeBinaries.push(original);
    }
    unlinkSync(installed); symlinkSync(relative(dirname(installed), target), installed);
  }
  const typescriptNative = join(payload, 'app', 'node_modules', '@typescript', 'typescript-linux-x64', 'lib', 'tsc');
  if (!existsSync(typescriptNative)) throw new Error('Missing TypeScript Linux x64 native compiler; offline acceptance cannot build');
  tools.push({ name: 'typescript-native-linux-x64', version: command(typescriptNative, ['--version']), sha256: await hash(typescriptNative) });
  const dependencies = new Set();
  for (const binary of [...nativeBinaries, join(gitExecPath, 'git-remote-https')]) {
    const ldd = command('ldd', [realpathSync(binary)]);
    if (/not found/.test(ldd)) throw new Error(`Missing shared library for ${binary}`);
    for (const match of ldd.matchAll(/(?:=>\s+)?(\/[^\s]+)\s+\(/g)) {
      // 宿主监控预加载库不是产品依赖，不将宿主代理打包。
      if (match[1].includes('libonion')) continue;
      dependencies.add(realpathSync(match[1]));
      copy(realpathSync(match[1]), join(payload, 'tools', 'lib', basename(match[1])));
    }
  }
  for (const path of dependencies) tools.push({ name: basename(path), sha256: await hash(path) });
  const nodeLicense = join(dirname(dirname(process.execPath)), 'LICENSE');
  for (const [name, path] of [['Node-LICENSE', nodeLicense], ['Git-COPYING', '/usr/share/licenses/git-core/COPYING'], ['Bubblewrap-COPYING', '/usr/share/licenses/bubblewrap/COPYING']]) {
    if (!existsSync(path)) throw new Error(`Missing required license: ${path}`);
    copy(path, join(payload, 'licenses', name));
  }
  copy('/usr/share/licenses/bash', join(payload, 'licenses', 'Bash'));
  copy('/usr/share/licenses/util-linux', join(payload, 'licenses', 'UtilLinux'));
  copy('/usr/share/licenses/openssh', join(payload, 'licenses', 'OpenSSH'));
  const systemFiles = [...new Set([...nativeBinaries.filter((path) => path.startsWith('/usr/')), ...dependencies])];
  const systemPackages = [...new Map(command('rpm', ['-qf', '--qf', '%{NAME}\t%{VERSION}-%{RELEASE}\t%{LICENSE}\t%{SOURCERPM}\n', ...systemFiles])
    .split('\n').map((line) => { const [name, version, license, sourceRpm] = line.split('\t'); return [name, { name, version, license, sourceRpm }]; })).values()];
  // OpenCloudOS 将部分运行库的许可证放在同源子包；缺失时阻止构建。
  const licensePackages = { 'cyrus-sasl-lib': 'cyrus-sasl', 'libstdc++': 'libgcc', 'ncurses-libs': 'ncurses-base', 'openssh-clients': 'openssh', 'pcre2': 'pcre2-doc' };
  for (const packageInfo of systemPackages) {
    const owner = licensePackages[packageInfo.name] || packageInfo.name;
    const licenseFiles = command('rpm', ['-q', '--licensefiles', owner]).split('\n').filter((path) => path && existsSync(path) && statSync(path).isFile());
    if (!licenseFiles.length) throw new Error(`Missing required system package license: ${packageInfo.name} (${owner})`);
    const directory = join(payload, 'licenses', `System-${packageInfo.name}`);
    mkdirSync(directory, { recursive: true });
    for (const path of licenseFiles) copy(path, join(directory, basename(path)));
    packageInfo.licenseFiles = licenseFiles.map((path) => `licenses/System-${packageInfo.name}/${basename(path)}`);
  }
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  for (const name of ['@deepseek-ai/dsh', 'typescript']) {
    const packagePath = join(payload, 'app', 'node_modules', name, 'package.json');
    tools.push({ name, version: JSON.parse(readFileSync(packagePath, 'utf8')).version, sha256: await hash(packagePath) });
  }
  const packages = Object.entries(lock.packages).filter(([path]) => path).map(([path, item]) => ({ path, name: item.name || path.split('node_modules/').at(-1), version: item.version, integrity: item.integrity, license: item.license || 'SEE PACKAGE LICENSE' }));
  writeFileSync(join(payload, 'licenses', 'ThirdParty.json'), JSON.stringify({ schemaVersion: '1.0', packages, systemPackages, systemTools: tools, systemSource: 'https://mirrors.opencloudos.tech/opencloudos/9.4/' }, null, 2) + '\n');
  writeFileSync(join(payload, 'Manifest.json'), JSON.stringify({ schemaVersion: '1.0', version, commit: command('git', ['rev-parse', 'HEAD']), target: 'OpenCloudOS 9.4 x86_64', lockfileSha256: await hash(join(root, 'package-lock.json')), tools, dependencies: packages }, null, 2) + '\n');
  copy(join(root, 'scripts/release/Knowledge.sh'), join(payload, 'Knowledge.sh'));
  // 为每个普通文件记录摘要；按文件逐个流式哈希，避免 ECS 内存峰值。
  const allFiles = [];
  const links = [];
  function recordLink(path, relativePath) {
    const target = readlinkSync(path);
    const actual = realpathSync(path);
    if (!actual.startsWith(payload + '/')) throw new Error(`Bundle symlink escapes payload: ${relativePath}`);
    links.push({ path: relativePath, target });
  }
  function visit(directory, prefix = '') { for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) { const path = join(directory, entry.name); const relative = prefix + entry.name; if (entry.isDirectory()) visit(path, relative + '/'); else if (entry.isFile()) allFiles.push({ path, relative }); else if (entry.isSymbolicLink()) recordLink(path, relative); } }
  visit(payload);
  writeFileSync(join(payload, 'Links.json'), JSON.stringify({ schemaVersion: '1.0', links }, null, 2) + '\n');
  allFiles.push({ path: join(payload, 'Links.json'), relative: 'Links.json' });
  const checksums = [];
  for (const file of allFiles) checksums.push(`${await hash(file.path)}  ${file.relative}`);
  writeFileSync(join(payload, 'Files.sha256'), checksums.join('\n') + '\n');
  const archive = join(stage, 'payload.tar.gz');
  command('tar', ['--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner', '-cf', join(stage, 'payload.tar'), '-C', payload, '.']);
  const gzip = spawn('gzip', ['-n', '-1', '-c', join(stage, 'payload.tar')], { stdio: ['ignore', 'pipe', 'inherit'] });
  const gzipExit = new Promise((resolveCode, reject) => { gzip.once('close', resolveCode); gzip.once('error', reject); });
  await pipeline(gzip.stdout, createWriteStream(archive));
  const gzipCode = await gzipExit;
  if (gzipCode) throw new Error('Archive compression failed');
  const target = join(output, `domain-knowledge-${version}-linux-x86_64.run`);
  const header = readFileSync(join(root, 'scripts/release/InstallLinux.sh'), 'utf8')
    .replaceAll('__BUNDLE_VERSION__', version).replaceAll('__PAYLOAD_SHA256__', await hash(archive));
  writeFileSync(target, header, { mode: 0o755 });
  await pipeline(createReadStream(archive), createWriteStream(target, { flags: 'a' }));
  writeFileSync(`${target}.sha256`, `${await hash(target)}  ${basename(target)}\n`);
  copy(join(payload, 'Manifest.json'), join(output, `domain-knowledge-${version}-Manifest.json`));
  copy(join(payload, 'licenses', 'ThirdParty.json'), join(output, `domain-knowledge-${version}-ThirdParty.json`));
  console.log(JSON.stringify({ status: 'BUILT', version, artifact: target, bytes: statSync(target).size, commit: command('git', ['rev-parse', 'HEAD']) }, null, 2));
} finally { rmSync(stage, { recursive: true, force: true }); }
