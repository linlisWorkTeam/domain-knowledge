/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证Docgen样例的行为、约束及失败场景。
 */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createComposition, componentRoot } from '../../../interfaces/runner/Composition.ts';
import { checkDocGenDocument, DOCGEN_SOURCE_COMMIT, DOCGEN_SOURCE_SHA256, prepareDocGenReference } from './examples/DocGenReference.ts';
import { structuredMarkdownDiff } from '../../knowledge/MarkdownDiff.ts';
import { executeDevelopmentStage } from '../../../application/services/AgentDevelopmentObserver.ts';
import type { AgentExampleInput } from '../../../application/services/AgentExample.ts';
import { sha256, type ArtifactRef } from '../../Domain.ts';
import type { WorkflowStageInput } from '../../../application/ports/ApplicationPorts.ts';

function body() {
  return '# 受控 DocGen\n\n## Examples\n证据 src/domain/services/markdown-diff.ts:L142-L150\n\n```json\n' + JSON.stringify({ examples: [
    { before: '', after: '', expectedHunkCount: 0, expectedChangedSections: [] },
    { before: 'a\r\nb', after: 'a\nb', expectedHunkCount: 0, expectedChangedSections: [] },
    { before: '# A\nold', after: '# A\nnew', expectedHunkCount: 1, expectedChangedSections: ['# A'] },
  ] }) + '\n```\n';
}

test('DocGen checker rejects wrong expectations, absent coverage, malformed data and invalid citations', () => {
  assert.equal(checkDocGenDocument(body(), structuredMarkdownDiff, 200).examples, 3);
  assert.throws(() => checkDocGenDocument(body().replace('"expectedHunkCount":1', '"expectedHunkCount":0'), structuredMarkdownDiff, 200), /HUNKS_MISMATCH/);
  assert.throws(() => checkDocGenDocument(body().replace('a\\r\\nb', 'a\\nb'), structuredMarkdownDiff, 200), /COVERAGE_MISSING/);
  assert.throws(() => checkDocGenDocument(body(), structuredMarkdownDiff, 100), /CITATION_RANGE_INVALID/);
  assert.throws(() => checkDocGenDocument(body().replace('```json', '```javascript'), structuredMarkdownDiff, 200), /EXAMPLES_REQUIRED/);
});

