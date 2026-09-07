import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createComposition, componentRoot } from '../../src/interfaces/runner/composition.ts';
import { checkDocgenDocument, DOCGEN_SOURCE_COMMIT, DOCGEN_SOURCE_PATH, prepareDocgenReference } from '../../src/interfaces/runner/docgen-example.ts';
import { structuredMarkdownDiff } from '../../src/domain/services/markdown-diff.ts';
import { executeDocgenExample } from '../../src/infrastructure/workflow/langgraph/docgen-example.ts';
import type { WorkflowStageInput } from '../../src/application/ports/index.ts';

function body() {
  return '# structuredMarkdownDiff\n\n证据 src/domain/services/markdown-diff.ts:L142-L150\n\n```json\n' + JSON.stringify({ examples: [
    { before: '', after: '', expectedHunkCount: 0, expectedChangedSections: [] },
    { before: 'a\r\nb', after: 'a\nb', expectedHunkCount: 0, expectedChangedSections: [] },
    { before: '# A\nold', after: '# A\nnew', expectedHunkCount: 1, expectedChangedSections: ['# A'] },
  ] }) + '\n```';
}

test('DocGen checker rejects wrong expectations, absent coverage, malformed data and invalid citations', () => {
  assert.equal(checkDocgenDocument(body(), structuredMarkdownDiff, 200).examples, 3);
  assert.throws(() => checkDocgenDocument(body().replace('"expectedHunkCount":1', '"expectedHunkCount":0'), structuredMarkdownDiff, 200), /HUNKS_MISMATCH/);
  assert.throws(() => checkDocgenDocument(body().replace('a\\r\\nb', 'a\\nb'), structuredMarkdownDiff, 200), /COVERAGE_MISSING/);
  assert.throws(() => checkDocgenDocument(body(), structuredMarkdownDiff, 100), /CITATION_RANGE_INVALID/);
  assert.throws(() => checkDocgenDocument(body().replace('```json', '```javascript'), structuredMarkdownDiff, 200), /EXAMPLES_REQUIRED/);
});

test('DocGen reference preflight checks the pinned source and seven real tests', async () => {
  const root = mkdtempSync(join(tmpdir(), 'docgen-reference-test-'));
  try {
    const reference = await prepareDocgenReference(componentRoot, root);
    assert.equal(reference.evidence.testsPassed, 7);
    assert.equal(reference.evidence.commit, DOCGEN_SOURCE_COMMIT);
    assert.equal(checkDocgenDocument(body(), reference.diff, reference.sourceLines).status, 'PASS');
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
    const text = JSON.stringify({ title: '受控 DocGen', description: '机制验证', body: body() });
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
    providerProbe: { verify: async ({ model }) => ({ status: 'VERIFIED', reasonCode: 'READY', model }) },
  });
  try {
    await composition.apps.providerOperations.put({ provider: 'deepseek-harness', apiUrl: 'https://model.invalid/v1/', apiKey: 'controlled-secret', model: 'controlled', expectedRevision: 0 });
    await composition.apps.providerOperations.verify({ expectedRevision: 1 });
    const scenario = { schemaVersion: '1.0' as const, name: 'docgen', moduleId: 'markdown-diff', repositoryRoot: componentRoot,
      expectedCommit: DOCGEN_SOURCE_COMMIT, sourcePaths: [DOCGEN_SOURCE_PATH], publicInterfacePaths: [DOCGEN_SOURCE_PATH],
      allowedGeneratedPaths: [DOCGEN_SOURCE_PATH], prepareCommands: [], referenceCommands: [], firstIterationCommands: [], finalCommands: [] };
    composition.apps.orchestrator.updatePromptAddon('doc-gen', 'original-example-instruction');
    const first = await composition.apps.docgenExample.run(scenario);
    composition.apps.orchestrator.updatePromptAddon('doc-gen', 'modified-example-instruction');
    const second = await composition.apps.docgenExample.run(scenario);
    assert.notEqual(first.runId, second.runId);
    assert.equal(prompts.length, 2);
    assert.match(prompts[0]!, /original-example-instruction/);
    assert.doesNotMatch(prompts[0]!, /modified-example-instruction/);
    assert.match(prompts[1]!, /modified-example-instruction/);
    assert.match(await composition.runConfiguration.resolvePrompt(first.runId, 'doc-gen'), /original-example-instruction/);
    assert.equal(first.body, body());
    assert.equal(first.sourceCommit, DOCGEN_SOURCE_COMMIT);
    assert.equal(first.publication, 'NOT_EVALUATED');
    assert.equal(composition.apps.flywheel.status().publications, 0);
    const report = await composition.apps.orchestrator.buildDemoReport(first.runId);
    const calls = report.agentCalls as Array<{ correlation: { sessionId: string }; tokens: { input: number; output: number } }>;
    assert.equal(calls.length, 1);
    assert.equal(typeof calls[0]!.correlation.sessionId, 'string');
    assert.deepEqual({ input: calls[0]!.tokens.input, output: calls[0]!.tokens.output }, { input: 73, output: 31 });
    assert.doesNotMatch(JSON.stringify(report), /controlled-secret|original-example-instruction/);
    assert.ok(await composition.artifacts.verify(first.resultRef));
    assert.ok(await composition.artifacts.verify(first.bodyRef));
  } finally {
    composition.close();
    server.close(); await once(server, 'close');
    if (previous === undefined) delete process.env.WP_DSH_PROCESS_ISOLATION; else process.env.WP_DSH_PROCESS_ISOLATION = previous;
    rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test('single DocGen graph records failure and cancellation instead of late success', async () => {
  const abort = new AbortController();
  const statuses: string[] = [];
  const input: WorkflowStageInput = { runId: 'example-failure', nodeId: 'doc_gen', agentId: 'doc-gen', iteration: 0,
    maxIterations: 1, attempt: 1, prompt: '', context: {}, workerCount: 0, signal: abort.signal };
  await assert.rejects(executeDocgenExample(input, { execute: async () => { throw new Error('AGENT_OUTPUT_INVALID'); } }, { record: (projection) => { statuses.push(projection.status); } }), /AGENT_OUTPUT_INVALID/);
  await assert.rejects(executeDocgenExample(input, { execute: async () => { abort.abort(); return { detail: 'late' }; } }, { record: (projection) => { statuses.push(projection.status); } }), /AGENT_CANCELLED|Abort/);
  assert.deepEqual(statuses, ['RUNNING', 'FAILED', 'RUNNING', 'CANCELLED']);
});
