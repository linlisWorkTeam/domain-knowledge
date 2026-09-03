import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { ProviderInvocationRecord, ProviderSettingsRecord } from '../../src/application/ports/index.ts';
import { PiCodingAgentProvider } from '../../src/infrastructure/agents/pi-agent/index.ts';

test('Pi adapter executes through the official coding-agent SDK and reports token usage', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pi-agent-'));
  let authorization = '';
  let receivedPath = '';
  let receivedBody = '';
  const upstream = createServer(async (request, response) => {
    authorization = request.headers.authorization ?? '';
    receivedPath = request.url ?? '';
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    receivedBody = Buffer.concat(chunks).toString('utf8');
    response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' });
    const common = { id: 'chatcmpl-test', object: 'chat.completion.chunk', created: 1, model: 'test-model' };
    response.write(`data: ${JSON.stringify({
      ...common,
      choices: [{ index: 0, delta: { role: 'assistant', content: '{"answer":"ok"}' }, finish_reason: null }],
    })}\n\n`);
    response.write(`data: ${JSON.stringify({
      ...common,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 },
    })}\n\n`);
    response.end('data: [DONE]\n\n');
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  assert.ok(address && typeof address === 'object');
  const settings: ProviderSettingsRecord = {
    provider: 'pi-agent', apiUrl: `http://provider.invalid:${address.port}/v1`, apiKey: 'test-key',
    model: 'test-model', enabled: true, revision: 2, verificationStatus: 'VERIFIED',
    verificationReasonCode: 'READY', lastVerifiedAt: '2026-09-04T00:00:00.000Z',
    verifiedFingerprint: 'test-only', updatedAt: '2026-09-04T00:00:00.000Z',
  };
  const invocations: ProviderInvocationRecord[] = [];
  const provider = new PiCodingAgentProvider({
    settings,
    agentDir: join(directory, 'agent'),
    endpointPolicy: {
      validate: async (raw) => ({ url: new URL(raw.endsWith('/') ? raw : `${raw}/`), addresses: ['127.0.0.1'] }),
    },
    onInvocation: (record) => { invocations.push(record); },
  });
  try {
    const result = await provider.run({
      role: 'doc-gen',
      prompt: 'Return the requested object.',
      outputSchema: {
        type: 'object', additionalProperties: false, required: ['answer'],
        properties: { answer: { type: 'string' } },
      },
      idempotencyKey: 'pi-test-1',
      metadata: { runId: 'run-pi-test' },
      workspaceRoot: directory,
    });
    assert.deepEqual(result, { answer: 'ok' });
    assert.equal(receivedPath, '/v1/chat/completions');
    assert.equal(authorization, 'Bearer test-key');
    assert.match(receivedBody, /Return the requested object/);
    assert.equal(invocations.length, 1);
    assert.deepEqual({
      runId: invocations[0]?.runId,
      provider: invocations[0]?.provider,
      model: invocations[0]?.model,
      status: invocations[0]?.status,
      inputTokens: invocations[0]?.inputTokens,
      outputTokens: invocations[0]?.outputTokens,
      fixture: invocations[0]?.fixture,
    }, {
      runId: 'run-pi-test', provider: 'pi-agent', model: 'test-model', status: 'SUCCEEDED',
      inputTokens: 12, outputTokens: 5, fixture: false,
    });
  } finally {
    upstream.close();
    await once(upstream, 'close');
    rmSync(directory, { recursive: true, force: true });
  }
});

test('Pi adapter does not follow Provider redirects after endpoint approval', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pi-agent-redirect-'));
  let requests = 0;
  const upstream = createServer((_request, response) => {
    requests += 1;
    response.writeHead(302, { location: '/private-target' });
    response.end();
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  assert.ok(address && typeof address === 'object');
  const apiUrl = `http://provider.invalid:${address.port}/v1`;
  const failed: ProviderInvocationRecord[] = [];
  const provider = new PiCodingAgentProvider({
    settings: {
      provider: 'pi-agent', apiUrl, apiKey: 'test-key', model: 'test-model', enabled: true,
      revision: 2, verificationStatus: 'VERIFIED', verificationReasonCode: 'READY',
      lastVerifiedAt: '2026-09-04T00:00:00.000Z', verifiedFingerprint: 'test-only',
      updatedAt: '2026-09-04T00:00:00.000Z',
    },
    agentDir: join(directory, 'agent'),
    endpointPolicy: {
      validate: async () => ({ url: new URL(`${apiUrl}/`), addresses: ['127.0.0.1'] }),
    },
    onInvocation: (record) => { failed.push(record); },
  });
  try {
    await assert.rejects(provider.run({
      role: 'review', prompt: 'Return JSON.',
      outputSchema: { type: 'object', additionalProperties: true },
      idempotencyKey: 'redirect-test', metadata: { runId: 'run-redirect' }, workspaceRoot: directory,
    }), /PI_AGENT_PROVIDER_FAILED/);
    assert.equal(requests, 1, 'the redirect target must not be requested');
    assert.equal(failed[0]?.status, 'FAILED');
  } finally {
    upstream.close();
    await once(upstream, 'close');
    rmSync(directory, { recursive: true, force: true });
  }
});

test('Pi adapter retries schema-invalid output with a fresh session and audits every attempt', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pi-agent-schema-retry-'));
  const bodies: string[] = [];
  const upstream = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    bodies.push(Buffer.concat(chunks).toString('utf8'));
    const content = bodies.length === 1 ? '{"wrong":true}' : '{"answer":"recovered"}';
    response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' });
    const common = { id: `chatcmpl-${bodies.length}`, object: 'chat.completion.chunk', created: 1, model: 'test-model' };
    response.write(`data: ${JSON.stringify({
      ...common,
      choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }],
    })}\n\n`);
    response.write(`data: ${JSON.stringify({
      ...common,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
    })}\n\n`);
    response.end('data: [DONE]\n\n');
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  assert.ok(address && typeof address === 'object');
  const apiUrl = `http://provider.invalid:${address.port}/v1`;
  const invocations: ProviderInvocationRecord[] = [];
  const provider = new PiCodingAgentProvider({
    settings: {
      provider: 'pi-agent', apiUrl, apiKey: 'test-key', model: 'test-model', enabled: true,
      revision: 2, verificationStatus: 'VERIFIED', verificationReasonCode: 'READY',
      lastVerifiedAt: '2026-09-04T00:00:00.000Z', verifiedFingerprint: 'test-only',
      updatedAt: '2026-09-04T00:00:00.000Z',
    },
    agentDir: join(directory, 'agent'),
    endpointPolicy: {
      validate: async () => ({ url: new URL(`${apiUrl}/`), addresses: ['127.0.0.1'] }),
    },
    onInvocation: (record) => { invocations.push(record); },
  });
  const request = {
    role: 'doc-gen', prompt: 'Return the same governed business result.',
    outputSchema: {
      type: 'object', additionalProperties: false, required: ['answer'],
      properties: { answer: { type: 'string' } },
    },
    idempotencyKey: 'same-business-request', metadata: { runId: 'run-schema-retry' },
    workspaceRoot: directory,
  };
  try {
    assert.deepEqual(await provider.run(request), { answer: 'recovered' });
    assert.equal(bodies.length, 2);
    const messages = bodies.map((value) => (JSON.parse(value) as { messages: unknown }).messages);
    assert.deepEqual(messages[1], messages[0], 'a retry uses the same request in a new conversation');
    assert.deepEqual(invocations.map((record) => ({
      status: record.status, errorCode: record.errorCode, retryCount: record.retryCount,
    })), [
      { status: 'FAILED', errorCode: 'AGENT_OUTPUT_INVALID', retryCount: 0 },
      { status: 'SUCCEEDED', errorCode: null, retryCount: 1 },
    ]);
    assert.doesNotMatch(JSON.stringify(invocations), /test-key|Return the same governed business result/);
  } finally {
    upstream.close();
    await once(upstream, 'close');
    rmSync(directory, { recursive: true, force: true });
  }
});

test('Pi adapter fails after the configured schema-attempt budget is exhausted', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pi-agent-schema-exhausted-'));
  let requests = 0;
  const upstream = createServer((_request, response) => {
    requests += 1;
    response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' });
    const common = { id: `chatcmpl-${requests}`, object: 'chat.completion.chunk', created: 1, model: 'test-model' };
    const content = requests === 1 ? '' : requests === 2 ? 'not-json' : '{"wrong":true}';
    response.write(`data: ${JSON.stringify({
      ...common,
      choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }],
    })}\n\n`);
    response.write(`data: ${JSON.stringify({
      ...common, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    })}\n\n`);
    response.end('data: [DONE]\n\n');
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  assert.ok(address && typeof address === 'object');
  const apiUrl = `http://provider.invalid:${address.port}/v1`;
  const invocations: ProviderInvocationRecord[] = [];
  const provider = new PiCodingAgentProvider({
    settings: {
      provider: 'pi-agent', apiUrl, apiKey: 'test-key', model: 'test-model', enabled: true,
      revision: 2, verificationStatus: 'VERIFIED', verificationReasonCode: 'READY',
      lastVerifiedAt: '2026-09-04T00:00:00.000Z', verifiedFingerprint: 'test-only',
      updatedAt: '2026-09-04T00:00:00.000Z',
    },
    maxSchemaAttempts: 3,
    agentDir: join(directory, 'agent'),
    endpointPolicy: {
      validate: async () => ({ url: new URL(`${apiUrl}/`), addresses: ['127.0.0.1'] }),
    },
    onInvocation: (record) => { invocations.push(record); },
  });
  try {
    await assert.rejects(provider.run({
      role: 'review', prompt: 'Return valid JSON.',
      outputSchema: {
        type: 'object', additionalProperties: false, required: ['answer'],
        properties: { answer: { type: 'string' } },
      },
      idempotencyKey: 'exhausted-business-request', metadata: { runId: 'run-exhausted' },
      workspaceRoot: directory,
    }), /AGENT_OUTPUT_INVALID/);
    assert.equal(requests, 3);
    assert.deepEqual(invocations.map((record) => [record.status, record.errorCode, record.retryCount]), [
      ['FAILED', 'AGENT_OUTPUT_INVALID', 0],
      ['FAILED', 'AGENT_OUTPUT_INVALID', 1],
      ['FAILED', 'AGENT_OUTPUT_INVALID', 1],
    ]);
  } finally {
    upstream.close();
    await once(upstream, 'close');
    rmSync(directory, { recursive: true, force: true });
  }
});
