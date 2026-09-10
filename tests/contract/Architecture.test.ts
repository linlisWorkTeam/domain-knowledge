/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证Architecture的行为、约束及失败场景。
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { AGENT_IDS } from '../../src/application/ports/ApplicationPorts.ts';
import { DOMAIN_KNOWLEDGE_AGENT_DEFINITIONS } from '../../src/domain/services/workflow/AgentDefinitions.ts';

function files(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

test('domain core has no SDK, database, language, or adapter dependency', () => {
  for (const path of files('src/domain').filter((path) => path.endsWith('.ts') && !path.endsWith('.test.ts') && !path.includes('/examples/'))) {
    const source = readFileSync(path, 'utf8');
    // Tokenize comments and literals as whole tokens so prompt prose cannot become
    // an apparent dependency. Check static imports, re-exports and dynamic imports.
    const tokens = [...source.matchAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[A-Za-z_$][\w$]*|[^\s]/g)]
      .map(([token]) => token).filter((token) => !token.startsWith('//') && !token.startsWith('/*'));
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]!;
      if (!/^['"]/.test(token)) continue;
      const previous = tokens[i - 1];
      if (previous !== 'from' && previous !== 'import'
        && !(previous === '(' && ['import', 'require'].includes(tokens[i - 2] ?? ''))) continue;
      const dependency = token.slice(1, -1);
      assert.doesNotMatch(dependency, /(?:application|infrastructure|interfaces|langgraph|temporal|deepseek|dsh|sqlite|clang|gcc)/i, `${path}: forbidden import ${dependency}`);
      // 三个资源模块按目录约定归入 Domain；仅允许它们既有的资源访问依赖。
      const resourceImports: Record<string, readonly string[]> = {
        'src/domain/services/sourceScan/SourceScan.ts': ['node:fs', 'node:path'],
        'src/domain/services/workspace/LocalAgentWorkspace.ts': ['node:child_process', 'node:fs/promises', 'node:path'],
        'src/domain/services/migration/LegacyOkf.ts': ['node:fs', 'node:path', 'yaml'],
      };
      assert.ok(dependency.startsWith('.') || dependency === 'node:crypto' || resourceImports[path]?.includes(dependency), `${path}: concrete SDK dependency ${dependency}`);
    }
  }
});

