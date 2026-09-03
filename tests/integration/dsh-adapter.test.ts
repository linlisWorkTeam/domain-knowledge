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
  await readOnly.get('/api/v1/status');
  await assert.rejects(readOnly.post('/api/v1/feedback', {}), /WRITE_DISABLED/);
  const writable = new KnowledgeApiClient({ baseUrl: 'http://127.0.0.1:4174', writeToken: 'secret', fetchImpl: fakeFetch });
  await writable.post('/api/v1/feedback', { versionId: 'v', action: 'hit' });
  assert.equal(calls[0].url, 'http://127.0.0.1:4174/api/v1/status');
  assert.equal((calls[1].init?.headers as Record<string, string>).authorization, 'Bearer secret');
  assert.equal(createDshToolDefinitions(writable).some((tool) => tool.name === 'wp_knowledge_scan'), true);
});

test('DSH adapter contains no shell or Python bridge', () => {
  const source = readFileSync('src/interfaces/dsh/index.ts', 'utf8').toLowerCase();
  assert.equal(source.includes('shell.run'), false);
  assert.equal(source.includes('python fw.py'), false);
  assert.equal(source.includes('child_process'), false);
});