test('DocGen reference preflight checks the pinned source and seven real tests', async () => {
  const root = mkdtempSync(join(tmpdir(), 'docgen-reference-test-'));
  try {
    const reference = await prepareDocGenReference(componentRoot, root);
    assert.equal(reference.evidence.testsPassed, 7);
    assert.equal(reference.evidence.commit, DOCGEN_SOURCE_COMMIT);
    const sample = JSON.parse(readFileSync(new URL('./examples/DocGenFixedSourceSample.json', import.meta.url), 'utf8'));
    assert.equal(sha256(sample.materials.source.content), DOCGEN_SOURCE_SHA256);
    assert.equal(checkDocGenDocument(body(), reference.diff, reference.sourceLines).status, 'PASS');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('DocGen example uses the shared production DSH stages, freezes prompts and stores results without publication', async () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), 'docgen-native-example-'));
  const previous = process.env.WP_DSH_PROCESS_ISOLATION;
  process.env.WP_DSH_PROCESS_ISOLATION = 'none'; // controlled SSE transport, not a sandbox acceptance
  const prompts: string[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const payload = Buffer.concat(chunks).toString('utf8');
    prompts.push(payload);
    const outline = !payload.includes('当前阶段：body');
    const text = JSON.stringify(outline
      ? { title: '受控 DocGen', description: '机制验证', sections: [{ heading: 'Examples', purpose: '机制验证' }] }
      : { title: '受控 DocGen', description: '机制验证', sections: [{ sectionId: 'section-1', body: body().split('## Examples\n')[1] }] });
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.write(`data: ${JSON.stringify({ id: 'example', object: 'chat.completion.chunk', created: 1, model: 'controlled', choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }] })}\n\n`);
    response.write(`data: ${JSON.stringify({ id: 'example', object: 'chat.completion.chunk', created: 1, model: 'controlled', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 73, completion_tokens: 31 } })}\n\n`);
    response.end('data: [DONE]\n\n');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  const composition = createComposition({ runtimeDir,
    providerEndpointPolicy: { validate: async () => ({ url: new URL(`http://local.invalid:${port}/v1/`), addresses: ['127.0.0.1'] }) },
    providerProbe: { verify: async ({ model }) => ({ status: 'VERIFIED', reasonCode: 'GENERATION_READY', checks: { modelList: 'PASSED' as const, generation: 'PASSED' as const }, model }) },
  });
  try {
    await composition.apps.providerOperations.put({ provider: 'deepseek-harness', apiUrl: 'https://model.invalid/v1/', apiKey: 'controlled-secret', model: 'controlled', expectedRevision: 0 });
    await composition.apps.providerOperations.verify({ expectedRevision: 1 });
    const sample = JSON.parse(readFileSync(new URL('./examples/DocGenFixedSourceSample.json', import.meta.url), 'utf8')) as AgentExampleInput;
    sample.provider = 'dsh';
    sample.scenario.repositoryRoot = componentRoot;
    // 本用例验证已保存的提示词冻结；专用样例的追加指令不覆盖测试设置。
    delete sample.promptAddon;
    composition.apps.orchestrator.updatePromptAddon('doc-gen', 'original-example-instruction');
    const first = await composition.apps.agentExample.run('doc-gen', sample);
    composition.apps.orchestrator.updatePromptAddon('doc-gen', 'modified-example-instruction');
    const second = await composition.apps.agentExample.run('doc-gen', sample);
    assert.notEqual(first.runId, second.runId);
    assert.equal(prompts.length, 4);
    assert.match(prompts[0]!, /original-example-instruction/);
    assert.doesNotMatch(prompts[0]!, /modified-example-instruction/);
    assert.match(prompts[2]!, /modified-example-instruction/);
    assert.match(prompts[3]!, /modified-example-instruction/);
    assert.match(await composition.runConfiguration.resolvePrompt(first.runId, 'doc-gen'), /original-example-instruction/);
    const bodyRef = first.result.payload['bodyRef'] as ArtifactRef;
    const document = first.outputs.find(({ ref }) => ref.artifactId === bodyRef.artifactId)?.content;
    assert.equal(document, body());
    const command = JSON.parse(Buffer.from(await composition.artifacts.get(first.result.commandRef)).toString('utf8'));
    const sourceBytes = await composition.artifacts.get(command.payload.sourceRefs[0]);
    assert.equal(sha256(sourceBytes), DOCGEN_SOURCE_SHA256);
    assert.equal(checkDocGenDocument(document!, structuredMarkdownDiff, String(sample.materials.source!.content).split('\n').length).status, 'PASS');
    assert.equal(first.publication, 'NOT_EVALUATED');
    assert.equal(composition.apps.flywheel.status().publications, 0);
    const report = await composition.apps.orchestrator.buildDemoReport(first.runId);
    const calls = report.agentCalls as Array<{ correlation: { sessionId: string }; tokens: { input: number; output: number } }>;
    assert.equal(calls.length, 2);
    assert.equal(typeof calls[0]!.correlation.sessionId, 'string');
    assert.deepEqual({ input: calls[0]!.tokens.input, output: calls[0]!.tokens.output }, { input: 73, output: 31 });
    assert.doesNotMatch(JSON.stringify(report), /controlled-secret|original-example-instruction/);
    assert.ok(await composition.artifacts.verify(first.resultRef));
    assert.ok(await composition.artifacts.verify(bodyRef));
  } finally {
    composition.close();
    server.close(); await once(server, 'close');
    if (previous === undefined) delete process.env.WP_DSH_PROCESS_ISOLATION; else process.env.WP_DSH_PROCESS_ISOLATION = previous;
    rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test('single DocGen execution records failure and cancellation instead of late success', async () => {
  const abort = new AbortController();
  const statuses: string[] = [];
  const input: WorkflowStageInput = { runId: 'example-failure', nodeId: 'doc_gen', agentId: 'doc-gen', iteration: 0,
    maxIterations: 1, attempt: 1, prompt: '', context: {}, workerCount: 0, signal: abort.signal };
  await assert.rejects(executeDevelopmentStage(input, { execute: async () => { throw new Error('AGENT_OUTPUT_INVALID'); } }, { record: (projection) => { statuses.push(projection.status); } }), /AGENT_OUTPUT_INVALID/);
  await assert.rejects(executeDevelopmentStage(input, { execute: async () => { abort.abort(); return { detail: 'late' }; } }, { record: (projection) => { statuses.push(projection.status); } }), /AGENT_CANCELLED|Abort/);
  assert.deepEqual(statuses, ['RUNNING', 'FAILED', 'RUNNING', 'CANCELLED']);
});