test('application depends on ports and domain, never concrete adapters', () => {
  const source = files('src/application').map((path) => readFileSync(path, 'utf8')).join('\n');
  assert.doesNotMatch(source, /from\s+['"][^'"]*(?:infrastructure|interfaces)[^'"]*['"]/);
  assert.doesNotMatch(source, /ohmyworkpanel/i, 'shared application logic must not depend on a specific acceptance project');
});

test('infrastructure never depends on interface entrypoints', () => {
  const source = files('src/infrastructure').map((path) => readFileSync(path, 'utf8')).join('\n');
  assert.doesNotMatch(source, /from\s+['"][^'"]*interfaces[^'"]*['"]/);
});

test('LangGraph remains isolated in workflow infrastructure', () => {
  const application = files('src/application').map((path) => readFileSync(path, 'utf8')).join('\n');
  const infrastructure = files('src/infrastructure/langgraph')
    .filter((path) => path.endsWith('.ts'))
    .map((path) => readFileSync(path, 'utf8')).join('\n');
  assert.equal(application.toLowerCase().includes('@langchain/langgraph'), false);
  assert.match(infrastructure, /@langchain\/langgraph/);
  assert.doesNotMatch(infrastructure, /KnowledgeVersion|PublicationReceipt|EvaluationReport/);
  assert.doesNotMatch(infrastructure, /createServer|\/api\/v1/);
});

test('DDD application and domain-service boundaries are explicit without changing Agent topology', () => {
  for (const path of [
    'src/interfaces/uiApi/UiApi.ts',
    'src/application/apps/ApplicationApps.ts',
    'src/domain/services/workflow/FlywheelDomainService.ts',
    'src/domain/services/evaluation/EvalRunnerDomainService.ts',
    'src/domain/services/association/AssociationDomainService.ts',
    'src/infrastructure/redis/Redis.ts',
  ]) assert.equal(statSync(path).isFile(), true, `missing DDD boundary: ${path}`);

  const apps = readFileSync('src/application/apps/ApplicationApps.ts', 'utf8');
  for (const name of [
    'Orchestrator', 'FlywheelApp', 'EvalRunnerApp', 'KnowledgeSearchApp', 'KnowledgeDiscoveryApp',
    'ContentGovernanceApp', 'ProviderOperationsApp', 'OperationalMetricsApp',
  ]) assert.match(apps, new RegExp(`\\b${name}\\b`));

  const uiApi = readFileSync('src/interfaces/uiApi/UiApi.ts', 'utf8');
  assert.match(uiApi, /runner\/Server\.ts/);
  assert.deepEqual(
    DOMAIN_KNOWLEDGE_AGENT_DEFINITIONS.map(({ agentId }) => agentId).sort(),
    [...AGENT_IDS].sort(),
  );
  assert.equal(DOMAIN_KNOWLEDGE_AGENT_DEFINITIONS.length, 7);
});

test('UI API and workflow executor use Application boundaries instead of concrete adapters', () => {
  const server = readFileSync('src/interfaces/runner/Server.ts', 'utf8');
  assert.doesNotMatch(
    server,
    /composition\.(?:repository|artifacts|agents|service|query|scanner|automatedWorkflow)\b/,
  );
  assert.doesNotMatch(server, /from ['"]\.\/(?:ConsoleReadModel|DemoReport)\.ts['"]|await buildDemoReport\(/);
  assert.match(server, /composition\.apps\.orchestrator/);

  const cli = readFileSync('src/interfaces/runner/Cli.ts', 'utf8');
  assert.doesNotMatch(
    cli,
    /composition\.(?:repository|artifacts|agents|service|query|scanner|automatedWorkflow)\b/,
  );
  assert.doesNotMatch(cli, /from ['"][^'"]*infrastructure[^'"]*['"]/);
  assert.match(cli, /composition\.apps\.(?:flywheel|evalRunner|knowledgeSearch|knowledgeDiscovery|orchestrator)/);

  const executor = readFileSync('src/application/services/AutomatedProjectWorkflow.ts', 'utf8');
  assert.doesNotMatch(executor, /this\.flywheel\.(?:repository|artifacts|qualityPolicy)\b/);
  assert.match(executor, /this\.evalRunner\.evaluate/);
});

test('each role owns execution, contract and prompt while application commits without role branches', () => {
  for (const role of AGENT_IDS) {
    const name = role.split('-').map((part) => part[0]!.toUpperCase() + part.slice(1)).join('') + 'Agent';
  const directory = name[0]!.toLowerCase() + name.slice(1);
    for (const file of [`${name}.ts`, `${name}Contract.ts`, `${name}Prompt.ts`, `${name}.test.ts`, `examples/${name}Sample.json`]) {
      assert.ok(statSync(`src/domain/agents/${directory}/${file}`).isFile());
    }
    const agent = readFileSync(`src/domain/agents/${directory}/${name}.ts`, 'utf8');
    assert.match(agent, /export async function execute\(input: Input, context: ExecutionContext\)/);
    assert.doesNotMatch(agent, /WorkflowStageInput|putArtifact|executeNode|repository\./);
  }
  const stages = readFileSync('src/application/services/AutomatedProjectWorkflow.ts', 'utf8');
  assert.doesNotMatch(stages, /AGENT_OUTPUT_SCHEMAS|normalizeAgentResult|runLiveAgent/);
  const commit = readFileSync('src/application/services/RoleExecution.ts', 'utf8');
  assert.doesNotMatch(commit, /(?:agentType|agentId)\s*===|switch\s*\(/);
  const fixture = readFileSync('src/infrastructure/agentAdapters/scenario/ProjectWorkflowFixture.ts', 'utf8');
  assert.doesNotMatch(fixture, /extends ProjectWorkflowStages|override|commitAgentOutput/);
  assert.match(fixture, /modelFactory/);
  const development = readFileSync('src/application/services/AgentExample.ts', 'utf8');
  assert.match(development, /RoleExecutionService/);
  assert.doesNotMatch(development, /workflow\.start|\.evaluate\(|\.publish\(/);
});


test('external layers enter internal role execution through domain services', () => {
  for (const root of ['src/application', 'src/infrastructure', 'src/interfaces']) {
    for (const path of files(root).filter((path) => path.endsWith('.ts'))) {
      const source = readFileSync(path, 'utf8');
      assert.doesNotMatch(source, /(?:from\s*|import\s*\(|require\s*\()\s*['"][^'"]*domain\/agents\/(?:AgentRegistry|[^/]+\/[^/]+Agent)\.ts['"]/, `${path}: internal role execution must remain in Domain`);
    }
  }
  const application = readFileSync('src/application/services/RoleExecution.ts', 'utf8');
  assert.match(application, /domain\/services\/workflow\/AgentExecutionService\.ts/);
  for (const path of ['src/domain/services/association/AssociationDomainService.ts', 'src/domain/services/evaluation/EvalRunnerDomainService.ts']) {
    const source = readFileSync(path, 'utf8');
    assert.doesNotMatch(source, /from\s*['"][^'"]*agents\//, `${path}: deterministic service must not invoke a generative role`);
  }
});
