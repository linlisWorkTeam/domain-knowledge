/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证DshConfigured提供方的行为、约束及失败场景。
 */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { ProviderInvocationRecord, ProviderSettingsRecord } from '../../src/application/ports/ApplicationPorts.ts';
import { ConfiguredDshProvider } from '../../src/infrastructure/agentAdapters/deepSeekHarness/ConfiguredProvider.ts';

test('DSH adapter executes through the official native DSH SDK and reports token usage', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pi-agent-'));
  let authorization = '';
  let receivedPath = '';
  let receivedBody = '';
  const sessionHeaders: string[] = [];
  const auditedSessions: string[] = [];
  writeFileSync(join(directory, 'source.txt'), 'AUTHORIZED_MATERIAL');
  const upstream = createServer(async (request, response) => {
    assert.equal(request.headers['user-agent'], 'domain-knowledge/0.2.0');
    sessionHeaders.push(String(request.headers['x-opencode-session'] ?? ''));
    authorization = request.headers.authorization ?? '';
    receivedPath = request.url ?? '';
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    receivedBody = Buffer.concat(chunks).toString('utf8');
    response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' });
    const common = { id: 'chatcmpl-test', object: 'chat.completion.chunk', created: 1, model: 'test-model' };
    if (sessionHeaders.length === 1) {
      response.end(`data: ${JSON.stringify({ ...common, choices: [{ index: 0, delta: { tool_calls: [{ index: 0,
        id: 'read-source', type: 'function', function: { name: 'read_material', arguments: '{"path":"source.txt"}' },
      }] }, finish_reason: null }] })}\n\n`
        + `data: ${JSON.stringify({ ...common, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] })}\n\n`
        + 'data: [DONE]\n\n');
      return;
    }
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
    provider: 'deepseek-harness', apiUrl: `http://provider.invalid:${address.port}/v1`, apiKey: 'test-key',
    model: 'test-model', enabled: true, revision: 2, verificationStatus: 'VERIFIED',
    verificationReasonCode: 'READY', lastVerifiedAt: '2026-09-04T00:00:00.000Z',
    verifiedFingerprint: 'test-only', updatedAt: '2026-09-04T00:00:00.000Z',
  };
  const invocations: ProviderInvocationRecord[] = [];
  const provider = new ConfiguredDshProvider({
    settings,
    runtime: { processIsolation: 'none', allowedWorkspaceRoots: [directory] },
    dshHome: join(directory, 'agent'),
    endpointPolicy: {
      validate: async (raw) => ({ url: new URL(raw.endsWith('/') ? raw : `${raw}/`), addresses: ['127.0.0.1'] }),
    },
    onInvocation: (record) => { invocations.push(record); },
    onAudit: (record) => { auditedSessions.push(record.sessionId!); },
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
    assert.match(receivedBody, /AUTHORIZED_MATERIAL/);
    assert.equal(sessionHeaders.length, 2);
    assert.match(sessionHeaders[0]!, /^wp-[a-f0-9]{32}$/);
    assert.deepEqual(sessionHeaders, [auditedSessions[0], auditedSessions[0]], 'tool requests retain the native conversation ID');
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
      runId: 'run-pi-test', provider: 'deepseek-harness', model: 'test-model', status: 'SUCCEEDED',
      inputTokens: 12, outputTokens: 5, fixture: false,
    });
  } finally {
    upstream.close();
    await once(upstream, 'close');
    rmSync(directory, { recursive: true, force: true });
  }
});

test('DSH adapter does not follow Provider redirects after endpoint approval', async () => {
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
  const provider = new ConfiguredDshProvider({
    settings: {
      provider: 'deepseek-harness', apiUrl, apiKey: 'test-key', model: 'test-model', enabled: true,
      revision: 2, verificationStatus: 'VERIFIED', verificationReasonCode: 'READY',
      lastVerifiedAt: '2026-09-04T00:00:00.000Z', verifiedFingerprint: 'test-only',
      updatedAt: '2026-09-04T00:00:00.000Z',
    },
    runtime: { processIsolation: 'none', allowedWorkspaceRoots: [directory] },
    dshHome: join(directory, 'agent'),
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
    }), /PROVIDER_REDIRECT_DENIED/);
    assert.equal(requests, 1, 'the redirect target must not be requested');
    assert.equal(failed[0]?.status, 'FAILED');
  } finally {
    upstream.close();
    await once(upstream, 'close');
    rmSync(directory, { recursive: true, force: true });
  }
});

test('DSH adapter retries schema-invalid output with a fresh session and audits every attempt', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pi-agent-schema-retry-'));
  const bodies: string[] = [];
  const sessions: string[] = [];
  const auditedSessions: string[] = [];
  const upstream = createServer(async (request, response) => {
    sessions.push(String(request.headers['x-opencode-session'] ?? ''));
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
  const provider = new ConfiguredDshProvider({
    settings: {
      provider: 'deepseek-harness', apiUrl, apiKey: 'test-key', model: 'test-model', enabled: true,
      revision: 2, verificationStatus: 'VERIFIED', verificationReasonCode: 'READY',
      lastVerifiedAt: '2026-09-04T00:00:00.000Z', verifiedFingerprint: 'test-only',
      updatedAt: '2026-09-04T00:00:00.000Z',
    },
    runtime: { processIsolation: 'none', allowedWorkspaceRoots: [directory] },
    dshHome: join(directory, 'agent'),
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
  provider.options.onAudit = (record) => { auditedSessions.push(record.sessionId!); };
  try {
    assert.deepEqual(await provider.run(request), { answer: 'recovered' });
    assert.equal(bodies.length, 2);
    assert.deepEqual(sessions, auditedSessions);
    assert.notEqual(sessions[0], sessions[1], 'schema retry must route as a new native conversation');
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

test('DSH adapter fails after the configured schema-attempt budget is exhausted', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pi-agent-schema-exhausted-'));
  let requests = 0;
  const upstream = createServer((_request, response) => {
    requests += 1;
    response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' });
    const common = { id: `chatcmpl-${requests}`, object: 'chat.completion.chunk', created: 1, model: 'test-model' };
    const content = requests === 1 ? 'not-json' : requests === 2 ? 'not-json' : '{"wrong":true}';
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
  const provider = new ConfiguredDshProvider({
    settings: {
      provider: 'deepseek-harness', apiUrl, apiKey: 'test-key', model: 'test-model', enabled: true,
      revision: 2, verificationStatus: 'VERIFIED', verificationReasonCode: 'READY',
      lastVerifiedAt: '2026-09-04T00:00:00.000Z', verifiedFingerprint: 'test-only',
      updatedAt: '2026-09-04T00:00:00.000Z',
    },
    maxSchemaAttempts: 3,
    runtime: { processIsolation: 'none', allowedWorkspaceRoots: [directory] },
    dshHome: join(directory, 'agent'),
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
      ['FAILED', 'DSH_AGENT_OUTPUT_NOT_JSON', 0],
      ['FAILED', 'DSH_AGENT_OUTPUT_NOT_JSON', 1],
      ['FAILED', 'AGENT_OUTPUT_INVALID', 1],
    ]);
  } finally {
    upstream.close();
    await once(upstream, 'close');
    rmSync(directory, { recursive: true, force: true });
  }
});
