/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证额度与限流区分，以及跨实例/重启停止。
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { providerErrorCode, ProviderQuotaStop } from './ProviderQuota.ts';
test('provider quota uses only bounded machine classifications, not rate limit or free text', () => {
  assert.equal(providerErrorCode(429, '{"error":{"code":"insufficient_quota"}}'), 'PROVIDER_QUOTA_EXHAUSTED');
  assert.equal(providerErrorCode(402, ''), 'PROVIDER_PAYMENT_REQUIRED');
  assert.equal(providerErrorCode(429, '{"error":{"message":"quota exhausted SECRET"}}'), 'PROVIDER_RATE_LIMITED');
  assert.equal(providerErrorCode(429, 'invalid JSON'), 'PROVIDER_RATE_LIMITED');
});
test('quota stop survives a new instance, model change and a new process; rate limit does not latch', () => {
  const root = mkdtempSync(join(tmpdir(), 'quota-stop-'));
  const credential = { apiUrl: 'https://example.invalid/v1', apiKey: 'controlled', model: 'test' };
  try {
    const stop = new ProviderQuotaStop(root, credential);
    stop.record('PROVIDER_RATE_LIMITED'); stop.assertAvailable();
    stop.record('PROVIDER_QUOTA_EXHAUSTED');
    assert.throws(() => new ProviderQuotaStop(root, { ...credential, model: 'other' }).assertAvailable(), /PROVIDER_QUOTA_EXHAUSTED/);
    const code = `import { ProviderQuotaStop } from ${JSON.stringify(new URL('./ProviderQuota.ts', import.meta.url).href)}; new ProviderQuotaStop(${JSON.stringify(root)},${JSON.stringify(credential)}).assertAvailable();`;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
    assert.equal(child.status, 1); assert.match(child.stderr, /PROVIDER_QUOTA_EXHAUSTED/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
