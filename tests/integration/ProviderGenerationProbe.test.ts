/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：通过受控端点验证真实生产 DSH 探针、隔离、预算和失败分段。
 */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { OpenAiCompatibleProviderProbe } from '../../src/infrastructure/agentAdapters/provider/ProviderConnectionProbe.ts';
import { modelProcessLane } from '../../src/infrastructure/agentAdapters/ModelProcessLane.ts';

const completion = (content: string): string => {
  const base = { id: 'probe-test', object: 'chat.completion.chunk', created: 1, model: 'probe-model' };
  return `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }] })}\n\n`
    + `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`
    + 'data: [DONE]\n\n';
};

async function controlled(handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'probe-test-'));
  const server = createServer((request, response) => {
    void Promise.resolve(handler(request, response)).catch(() => { response.destroy(); });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  return { directory,
    // 测试直接注入已批准端点，生产入口仍只允许 PublicHttps 策略返回的公开 HTTPS。
    input: { endpoint: { url: new URL(`http://provider-does-not-resolve.invalid:${port}/v1/`), addresses: ['127.0.0.1'] },
      apiKey: 'controlled-private-test-key', model: 'probe-model' },
    close: async () => { await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); });
      await rm(directory, { recursive: true, force: true }); },
  };
}

test('provider probe uses one native isolated generation after models discovery', async () => {
  const paths: string[] = [];
  const headers: IncomingMessage['headers'][] = [];
  const bodies: Record<string, unknown>[] = [];
  const fixture = await controlled(async (request, response) => {
    paths.push(request.url!);
    headers.push(request.headers);
    if (request.method === 'GET') { response.end(JSON.stringify({ data: [{ id: 'probe-model' }] })); return; }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    bodies.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.end(completion('{"answer":"ok"}'));
  });
  try {
    const result = await new OpenAiCompatibleProviderProbe(30_000, fixture.directory).verify({ ...fixture.input, model: null });
    assert.deepEqual(result, { status: 'VERIFIED', reasonCode: 'GENERATION_READY', model: 'probe-model',
      checks: { modelList: 'PASSED', generation: 'PASSED' } });
    assert.deepEqual(paths, ['/v1/models', '/v1/chat/completions']);
    assert.equal(headers[1]!['user-agent'], 'domain-knowledge/0.2.0');
    assert.match(String(headers[1]!['x-opencode-session']), /^wp-[a-f0-9]{32}$/);
    assert.equal(headers[1]!.authorization, 'Bearer controlled-private-test-key');
    assert.equal(bodies[0]!.max_tokens, 64);
    assert.equal(bodies[0]!.stream, true);
    assert.ok(!Array.isArray(bodies[0]!.tools) || bodies[0]!.tools.length === 0, 'probe grants no model tools');
    assert.doesNotMatch(JSON.stringify(result), /controlled-private-test-key|provider-does-not-resolve/);
    assert.deepEqual(await readdir(fixture.directory), [], 'native child exits before ephemeral material cleanup');
  } finally { await fixture.close(); }
});

