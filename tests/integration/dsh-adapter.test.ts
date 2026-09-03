import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  createDshToolDefinitions, KnowledgeApiClient,
} from '../../src/interfaces/dsh/index.ts';

test('DSH adapter uses versioned HTTP requests and fails closed for writes', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const readOnly = new KnowledgeApiClient({ baseUrl: 'http://127.0.0.1:4174/', fetchImpl: fakeFetch });
  await readOnly.get('/api/v1/system/status');
  await assert.rejects(readOnly.post('/api/v1/knowledge/v/feedback', {}), /WRITE_DISABLED/);
  const writable = new KnowledgeApiClient({ baseUrl: 'http://127.0.0.1:4174', writeToken: 'secret', fetchImpl: fakeFetch });
  await writable.post('/api/v1/knowledge/v/feedback', { action: 'hit' }, 'feedback-v-hit');
  assert.equal(calls[0].url, 'http://127.0.0.1:4174/api/v1/system/status');
  assert.equal((calls[1].init?.headers as Record<string, string>).authorization, 'Bearer secret');
  assert.equal((calls[1].init?.headers as Record<string, string>)['idempotency-key'], 'feedback-v-hit');
  assert.equal(createDshToolDefinitions(writable).some((tool) => tool.name === 'wp_knowledge_scan'), true);
});

test('DSH tools use only canonical Preview API paths', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const client = new KnowledgeApiClient({
    baseUrl: 'http://127.0.0.1:4174',
    writeToken: 'secret',
    fetchImpl: fakeFetch,
  });
  const tools = Object.fromEntries(createDshToolDefinitions(client).map((tool) => [tool.name, tool]));

  await tools.wp_knowledge_query.execute({ q: 'agent graph', limit: 5, status: 'VERIFIED' });
  await tools.wp_knowledge_status.execute({});
  await tools.wp_knowledge_scan.execute({});
  await tools.wp_knowledge_ingest_candidate.execute({
    moduleId: 'console', body: '# Console', provenance: [], idempotencyKey: 'candidate-console',
  });
  await tools.wp_knowledge_feedback.execute({
    versionId: 'version/with space', action: 'hit', idempotencyKey: 'feedback-version-hit',
  });

  assert.deepEqual(calls.map((call) => call.url), [
    'http://127.0.0.1:4174/api/v1/knowledge?q=agent%20graph&limit=5&status=VERIFIED',
    'http://127.0.0.1:4174/api/v1/system/status',
    'http://127.0.0.1:4174/api/v1/sources/scan',
    'http://127.0.0.1:4174/api/v1/knowledge/candidates',
    'http://127.0.0.1:4174/api/v1/knowledge/version%2Fwith%20space/feedback',
  ]);
  assert.equal(JSON.parse(String(calls[3].init?.body)).idempotencyKey, undefined);
  assert.equal(JSON.parse(String(calls[4].init?.body)).versionId, undefined);
  assert.equal((calls[3].init?.headers as Record<string, string>)['idempotency-key'], 'candidate-console');
  assert.equal((calls[4].init?.headers as Record<string, string>)['idempotency-key'], 'feedback-version-hit');
});

test('DSH adapter contains no shell or Python bridge', () => {
  const source = readFileSync('src/interfaces/dsh/index.ts', 'utf8').toLowerCase();
  assert.equal(source.includes('shell.run'), false);
  assert.equal(source.includes('python fw.py'), false);
  assert.equal(source.includes('child_process'), false);
});
