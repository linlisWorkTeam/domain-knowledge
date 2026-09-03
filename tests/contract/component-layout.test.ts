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
    'acceptance/ohmyworkpanel/scenario.json',
    'src/interfaces/runner/server.ts',
    'docs/ARCHITECTURE.md',
    'docs/AGENT-CUSTOMIZATION.md',
    'docs/DEVELOPMENT.md',
    'docs/DOCUMENTATION-I18N.md',
    'docs/GETTING_STARTED.md',
    'docs/README.md',
    'docs/REPOSITORY-GUIDE.md',
    'docs/TESTING.md',
    'src/infrastructure/workflow/langgraph/README.md',
    'src/infrastructure/workflow/langgraph/index.ts',
    'src/domain/index.ts',
    'src/application/ports/index.ts',
    'src/application/services/index.ts',
    'src/infrastructure/persistence/sqlite-cas/index.ts',
    'specs/README.md',
    'site/index.html',
    'tests/integration/server.test.ts',
    'web/index.html',
    'runner.config.json',
  ]) {
    assert.equal(existsSync(join(componentRoot, required)), true, `missing component path: ${required}`);
  }
  const trackedFiles = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const retired of ['apps', 'packages', 'infrastructure']) {
    assert.equal(
      trackedFiles.some((path) => path.startsWith(`${retired}/`)),
      false,
      `tracked file remains under retired component path: ${retired}`,
    );
  }
});

test('tracked documentation is Chinese-first and key entries carry English summaries', () => {
  const trackedMarkdown = execFileSync('git', ['ls-files', '-z', '*.md'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
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
    join(componentRoot, 'docs/GETTING_STARTED.md'),
    join(componentRoot, 'docs/ARCHITECTURE.md'),
    join(componentRoot, 'docs/AGENT-CUSTOMIZATION.md'),
    join(componentRoot, 'docs/OPERATIONS.md'),
    join(componentRoot, 'docs/MIGRATION.md'),
    join(componentRoot, 'docs/DOCUMENTATION-I18N.md'),
    join(componentRoot, 'specs/README.md'),
    join(componentRoot, 'src/infrastructure/workflow/langgraph/README.md'),
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
    '.github/workflows/ci.yml',
    '.github/workflows/pages.yml',
  ]) {
    assert.equal(existsSync(required), true, `missing repository guidance: ${required}`);
  }
});

test('runtime and knowledge repositories remain independently configurable', () => {
  const environment = readFileSync('.env.example', 'utf8');
  const composition = readFileSync('src/interfaces/runner/composition.ts', 'utf8');
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
    ...markdownFiles(join(componentRoot, 'specs')),
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
