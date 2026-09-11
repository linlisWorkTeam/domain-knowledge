/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证DshConfiguredFlow的行为、约束及失败场景。
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type {
  ProviderEndpointPolicy, ProviderInvocationRecord, ProviderSettingsRecord, ProviderSettingsStore,
} from '../../src/application/ports/ApplicationPorts.ts';
import type { AutomatedProjectScenario } from '../../src/application/services/ApplicationServices.ts';
import { createComposition } from '../../src/interfaces/runner/Composition.ts';
import { cppTestOutput, orchestratorOutput } from '../helpers/CppScenario.ts';
import { GOOD_BODY } from '../helpers/Fixture.ts';

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

const counts: Record<string, number> = {};
function agentOutput(agentType: string, prompt: string): Record<string, unknown> {
  const count = counts[agentType] = (counts[agentType] ?? 0) + 1;

  switch (agentType) {
    case 'orchestrator':
      return orchestratorOutput('dsh-module', count - 1);
    case 'doc-worker':
      return {
        workerId: 'worker-1',
        fragment: 'The public contract returns the fixed value four and is covered by a behavior test.',
        provenance: ['src/module.cpp'],
        analysisScope: { moduleId: 'dsh-module', files: ['src/module.cpp'], symbols: [] },
        sourceEvidence: ['src/module.cpp'].map((path) => ({ claim: 'Returns four', path })),
        unresolvedQuestions: [],
      };
    case 'doc-gen':
      return {
        body: `${GOOD_BODY}\n\n## 行为契约\n\n公开函数必须返回固定数值 ${count === 1 ? 3 : 4}，且由隔离行为测试验证。`,
        title: 'DSH 最小知识批次', keywords: ['DSH'],
        description: '使用真实 DSH SDK 生成并通过确定性门禁的知识。',
      };
    case 'test-gen':
      if (count > 1) {
        assert.match(prompt, /calculate\(\) == 3/);
        assert.match(prompt, /case-1/);
      }
      {
        const output = cppTestOutput(count === 1 ? 3 : 4);
        if (count === 1) output.files[0]!.content = '#include <cassert>\nint calculate();\nint test_public_result(void) { assert(calculate() == 3); return 0; }\n';
        return output;
      }
    case 'code':
      return { files: [{ path: 'src/module.cpp', content: `int calculate() { return ${count === 1 ? 3 : 4}; }\n` }] };
    case 'check':
      return { blocking: count === 1, findings: count === 1 ? [{ ruleId: 'behavior', sourcePath: 'src/module.cpp', path: 'src/module.cpp', original: 'return 4;', generated: 'return 3;', message: 'The generated return value contradicts the source.', severity: 'BLOCKER' }] : [], scope: ['src/module.cpp'] };
    case 'review':
      if (count > 1) {
        assert.match(prompt, /previousCorrectionRefs/);
        assert.match(prompt, /generated-iteration-0/);
        assert.match(prompt, /return 3/);
      }
      return { blocking: count === 1, historySummary: '第 0 轮将返回值错误记为 3，重建测评失败；本轮修订为 4 后测试通过，未发现回归。', corrections: count === 1 ? [{ correctionId: 'COR-0001', knowledgePath: '公开函数必须返回固定数值 3，且由隔离行为测试验证。', problem: '知识返回值为 3，与参考及测试期望 4 不符。', suggestion: '将行为契约的返回值纠正为 4。', evidence: ['comparison', 'evaluation'] }] : [] };
    default:
      throw new Error(`unexpected Agent type: ${agentType}`);
  }
}