test('models success never masks generation rejection, malformed JSON, redirects or extra tool requests', async (t) => {
  for (const mode of ['rejected', 'invalid-json', 'redirect', 'tool-loop', 'output-limit'] as const) {
    await t.test(mode, async () => {
      let generations = 0;
      const fixture = await controlled((request, response) => {
        if (request.method === 'GET') { response.end(JSON.stringify({ data: [{ id: 'probe-model' }] })); return; }
        generations += 1;
        if (mode === 'rejected') { response.writeHead(403); response.end('secret response must not escape'); return; }
        if (mode === 'redirect') { response.writeHead(302, { location: '/private-target' }); response.end(); return; }
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        if (mode === 'tool-loop') {
          const base = { id: 'probe-tool', object: 'chat.completion.chunk', created: 1, model: 'probe-model' };
          response.end(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { tool_calls: [{ index: 0,
            id: 'read-tool', type: 'function', function: { name: 'read_material', arguments: '{"path":"secret.txt"}' } }] }, finish_reason: null }] })}\n\n`
            + `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] })}\n\n`
            + 'data: [DONE]\n\n');
          return;
        }
        response.end(completion(mode === 'output-limit' ? 'x'.repeat(70_000) : '{"wrong":true}'));
      });
      try {
        const result = await new OpenAiCompatibleProviderProbe(30_000, fixture.directory).verify(fixture.input);
        assert.equal(result.status, 'FAILED');
        assert.deepEqual(result.checks, { modelList: 'PASSED', generation: 'FAILED' });
        assert.match(result.reasonCode, /^GENERATION_/);
        assert.equal(generations, 1, 'no retry, redirect follow or second billable tool request');
        assert.doesNotMatch(JSON.stringify(result), /secret response|controlled-private-test-key|private-target/);
        assert.deepEqual(await readdir(fixture.directory), []);
      } finally { await fixture.close(); }
    });
  }
});

test('explicit cancellation closes active native generation and removes temporary state', async () => {
  const abort = new AbortController();
  let generations = 0;
  let generationClosed = false;
  const fixture = await controlled((request, response) => {
    if (request.method === 'GET') { response.end(JSON.stringify({ data: [{ id: 'probe-model' }] })); return; }
    generations += 1;
    response.once('close', () => { generationClosed = true; });
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.write(': keep-alive\n\n');
    abort.abort(new Error('CLIENT_DISCONNECTED'));
  });
  try {
    const result = await new OpenAiCompatibleProviderProbe(30_000, fixture.directory).verify(fixture.input, abort.signal);
    assert.equal(result.reasonCode, 'GENERATION_CANCELLED');
    assert.equal(generations, 1);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(generationClosed, true);
    assert.deepEqual(await readdir(fixture.directory), []);
  } finally { await fixture.close(); }
});

test('the total probe deadline includes the shared ECS queue and never contacts the provider after expiry', async () => {
  let release!: () => void;
  const blocker = modelProcessLane.execute(() => new Promise<void>((resolve) => { release = resolve; }));
  await new Promise((resolve) => setImmediate(resolve));
  let requests = 0;
  const fixture = await controlled((_request, response) => { requests += 1; response.end('{}'); });
  try {
    const result = await new OpenAiCompatibleProviderProbe(30, fixture.directory).verify(fixture.input);
    assert.equal(result.reasonCode, 'MODEL_LIST_TIMEOUT');
    assert.deepEqual(result.checks, { modelList: 'FAILED', generation: 'NOT_RUN' });
    assert.equal(requests, 0);
    assert.deepEqual(await readdir(fixture.directory), []);
  } finally { release(); await blocker; await fixture.close(); }
});

test('the total deadline terminates an active generation without retrying', async () => {
  let generations = 0;
  const fixture = await controlled((request, response) => {
    if (request.method === 'GET') { response.end(JSON.stringify({ data: [{ id: 'probe-model' }] })); return; }
    generations += 1;
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.write(': keep-alive\n\n');
  });
  try {
    const started = Date.now();
    const result = await new OpenAiCompatibleProviderProbe(2500, fixture.directory).verify(fixture.input);
    assert.equal(result.reasonCode, 'GENERATION_TIMEOUT');
    assert.equal(generations, 1);
    assert.ok(Date.now() - started < 6000, 'shutdown must not leave a pending native call');
    assert.deepEqual(await readdir(fixture.directory), []);
  } finally { await fixture.close(); }
});

test('list failures and slow responses are bounded without spawning a generation', async (t) => {
  for (const mode of ['auth', 'redirect', 'invalid', 'oversize', 'timeout'] as const) {
    await t.test(mode, async () => {
      const requests: string[] = [];
      const fixture = await controlled((request, response) => {
        requests.push(request.url!);
        if (mode === 'auth') { response.writeHead(401); response.end('do not reveal this'); }
        else if (mode === 'redirect') { response.writeHead(302, { location: '/hidden' }); response.end(); }
        else if (mode === 'invalid') response.end('not-json');
        else if (mode === 'oversize') response.end('x'.repeat(70_000));
        else response.write(' ');
      });
      try {
        const result = await new OpenAiCompatibleProviderProbe(mode === 'timeout' ? 100 : 1000, fixture.directory).verify(fixture.input);
        assert.equal(result.status, 'FAILED');
        assert.deepEqual(result.checks, { modelList: 'FAILED', generation: 'NOT_RUN' });
        assert.match(result.reasonCode, /^MODEL_LIST_/);
        if (mode === 'timeout') assert.equal(result.reasonCode, 'MODEL_LIST_TIMEOUT');
        assert.deepEqual(requests, ['/v1/models']);
        assert.deepEqual(await readdir(fixture.directory), []);
      } finally { await fixture.close(); }
    });
  }
});
