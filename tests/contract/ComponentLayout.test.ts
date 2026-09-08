/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证ComponentLayout的行为、约束及失败场景。
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

const componentRoot = '.';

function markdownFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory()
      ? markdownFiles(path)
      : path.endsWith('.md')
        ? [path]
        : [];
  });
}

test('Knowledge Flywheel implementation owns the domain-knowledge repository root', () => {
  assert.equal(existsSync('endlessWpKnowledgeRunner'), false, 'retired wrapper directory must not be reintroduced');
  for (const required of [
    'src/interfaces/runner/Server.ts',
    'src/interfaces/uiApi/UiApi.ts',
    'docs/specs/totalRules/Architecture.md',
    'docs/AgentDevelopment.md',
    'docs/Development.md',
    'docs/specs/totalRules/CodeTaste.md',
    'docs/GettingStarted.md',
    'docs/README.md',
    'docs/specs/README.md',
    'docs/diagrams/Views4Plus1.md',
    'src/infrastructure/README.md',
    'src/infrastructure/langgraph/LangGraph.ts',
    'src/domain/Domain.ts',
    'src/application/ports/ApplicationPorts.ts',
    'src/application/apps/ApplicationApps.ts',
    'src/application/services/ApplicationServices.ts',
    'src/domain/services/DomainServices.ts',
    'src/infrastructure/sqlite/SqliteCas.ts',
    'src/infrastructure/redis/Redis.ts',
    'docs/HistoryEpitaph.md',
    'site/index.html',
    'tests/integration/Server.test.ts',
    'web/index.html',
    'Runner.config.json',
  ]) {
    assert.equal(existsSync(join(componentRoot, required)), true, `missing component path: ${required}`);
  }
  const trackedFiles = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const retired of ['apps', 'packages', 'infrastructure', 'specs']) {
    assert.equal(
      trackedFiles.some((path) => path.startsWith(`${retired}/`)),
      false,
      `tracked file remains under retired component path: ${retired}`,
    );
  }
});

test('tracked documentation is Chinese-first and key entries carry English summaries', () => {
  const trackedMarkdown = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '*.md'],
    { encoding: 'utf8' },
  )
    .split('\0')
    .filter((document) => document.length > 0 && existsSync(document));
  assert.ok(trackedMarkdown.length > 0, 'no tracked Markdown documents found');
  for (const document of trackedMarkdown) {
    const markdown = readFileSync(document, 'utf8');
    const chineseCharacters = markdown.match(/\p{Script=Han}/gu)?.length ?? 0;
    assert.ok(
      chineseCharacters >= 8,
      `tracked document needs a meaningful Chinese explanation: ${document}`,
    );
  }

  for (const document of [
    'README.md',
    'CONTRIBUTING.md',
    'SECURITY.md',
    join(componentRoot, 'docs/GettingStarted.md'),
    join(componentRoot, 'docs/specs/totalRules/Architecture.md'),
    join(componentRoot, 'docs/AgentDevelopment.md'),
    join(componentRoot, 'docs/Operations.md'),
    join(componentRoot, 'docs/HistoryEpitaph.md'),
    join(componentRoot, 'docs/specs/totalRules/CodeTaste.md'),
    join(componentRoot, 'docs/specs/README.md'),
    join(componentRoot, 'src/infrastructure/README.md'),
    join(componentRoot, 'src/interfaces/dsh/README.md'),
  ]) {
    const markdown = readFileSync(document, 'utf8');
    assert.match(markdown, /<details lang="en">\s*<summary>English summary<\/summary>/);
  }
});

test('repository onboarding and contribution surfaces remain present', () => {
  for (const required of [
    'README.md',
    'CONTRIBUTING.md',
    'SECURITY.md',
    'LICENSE',
    '.github/pull_request_template.md',
    '.github/workflows/Ci.yml',
    '.github/workflows/Pages.yml',
  ]) {
    assert.equal(existsSync(required), true, `missing repository guidance: ${required}`);
  }
});

test('runtime and knowledge repositories remain independently configurable', () => {
  const environment = readFileSync('.env.example', 'utf8');
  const composition = readFileSync('src/interfaces/runner/Composition.ts', 'utf8');
  assert.match(environment, /WP_KNOWLEDGE_REPOSITORY=/);
  assert.match(composition, /process\.env\.WP_KNOWLEDGE_REPOSITORY/);
  assert.match(composition, /join\(componentRoot, configuredRuntime\)/);
});

test('active repository guidance and WorkPanel documents have valid relative links', () => {
  const documents = [
    'README.md',
    'CONTRIBUTING.md',
    'SECURITY.md',
    '.github/pull_request_template.md',
    join(componentRoot, 'README.md'),
    join(componentRoot, 'site/README.md'),
    ...markdownFiles(join(componentRoot, 'docs')),
  ];
  const linkPattern = /\[[^\]]+\]\(([^)]+)\)/g;
  for (const document of documents) {
    const markdown = readFileSync(document, 'utf8');
    for (const match of markdown.matchAll(linkPattern)) {
      const rawTarget = match[1].split('#', 1)[0].replace(/^<|>$/g, '');
      if (!rawTarget || rawTarget.includes('://') || rawTarget.startsWith('mailto:')) continue;
      const target = resolve(dirname(document), decodeURIComponent(rawTarget));
      assert.equal(existsSync(target), true, `broken link in ${document}: ${match[1]}`);
    }
  }
});