test('full SDK workflow repairs tests, revises knowledge and publishes only after independent evaluation', async () => {
  const retained = process.env.WP_ACCEPTANCE_OUTPUT;
  if (retained) mkdirSync(retained, { recursive: true });
  const repositoryRoot = mkdtempSync(join(retained ?? tmpdir(), 'source-'));
  const runtimeDir = mkdtempSync(join(retained ?? tmpdir(), 'runtime-'));
  mkdirSync(join(repositoryRoot, 'src'));
  writeFileSync(join(repositoryRoot, 'src/module.cpp'), 'int calculate() { return 4; }\n');
  git(repositoryRoot, ['init']);
  git(repositoryRoot, ['config', 'user.email', 'pi-agent@example.invalid']);
  git(repositoryRoot, ['config', 'user.name', 'DSH Acceptance']);
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
    const output = JSON.stringify(agentOutput(agentType, prompt));
    if (retained) appendFileSync(join(retained, 'model-exchanges.jsonl'), JSON.stringify({ sequence: invokedRoles.length, role: agentType, request: payload, prompt, response: JSON.parse(output) }) + '\n');
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
  const invocations: ProviderInvocationRecord[] = [];
  const previousIsolation = process.env.WP_DSH_PROCESS_ISOLATION;
  process.env.WP_DSH_PROCESS_ISOLATION = 'none'; // controlled transport test; isolation has dedicated tests
  const composition = createComposition({
    runtimeDir, repositoryRoot, evaluationArtifactsDirectory: retained ? join(retained, 'evaluations') : undefined,
    operationalMetrics: { recordProviderInvocation: (record) => { invocations.push(record); }, runs: () => ({}), governance: () => ({}) },
    providerSettingsStore: store,
    providerEndpointPolicy: endpointPolicy,
    providerProbe: { verify: async ({ model }) => ({ status: 'VERIFIED', reasonCode: 'READY', model }) },
  });
  try {
    await composition.apps.providerOperations.put({
      provider: 'deepseek-harness', apiUrl, apiKey: 'acceptance-key', model: 'test-model', expectedRevision: 0,
    });
    await composition.apps.providerOperations.verify({ expectedRevision: 1 });
    assert.ok(store.value);
    const workflow = await composition.automatedWorkflow();
    const commands = [{ tool: 'g++' as const, purpose: 'check' as const, args: ['-std=c++17', 'src/module.cpp', 'tests/generated.cpp', '-o', 'test-bin'] },
      { tool: 'binary' as const, purpose: 'test' as const, args: ['test-bin'] }];
    const scenario: AutomatedProjectScenario = {
      schemaVersion: '1.0', name: 'dsh-minimum', moduleId: 'dsh-module',
      repositoryRoot, expectedCommit: commit,
      sourcePaths: ['src/module.cpp'],
      publicInterfacePaths: [],
      allowedGeneratedPaths: ['src/module.cpp'], prepareCommands: [],
      referenceCommands: commands, firstIterationCommands: commands, finalCommands: commands,
      comparisonRules: [{ id: 'behavior', description: 'Compare public return values' }],
      agentConfiguration: { languageId: 'cpp', standard: 'c++17', dependencies: [], constraints: [], testPaths: ['tests/generated.cpp'] },
    };
    if (retained) writeFileSync(join(retained, 'scenario.json'), JSON.stringify(scenario, null, 2));
    const handle = await workflow.start(scenario, {
      policyId: 'dsh-acceptance-v1', minimumStability: 1, requireAllTests: true,
      maxIterations: 2, workerCount: 1,
    });
    const result = await workflow.wait(handle.runId);
    if (retained) writeFileSync(join(retained, 'workflow-result.json'), JSON.stringify({ result, run: composition.service.getRun(handle.runId), events: composition.repository.listEvents(handle.runId), invocations }, null, 2));
    assert.equal(result.executionStatus, 'COMPLETED', result.error ?? '');
    assert.equal(result.route, 'PASS');
    assert.equal(composition.runConfiguration.get(handle.runId)?.provider.kind, 'deepseek-harness');
    assert.deepEqual([...new Set(invokedRoles)].sort(), [
      'check', 'code', 'doc-gen', 'doc-worker', 'orchestrator', 'review', 'test-gen',
    ]);
    assert.equal(counts['test-gen'], 2);
    assert.equal(counts.review, 2);
    assert.ok(invocations.length >= 13);
    assert.equal(invocations.every((record) => record.status === 'SUCCEEDED'), true);
    assert.equal(invocations.every((record) => record.inputTokens === 100 && record.outputTokens === 20), true);
    assert.equal(composition.service.status().publications, 1);
  } finally {
    composition.close();
    if (previousIsolation === undefined) delete process.env.WP_DSH_PROCESS_ISOLATION;
    else process.env.WP_DSH_PROCESS_ISOLATION = previousIsolation;
    upstream.close();
    await once(upstream, 'close');
    if (!retained) { rmSync(repositoryRoot, { recursive: true, force: true }); rmSync(runtimeDir, { recursive: true, force: true }); }
  }
});
