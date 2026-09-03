import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

function files(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

test('domain core has no SDK, database, language, or adapter dependency', () => {
  const source = files('src/domain').map((path) => readFileSync(path, 'utf8')).join('\n');
  for (const forbidden of ['langgraph', 'temporal', 'deepseek', 'dsh', 'sqlite', 'clang', 'gcc', 'src/infrastructure']) {
    assert.equal(source.toLowerCase().includes(forbidden), false, `domain contains forbidden dependency: ${forbidden}`);
  }
  assert.doesNotMatch(source, /from\s+['"][^'"]*(?:application|infrastructure|interfaces)[^'"]*['"]/);
});

test('application depends on ports and domain, never concrete adapters', () => {
  const source = files('src/application/services').map((path) => readFileSync(path, 'utf8')).join('\n');
  assert.doesNotMatch(source, /from\s+['"][^'"]*(?:infrastructure|interfaces)[^'"]*['"]/);
});

test('infrastructure never depends on interface entrypoints', () => {
  const source = files('src/infrastructure').map((path) => readFileSync(path, 'utf8')).join('\n');
  assert.doesNotMatch(source, /from\s+['"][^'"]*interfaces[^'"]*['"]/);
});

test('LangGraph remains isolated in workflow infrastructure', () => {
  const application = files('src/application/services').map((path) => readFileSync(path, 'utf8')).join('\n');
  const infrastructure = files('src/infrastructure/workflow/langgraph')
    .filter((path) => path.endsWith('.ts'))
    .map((path) => readFileSync(path, 'utf8')).join('\n');
  assert.equal(application.toLowerCase().includes('@langchain/langgraph'), false);
  assert.match(infrastructure, /@langchain\/langgraph/);
  assert.doesNotMatch(infrastructure, /KnowledgeVersion|PublicationReceipt|EvaluationReport/);
  assert.doesNotMatch(infrastructure, /createServer|\/api\/v1/);
});
