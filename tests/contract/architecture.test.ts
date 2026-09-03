import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { AGENT_IDS } from '../../src/application/ports/index.ts';
import { DOMAIN_KNOWLEDGE_AGENT_DEFINITIONS } from '../../src/infrastructure/workflow/langgraph/agent-definitions.ts';

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
  const source = files('src/application').map((path) => readFileSync(path, 'utf8')).join('\n');
  assert.doesNotMatch(source, /from\s+['"][^'"]*(?:infrastructure|interfaces)[^'"]*['"]/);
});

test('infrastructure never depends on interface entrypoints', () => {
  const source = files('src/infrastructure').map((path) => readFileSync(path, 'utf8')).join('\n');
  assert.doesNotMatch(source, /from\s+['"][^'"]*interfaces[^'"]*['"]/);
});

test('LangGraph remains isolated in workflow infrastructure', () => {
  const application = files('src/application').map((path) => readFileSync(path, 'utf8')).join('\n');
  const infrastructure = files('src/infrastructure/workflow/langgraph')
    .filter((path) => path.endsWith('.ts'))
    .map((path) => readFileSync(path, 'utf8')).join('\n');
  assert.equal(application.toLowerCase().includes('@langchain/langgraph'), false);
  assert.match(infrastructure, /@langchain\/langgraph/);
  assert.doesNotMatch(infrastructure, /KnowledgeVersion|PublicationReceipt|EvaluationReport/);
  assert.doesNotMatch(infrastructure, /createServer|\/api\/v1/);
});

test('DDD application and domain-service boundaries are explicit without changing Agent topology', () => {
  for (const path of [
    'src/interfaces/ui-api/index.ts',
    'src/application/apps/index.ts',
    'src/domain/services/flywheel-domain-service.ts',
    'src/domain/services/eval-runner-domain-service.ts',
    'src/domain/services/association-domain-service.ts',
    'src/infrastructure/persistence/redis/index.ts',
  ]) assert.equal(statSync(path).isFile(), true, `missing DDD boundary: ${path}`);

  const apps = readFileSync('src/application/apps/index.ts', 'utf8');
  for (const name of [
    'Orchestrator', 'FlywheelApp', 'EvalRunnerApp', 'KnowledgeSearchApp', 'KnowledgeDiscoveryApp',
  ]) assert.match(apps, new RegExp(`\\b${name}\\b`));

  const uiApi = readFileSync('src/interfaces/ui-api/index.ts', 'utf8');
  assert.match(uiApi, /runner\/server\.ts/);
  assert.deepEqual(
    DOMAIN_KNOWLEDGE_AGENT_DEFINITIONS.map(({ agentId }) => agentId).sort(),
    [...AGENT_IDS].sort(),
  );
  assert.equal(DOMAIN_KNOWLEDGE_AGENT_DEFINITIONS.length, 7);
});

test('UI API and workflow executor use Application boundaries instead of concrete adapters', () => {
  const server = readFileSync('src/interfaces/runner/server.ts', 'utf8');
  assert.doesNotMatch(
    server,
    /composition\.(?:repository|artifacts|agents|service|query|scanner|automatedWorkflow)\b/,
  );
  assert.doesNotMatch(server, /from ['"]\.\/(?:console-read-model|demo-report)\.ts['"]|await buildDemoReport\(/);
  assert.match(server, /composition\.apps\.orchestrator/);

  const cli = readFileSync('src/interfaces/runner/cli.ts', 'utf8');
  assert.doesNotMatch(
    cli,
    /composition\.(?:repository|artifacts|agents|service|query|scanner|automatedWorkflow)\b/,
  );
  assert.doesNotMatch(cli, /from ['"][^'"]*infrastructure[^'"]*['"]/);
  assert.match(cli, /composition\.apps\.(?:flywheel|evalRunner|knowledgeSearch|knowledgeDiscovery|orchestrator)/);

  const executor = readFileSync('src/application/services/automated-project-workflow.ts', 'utf8');
  assert.doesNotMatch(executor, /this\.flywheel\.(?:repository|artifacts|qualityPolicy)\b/);
  assert.match(executor, /this\.evalRunner\.evaluate/);
});
