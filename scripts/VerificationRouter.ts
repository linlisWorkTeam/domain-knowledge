#!/usr/bin/env node
/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：按变更范围选择已有验证；不引入工作流框架或全仓库约束。
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const scopes = ['docs', 'domain', 'application', 'infrastructure', 'web', 'schema', 'dependency', 'acceptance'] as const;
type Scope = typeof scopes[number];

/** 重命名以删除+新增传入；混合变更取并集，未知配置保守落入 dependency。 */
export function routeVerification(files: string[], options: { full?: boolean; main?: boolean } = {}): Scope[] {
  if (options.full) return [...scopes];
  const selected = new Set<Scope>(['docs']);
  for (const file of files) {
    if (file.endsWith('.md') || file === 'docs/FileCatalog.json') continue;
    if (/^scripts\/(?:ValidateSpecs|TraceabilityValidator)\.ts$/.test(file)
      || file === 'tests/contract/SpecValidator.test.ts') continue;
    if (file === 'tests/integration/WorktreeBootstrap.test.ts') selected.add('dependency');
    else if (file === 'tests/contract/Architecture.test.ts') selected.add('domain');
    else if (file.startsWith('tests/acceptance/')) selected.add('acceptance');
    else if (file.startsWith('docs/specs/schemas/') || file === 'scripts/ValidateContracts.ts'
      || file === 'tests/integration/AgentContracts.test.ts') selected.add('schema');
    else if (/^(?:web\/|site\/|tests\/e2e\/|Playwright\.config\.ts$|index\.html$)/.test(file)
      || file === 'tests/contract/Site.test.ts') selected.add('web');
    else if (file.startsWith('src/domain/') || file.startsWith('tests/unit/')) selected.add('domain');
    else if (file.startsWith('src/application/')) selected.add('application');
    else if (/^(?:src\/infrastructure\/|tests\/integration\/|tests\/security\/)/.test(file)) selected.add('infrastructure');
    else if (file.startsWith('src/interfaces/')) {
      selected.add('application');
      // HTTP 接口是浏览器的直接消费者边界；CLI/组合根不默认安装浏览器。
      if (file.startsWith('src/interfaces/uiApi/') || file === 'src/interfaces/runner/Server.ts') selected.add('web');
    } else selected.add('dependency');
    // 只有明确改变完整工作流、验收材料或验收测试才在 PR 跑昂贵链路。
    if (file.startsWith('src/domain/workflow/')
      || file === 'src/application/services/AutomatedProjectWorkflow.ts'
      || file.startsWith('src/domain/agents/docGenAgent/examples/DocGenReference')
      || file.endsWith('/DocGenFixedSourceSample.json')) selected.add('acceptance');
  }
  if (selected.has('dependency')) {
    for (const scope of scopes.filter((scope) => scope !== 'acceptance')) selected.add(scope);
  }
  if (options.main && ['domain', 'application', 'infrastructure', 'schema', 'dependency']
    .some((scope) => selected.has(scope as Scope))) selected.add('acceptance');
  return scopes.filter((scope) => selected.has(scope));
}

function tests(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? tests(path) : /\.test\.(?:ts|mjs|js)$/.test(path) ? [path] : [];
  });
}

/** 应用和基础设施的现有集成用例共用组合根，暂作为一个后端集成范围。 */
export function selectedTests(selected: readonly string[]): string[] {
  const result = new Set<string>();
  const add = (...paths: string[]) => paths.forEach((path) => result.add(path));
  if (selected.includes('docs')) add('tests/contract/SpecValidator.test.ts');
  if (selected.some((scope) => ['domain', 'application', 'infrastructure', 'schema'].includes(scope))) {
    add('tests/contract/Architecture.test.ts', 'tests/integration/AgentContracts.test.ts');
  }
  if (selected.some((scope) => ['domain', 'application'].includes(scope))) {
    add(...tests('tests/unit'), ...tests('src/domain'), 'tests/security/AgentWorkspace.test.ts');
  }
  if (selected.some((scope) => ['application', 'infrastructure'].includes(scope))) {
    add(...tests('tests/integration').filter((path) => !path.endsWith('/WorktreeBootstrap.test.ts')),
      ...tests('tests/security'));
  }
  if (selected.includes('web')) add('tests/contract/Site.test.ts');
  if (selected.includes('dependency')) {
    add('tests/contract/DependencyLock.test.ts', 'tests/contract/VerificationRouter.test.ts',
      'tests/integration/WorktreeBootstrap.test.ts');
  }
  if (selected.includes('acceptance')) add(...tests('tests/acceptance'));
  return [...result].sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv[2] === '--run') {
    const selected = (process.argv[3] ?? '').split(',');
    if (selected.some((scope) => !scopes.includes(scope as Scope))) throw new Error('Unknown verification scope');
    const files = selectedTests(selected);
    if (files.length === 0) throw new Error('No tests selected');
    const child = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { stdio: 'inherit' });
    if (child.error) throw child.error;
    process.exitCode = child.status ?? 1;
  } else {
    // PR merge checkout 的第一父提交是当前 base；无须获取完整历史或依赖 API 分页。
    const files = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' ? []
      : execFileSync('git', ['diff', '--no-renames', '--name-only', '-z', process.env.VERIFICATION_BASE || 'HEAD^1', 'HEAD'],
        { encoding: 'utf8' }).split('\0').filter(Boolean);
    const selected = routeVerification(files, {
      full: process.env.GITHUB_EVENT_NAME === 'workflow_dispatch',
      main: process.env.GITHUB_EVENT_NAME === 'push',
    });
    const outputs = [
      `scopes=${selected.join(',')}`,
      `runtime=${selected.some((scope) => scope !== 'docs')}`,
      `web=${selected.includes('web')}`,
      `contracts=${selected.some((scope) => ['domain', 'application', 'infrastructure', 'schema'].includes(scope))}`,
      `acceptance=${selected.includes('acceptance')}`,
    ].join('\n') + '\n';
    process.stdout.write(outputs);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, outputs);
  }
}
