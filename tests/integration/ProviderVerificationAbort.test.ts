/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证主动连接检查的 HTTP 断开传递取消，不发模型请求。
 */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createKnowledgeServer } from '../../src/interfaces/runner/Server.ts';

test('disconnecting provider verification aborts its application signal', { timeout: 10_000 }, async () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), 'provider-disconnect-'));
  const instance = createKnowledgeServer({ runtimeDir, writeToken: 'controlled-token' });
  const started = Promise.withResolvers<void>();
  const cancelled = Promise.withResolvers<void>();
  instance.composition.apps.providerOperations.verify = async (_input, signal) => {
    assert.ok(signal, 'the request must pass an application cancellation signal');
    started.resolve();
    await new Promise<void>((resolve) => {
      if (signal.aborted) resolve();
      else signal.addEventListener('abort', () => resolve(), { once: true });
    });
    cancelled.resolve();
    throw new Error('PROVIDER_PROBE_CANCELLED: controlled cancellation');
  };
  instance.server.listen(0, '127.0.0.1'); await once(instance.server, 'listening');
  const address = instance.server.address(); assert.ok(address && typeof address === 'object');
  const client = request(`http://127.0.0.1:${address.port}/api/v1/provider-settings/verify`, {
    method: 'POST', headers: { authorization: 'Bearer controlled-token', 'content-type': 'application/json', 'idempotency-key': 'disconnect-probe' },
  });
  client.on('error', () => { /* 主动关闭产生的客户端异常不进入公开日志。 */ });
  try {
    client.end(JSON.stringify({ expectedRevision: 0 }));
    await started.promise;
    client.destroy();
    await cancelled.promise;
    assert.equal(instance.composition.apps.flywheel.getCommandReceipt('provider-settings.verify', 'disconnect-probe'), null);
  } finally {
    client.destroy(); instance.server.closeAllConnections();
    await new Promise<void>((resolve) => instance.server.close(() => resolve()));
    rmSync(runtimeDir, { recursive: true, force: true });
  }
});
