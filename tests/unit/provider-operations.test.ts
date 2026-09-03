import assert from 'node:assert/strict';
import test from 'node:test';
import { ProviderOperationsApp } from '../../src/application/apps/provider-operations-app.ts';
import type { ProviderSettingsRecord, ProviderSettingsStore } from '../../src/application/ports/index.ts';

class Store implements ProviderSettingsStore {
  value: ProviderSettingsRecord | null = null;
  load() { return this.value ? structuredClone(this.value) : null; }
  save(value: ProviderSettingsRecord) { this.value = structuredClone(value); }
}

function createApp(store: Store, clock: () => string) {
  return new ProviderOperationsApp({
    store,
    clock,
    endpointPolicy: {
      validate: async (raw) => ({ url: new URL(raw.endsWith('/') ? raw : `${raw}/`), addresses: ['1.1.1.1'] }),
    },
    executionParameters: {
      api: 'openai-completions', maxTokens: 32_768, maxSchemaAttempts: 2, contextWindow: 128_000,
    },
    probe: {
      verify: async ({ model }) => ({ status: 'VERIFIED', reasonCode: 'READY', model: model ?? 'model-a' }),
    },
  });
}

test('verified Provider settings expire closed and stop becoming the default for new Runs', async () => {
  const store = new Store();
  let now = '2026-09-04T00:00:00.000Z';
  const app = createApp(store, () => now);
  await app.put({
    provider: 'pi-agent', apiUrl: 'https://provider.example/v1', apiKey: 'secret',
    model: 'model-a', expectedRevision: 0,
  });
  await app.verify({ expectedRevision: 1 });
  assert.equal(app.getStatus({ provider: 'fixture', model: 'fixture-v1' }).availability, 'AVAILABLE');
  assert.equal(app.runConfigurationProvider({
    kind: 'fixture', model: 'fixture-v1', parametersSha256: 'a'.repeat(64),
  }).kind, 'pi-agent');

  now = '2026-09-05T00:00:00.001Z';
  const expired = app.getStatus({ provider: 'fixture', model: 'fixture-v1' });
  assert.equal(expired.availability, 'DEGRADED');
  assert.equal(expired.authentication, 'UNVERIFIED');
  assert.equal(expired.reasonCode, 'VERIFICATION_EXPIRED');
  assert.equal(expired.enabled, false);
  assert.equal(app.runConfigurationProvider({
    kind: 'fixture', model: 'fixture-v1', parametersSha256: 'a'.repeat(64),
  }).kind, 'fixture');
});

test('Provider revision checks are serialized across concurrent verification requests', async () => {
  const store = new Store();
  const app = createApp(store, () => '2026-09-04T00:00:00.000Z');
  await app.put({
    provider: 'pi-agent', apiUrl: 'https://provider.example/v1', apiKey: 'secret',
    model: 'model-a', expectedRevision: 0,
  });
  const results = await Promise.allSettled([
    app.verify({ expectedRevision: 1 }),
    app.verify({ expectedRevision: 1 }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
  assert.match(String(rejected.reason), /REVISION_CONFLICT/);
  assert.equal(store.value?.revision, 2);
});
