/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证本地发布 HTTP 认证、目录边界和脱敏幂等响应。
 */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createKnowledgeServer } from '../../src/interfaces/runner/Server.ts';
import { LocalMarkdownPublisher } from '../../src/infrastructure/publication/LocalMarkdownPublisher.ts';
import { PublicationOperations } from '../../src/application/services/PublicationOperations.ts';

test('product HTTP requires authentication for reads and mutations and persists redacted receipts', async () => {
  const root = mkdtempSync(join(tmpdir(), 'knowledge-publication-http-'));
  const instance = createKnowledgeServer({ runtimeDir: join(root, 'runtime'), writeToken: 'http-test-token' });
  const port = new LocalMarkdownPublisher({ runtimeDir: join(root, 'publication'), directoryRoots: [root] });
  let starts = 0;
  Object.assign(instance.composition.apps, {
    publicationOperations: new PublicationOperations(port),
    markdownLite: { async start(repositoryRoot: string) { starts += 1; return { runId: 'run-test', repositoryRoot }; } },
  });
  instance.server.listen(0, '127.0.0.1');
  await once(instance.server, 'listening');
  const address = instance.server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  const headers = { authorization: 'Bearer http-test-token', 'content-type': 'application/json' };
  try {
    for (const path of ['/api/v1/server-directories', '/api/v1/publications/settings', '/api/v1/publications']) {
      assert.equal((await fetch(base + path)).status, 401);
    }
    const directories = await fetch(base + '/api/v1/server-directories', { headers });
    assert.equal(directories.status, 200);
    assert.equal((await directories.json()).path, root);
    const outside = await fetch(base + '/api/v1/server-directories?path=%2F', { headers });
    assert.equal(outside.status, 422);
    const settings = { directory: join(root, 'knowledge'), git: { enabled: false, remote: 'https://example.test/knowledge.git', branch: 'main', token: 'private-git-token' } };
    const first = await fetch(base + '/api/v1/publications/settings', { method: 'PUT', headers: { ...headers, 'Idempotency-Key': 'settings-1' }, body: JSON.stringify(settings) });
    assert.equal(first.status, 200);
    const value = await first.json();
    assert.equal(value.git.tokenConfigured, true);
    assert.equal(JSON.stringify(value).includes('private-git-token'), false);
    const repeat = await fetch(base + '/api/v1/publications/settings', { method: 'PUT', headers: { ...headers, 'Idempotency-Key': 'settings-1' }, body: JSON.stringify(settings) });
    assert.deepEqual(await repeat.json(), value);
    const receipt = instance.composition.apps.flywheel.getCommandReceipt('product:/api/v1/publications/settings', 'settings-1');
    assert.equal(JSON.stringify(receipt).includes('private-git-token'), false);
    const start = { method: 'POST', headers: { ...headers, 'Idempotency-Key': 'start-1' }, body: JSON.stringify({ repositoryRoot: root }) };
    assert.equal((await fetch(base + '/api/v1/runs/markdown-lite', start)).status, 202);
    assert.equal((await fetch(base + '/api/v1/runs/markdown-lite', start)).status, 202);
    assert.equal(starts, 1);
    const disabled = await fetch(base + '/api/v1/publications/sync', { method: 'POST', headers: { ...headers, 'Idempotency-Key': 'sync-1' }, body: '{}' });
    assert.equal(disabled.status, 409);
    assert.equal((await disabled.json()).error.code, 'GIT_DISABLED');
  } finally {
    instance.server.closeAllConnections();
    await new Promise<void>((resolveClose) => instance.server.close(() => resolveClose()));
    port.close();
    rmSync(root, { recursive: true, force: true });
  }
});
