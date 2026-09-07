import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { ProviderSettingsRecord } from '../../src/application/ports/index.ts';
import {
  EncryptedFileProviderSettingsStore, isPublicAddress, PublicHttpsEndpointPolicy,
} from '../../src/infrastructure/security/provider-settings.ts';

const RECORD: ProviderSettingsRecord = {
  provider: 'deepseek-harness',
  apiUrl: 'https://api.example.test/v1/',
  apiKey: 'sk-super-secret-value',
  model: 'example-model',
  enabled: false,
  revision: 1,
  verificationStatus: 'UNVERIFIED',
  verificationReasonCode: 'VERIFICATION_REQUIRED',
  lastVerifiedAt: null,
  verifiedFingerprint: null,
  updatedAt: '2026-09-04T00:00:00.000Z',
};

test('Provider settings are encrypted at rest and held in owner-only files', () => {
  const directory = mkdtempSync(join(tmpdir(), 'provider-secret-'));
  const settingsPath = join(directory, 'settings.enc');
  const keyPath = join(directory, 'settings.key');
  try {
    const store = new EncryptedFileProviderSettingsStore(settingsPath, keyPath);
    store.save(RECORD);
    assert.deepEqual(store.load(), RECORD);
    assert.doesNotMatch(readFileSync(settingsPath, 'utf8'), /sk-super-secret-value|api\.example\.test/);
    if (process.platform !== 'win32') {
      assert.equal(statSync(settingsPath).mode & 0o777, 0o600);
      assert.equal(statSync(keyPath).mode & 0o777, 0o600);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('Provider URL policy rejects credentials, local destinations, and mixed DNS answers', async () => {
  const privatePolicy = new PublicHttpsEndpointPolicy(async () => ['127.0.0.1']);
  const mixedPolicy = new PublicHttpsEndpointPolicy(async () => ['1.1.1.1', '10.0.0.1']);
  const publicPolicy = new PublicHttpsEndpointPolicy(async () => ['1.1.1.1', '2606:4700:4700::1111']);

  await assert.rejects(privatePolicy.validate('http://provider.example/v1'), /must use HTTPS/);
  await assert.rejects(privatePolicy.validate('https://user:pass@provider.example/v1'), /credentials/);
  await assert.rejects(privatePolicy.validate('https://provider.example/v1?target=internal'), /query/);
  await assert.rejects(privatePolicy.validate('https://localhost/v1'), /local and metadata/);
  await assert.rejects(privatePolicy.validate('https://[::1]/v1'), /restricted address/);
  await assert.rejects(privatePolicy.validate('https://provider.example/v1'), /restricted address/);
  await assert.rejects(mixedPolicy.validate('https://provider.example/v1'), /restricted address/);

  const endpoint = await publicPolicy.validate('https://provider.example/v1');
  assert.equal(endpoint.url.toString(), 'https://provider.example/v1/');
  assert.deepEqual(endpoint.addresses, ['1.1.1.1', '2606:4700:4700::1111']);
  assert.equal(isPublicAddress('127.0.0.1'), false);
  assert.equal(isPublicAddress('169.254.169.254'), false);
  assert.equal(isPublicAddress('1.1.1.1'), true);
  assert.equal(isPublicAddress('::1'), false);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
});

test('Provider probe connects only to its approved address with Node family autoselection enabled', async () => {
  const { createServer, getDefaultAutoSelectFamily, setDefaultAutoSelectFamily } = await import('node:net');
  const { OpenAiCompatibleProviderProbe } = await import('../../src/infrastructure/security/provider-settings.ts');
  let connected = false;
  const server = createServer((socket) => { connected = true; socket.destroy(); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const previous = getDefaultAutoSelectFamily();
  setDefaultAutoSelectFamily(true);
  try {
    const port = (server.address() as { port: number }).port;
    const result = await new OpenAiCompatibleProviderProbe(1000).verify({
      endpoint: { url: new URL(`https://does-not-resolve.invalid:${port}/`), addresses: ['127.0.0.1'] },
      apiKey: null, model: 'controlled',
    });
    assert.equal(connected, true, 'pinned lookup must reach the approved address before TLS starts');
    assert.equal(result.status, 'FAILED', 'a closed TCP socket is not a verified HTTPS provider');
  } finally {
    setDefaultAutoSelectFamily(previous);
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
