import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type {
  ProviderEndpointPolicy, ProviderInvocationRecord, ProviderSettingsRecord, ProviderSettingsStore,
} from '../../src/application/ports/index.ts';
import {
  AutomatedProjectWorkflowService, OhMyWorkPanelWorkflowExecutor,
  type AutomatedProjectScenario,
} from '../../src/application/services/index.ts';
import { JsonSchemaAgentContractValidator } from '../../src/infrastructure/agents/contracts/index.ts';
import { PiCodingAgentProvider } from '../../src/infrastructure/agents/pi-agent/index.ts';
import { LocalAgentWorkspace } from '../../src/infrastructure/agents/workspace/index.ts';
import { TrustedProjectEvaluator } from '../../src/infrastructure/evaluation/project/index.ts';
import { createDomainKnowledgeInfrastructure } from '../../src/infrastructure/workflow/langgraph/index.ts';
import { createComposition } from '../../src/interfaces/runner/composition.ts';
import { GOOD_BODY } from '../helpers/fixture.ts';

class MemorySettings implements ProviderSettingsStore {
  value: ProviderSettingsRecord | null = null;
  load() { return this.value ? structuredClone(this.value) : null; }
  save(value: ProviderSettingsRecord) { this.value = structuredClone(value); }
}

function git(root: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function agentOutput(agentType: string): Record<string, unknown> {
  switch (agentType) {
    case 'orchestrator':
      return { strategy: 'fixed-knowledge-flywheel-v1', iteration: 0, parallel: ['documentation', 'test-generation'] };
    case 'doc-worker':
      return {
        workerId: 'worker-1',
        fragment: 'The public contract returns the fixed value four and is covered by a behavior test.',
        provenance: ['src/module.js', 'src/module.test.js'],
      };
    case 'doc-gen':
      return {
        body: `${GOOD_BODY}\n\n## 行为契约\n\n公开函数必须返回固定数值 4，且由隔离行为测试验证。`,
        title: 'Pi Agent 最小知识批次',
        description: '使用真实 Pi Agent SDK 生成并通过确定性门禁的知识。',
      };
    case 'test-gen':
      return {
        candidateCommands: [{ tool: 'node', purpose: 'test', args: ['--test', 'src/module.test.js'] }],
        oracleRequired: true,
      };
    case 'code':
      return { files: [{ path: 'src/module.js', content: 'export const calculate = () => 4;\n' }] };
    case 'check':
      return { blocking: false, findings: [], scope: ['src/module.js'] };
    case 'review':
      return { blocking: false, recommendation: 'PASS', correction: null };
    default:
      throw new Error(`unexpected Agent type: ${agentType}`);
  }
}

test('a minimum complete Run sends all seven governed nodes through the real Pi SDK adapter', async () => {
  const repositoryRoot = mkdtempSync(join(tmpdir(), 'pi-flow-source-'));
  const runtimeDir = mkdtempSync(join(tmpdir(), 'pi-flow-runtime-'));
  const assetRoot = mkdtempSync(join(tmpdir(), 'pi-flow-assets-'));
  mkdirSync(join(repositoryRoot, 'src'));
  writeFileSync(join(repositoryRoot, 'package.json'), '{"name":"pi-flow","type":"module"}\n');
  writeFileSync(join(repositoryRoot, 'src', 'contract.js'), 'export const expected = 4;\n');
  writeFileSync(join(repositoryRoot, 'src', 'module.js'), 'export const calculate = () => 4;\n');
  writeFileSync(join(repositoryRoot, 'src', 'module.test.js'), `
import assert from 'node:assert/strict';
import test from 'node:test';
import { expected } from './contract.js';
import { calculate } from './module.js';
test('generated behavior', () => assert.equal(calculate(), expected));
`.trimStart());
  git(repositoryRoot, ['init']);
  git(repositoryRoot, ['config', 'user.email', 'pi-agent@example.invalid']);
  git(repositoryRoot, ['config', 'user.name', 'Pi Agent Acceptance']);
  git(repositoryRoot, ['add', '.']);
  git(repositoryRoot, ['commit', '-m', 'fixture']);
  const commit = git(repositoryRoot, ['rev-parse', 'HEAD']);

  const invokedRoles: string[] = [];
  const upstream = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
      messages?: Array<{ content?: string | Array<{ text?: string }> }>;
    };
    const prompt = (payload.messages ?? []).map((message) => (
      typeof message.content === 'string' ? message.content
        : (message.content ?? []).map((part) => part.text ?? '').join('')
    )).join('\n');
    const agentType = prompt.match(/"agentType":"([^"]+)"/)?.[1] ?? '';
    invokedRoles.push(agentType);
    const output = JSON.stringify(agentOutput(agentType));
    const common = { id: `chatcmpl-${invokedRoles.length}`, object: 'chat.completion.chunk', created: 1, model: 'test-model' };
    response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' });
    response.write(`data: ${JSON.stringify({
      ...common,
      choices: [{ index: 0, delta: { role: 'assistant', content: output }, finish_reason: null }],
    })}\n\n`);
    response.write(`data: ${JSON.stringify({
      ...common,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
    })}\n\n`);
    response.end('data: [DONE]\n\n');
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  assert.ok(address && typeof address === 'object');
  const apiUrl = `http://provider.invalid:${address.port}/v1`;
  const endpointPolicy: ProviderEndpointPolicy = {
    validate: async () => ({ url: new URL(`${apiUrl}/`), addresses: ['127.0.0.1'] }),
  };
  const store = new MemorySettings();
  const composition = createComposition({
    runtimeDir,
    providerSettingsStore: store,
    providerEndpointPolicy: endpointPolicy,
    providerProbe: { verify: async ({ model }) => ({ status: 'VERIFIED', reasonCode: 'READY', model }) },
  });
  const invocations: ProviderInvocationRecord[] = [];
  try {
    await composition.apps.providerOperations.put({
      provider: 'pi-agent', apiUrl, apiKey: 'acceptance-key', model: 'test-model', expectedRevision: 0,
    });
    await composition.apps.providerOperations.verify({ expectedRevision: 1 });
    assert.ok(store.value);
    const provider = new PiCodingAgentProvider({
      settings: store.value,
      agentDir: join(runtimeDir, 'pi-agent'),
      endpointPolicy,
      onInvocation: (record) => { invocations.push(record); },
    });
    const executor = new OhMyWorkPanelWorkflowExecutor({
      flywheel: composition.apps.flywheel,
      evalRunner: composition.apps.evalRunner,
      evaluator: new TrustedProjectEvaluator(composition.artifacts),
      assetRoot,
      contracts: new JsonSchemaAgentContractValidator(join(process.cwd(), 'specs', 'schemas')),
      agent: provider,
      agentWorkspaces: new LocalAgentWorkspace({
        workspaceRoot: join(runtimeDir, 'agent-workspaces'), allowedSourceRoots: [repositoryRoot],
      }),
    });
    const infrastructure = await createDomainKnowledgeInfrastructure({
      executor,
      observer: composition.workflowObserver,
      prompts: composition.runConfiguration,
      checkpoint: { kind: 'memory' },
    });
    const workflow = new AutomatedProjectWorkflowService(
      composition.service, infrastructure.engine, composition.runConfiguration,
    );
    const command = { tool: 'node' as const, purpose: 'test' as const, args: ['--test', 'src/module.test.js'] };
    const scenario: AutomatedProjectScenario = {
      schemaVersion: '1.0', name: 'pi-agent-minimum', moduleId: 'pi-agent-module',
      repositoryRoot, expectedCommit: commit,
      sourcePaths: ['src/module.js', 'src/module.test.js'],
      publicInterfacePaths: ['src/contract.js', 'package.json'],
      allowedGeneratedPaths: ['src/module.js'], prepareCommands: [],
      referenceCommands: [command], firstIterationCommands: [command], finalCommands: [command],
      assets: {
        knowledgeV1: 'unused', knowledgeV2: 'unused', codeV1: 'unused', codeV2: 'unused',
        correction: 'unused', generatedPath: 'src/module.js', title: 'unused', description: 'unused',
      },
    };
    const handle = await workflow.start(scenario, {
      policyId: 'pi-agent-acceptance-v1', minimumStability: 1, requireAllTests: true,
      maxIterations: 1, workerCount: 1,
    });
    const result = await workflow.wait(handle.runId);
    assert.equal(result.executionStatus, 'COMPLETED');
    assert.equal(result.route, 'PASS');
    assert.equal(composition.runConfiguration.get(handle.runId)?.provider.kind, 'pi-agent');
    assert.deepEqual([...new Set(invokedRoles)].sort(), [
      'check', 'code', 'doc-gen', 'doc-worker', 'orchestrator', 'review', 'test-gen',
    ]);
    assert.equal(invocations.length, 7);
    assert.equal(invocations.every((record) => record.status === 'SUCCEEDED'), true);
    assert.equal(invocations.every((record) => record.inputTokens === 100 && record.outputTokens === 20), true);
    assert.equal(composition.service.status().publications, 1);
  } finally {
    composition.close();
    upstream.close();
    await once(upstream, 'close');
    rmSync(repositoryRoot, { recursive: true, force: true });
    rmSync(runtimeDir, { recursive: true, force: true });
    rmSync(assetRoot, { recursive: true, force: true });
  }
});
