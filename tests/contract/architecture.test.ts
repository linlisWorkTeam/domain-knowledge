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
      assert.ok(dependency.startsWith('.') || dependency === 'node:crypto', `${path}: concrete SDK dependency ${dependency}`);
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
    'ContentGovernanceApp', 'ProviderOperationsApp', 'OperationalMetricsApp',
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

test('each role owns execution, contract and prompt while application commits without role branches', () => {
  for (const role of AGENT_IDS) {
    for (const file of ['agent.ts', 'contract.ts', 'prompt.ts', 'agent.test.ts', 'examples/sample.json']) {
      assert.ok(statSync(`src/domain/agents/${role}/${file}`).isFile());
    }
    const agent = readFileSync(`src/domain/agents/${role}/agent.ts`, 'utf8');
    assert.match(agent, /export async function execute\(input: Input, context: ExecutionContext\)/);
    assert.doesNotMatch(agent, /WorkflowStageInput|putArtifact|executeNode|repository\./);
  }
  const stages = readFileSync('src/application/services/automated-project-workflow.ts', 'utf8');
  assert.doesNotMatch(stages, /AGENT_OUTPUT_SCHEMAS|normalizeAgentResult|runLiveAgent/);
  const commit = readFileSync('src/application/services/role-execution.ts', 'utf8');
  assert.doesNotMatch(commit, /(?:agentType|agentId)\s*===|switch\s*\(/);
  const fixture = readFileSync('src/infrastructure/agents/scenario/project-workflow-fixture.ts', 'utf8');
  assert.doesNotMatch(fixture, /extends ProjectWorkflowStages|override|commitAgentOutput/);
  assert.match(fixture, /modelFactory/);
  const development = readFileSync('src/application/services/agent-example.ts', 'utf8');
  assert.match(development, /RoleExecutionService/);
  assert.doesNotMatch(development, /workflow\.start|\.evaluate\(|\.publish\(/);
});
