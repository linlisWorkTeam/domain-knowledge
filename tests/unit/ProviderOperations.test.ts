/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证提供方Operations的行为、约束及失败场景。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { ProviderOperationsApp } from '../../src/application/apps/ProviderOperationsApp.ts';
import type { ProviderSettingsRecord, ProviderSettingsStore } from '../../src/application/ports/ApplicationPorts.ts';

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
      verify: async ({ model }) => ({ status: 'VERIFIED', reasonCode: 'GENERATION_READY', checks: { modelList: 'PASSED', generation: 'PASSED' }, model: model ?? 'model-a' }),
    },
  });
}

test('verified Provider settings expire closed and stop becoming the default for new Runs', async () => {
  const store = new Store();
  let now = '2026-09-04T00:00:00.000Z';
  const app = createApp(store, () => now);
  await app.put({
    provider: 'deepseek-harness', apiUrl: 'https://provider.example/v1', apiKey: 'secret',
    model: 'model-a', expectedRevision: 0,
  });
  await app.verify({ expectedRevision: 1 });
  assert.equal(app.getStatus({ provider: 'fixture', model: 'fixture-v1' }).availability, 'AVAILABLE');
  assert.equal(app.runConfigurationProvider({
    kind: 'fixture', model: 'fixture-v1', parametersSha256: 'a'.repeat(64),
  }).kind, 'deepseek-harness');

  now = '2026-09-05T00:00:00.001Z';
  const expired = app.getStatus({ provider: 'fixture', model: 'fixture-v1' });
  assert.equal(expired.availability, 'DEGRADED');
  assert.equal(expired.authentication, 'UNVERIFIED');
  assert.equal(expired.reasonCode, 'VERIFICATION_EXPIRED');
  assert.equal(expired.enabled, false);
  assert.throws(() => app.runConfigurationProvider({
    kind: 'fixture', model: 'fixture-v1', parametersSha256: 'a'.repeat(64),
  }), /DSH_CONFIGURATION_UNAVAILABLE/);
});

test('Provider revision checks are serialized across concurrent verification requests', async () => {
  const store = new Store();
  const app = createApp(store, () => '2026-09-04T00:00:00.000Z');
  await app.put({
    provider: 'deepseek-harness', apiUrl: 'https://provider.example/v1', apiKey: 'secret',
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

test('old models-only verification remains readable but cannot silently enable or trigger generation', async () => {
  const store = new Store();
  const app = createApp(store, () => '2026-09-04T00:00:00.000Z');
  await app.put({ provider: 'deepseek-harness', apiUrl: 'https://provider.example/v1',
    apiKey: 'secret', model: 'model-a', expectedRevision: 0 });
  await app.verify({ expectedRevision: 1 });
  store.value!.verificationReasonCode = 'READY';
  delete store.value!.verificationChecks;
  let probes = 0;
  const reader = new ProviderOperationsApp({ store, endpointPolicy: app.endpointPolicy,
    executionParameters: app.executionParameters, clock: app.clock,
    probe: { verify: async () => { probes += 1; throw new Error('unexpected generation'); } } });
  assert.equal(reader.getSettings().verification.status, 'UNVERIFIED');
  assert.equal(reader.getSettings().verification.reasonCode, 'GENERATION_VERIFICATION_REQUIRED');
  assert.equal(reader.getSettings().enabled, false);
  assert.equal(reader.getStatus({ provider: 'fixture', model: 'fixture-v1' }).enabled, false);
  assert.throws(() => reader.runConfigurationProvider({ kind: 'fixture', model: 'fixture-v1', parametersSha256: 'a'.repeat(64) }), /DSH_CONFIGURATION_UNAVAILABLE/);
  assert.equal(probes, 0);
  assert.equal(store.value!.verificationStatus, 'VERIFIED', 'reading legacy records does not mutate them');
});

test('models-only probe result cannot enable settings and an aborted request never probes', async () => {
  const store = new Store();
  const base = createApp(store, () => '2026-09-04T00:00:00.000Z');
  let probes = 0;
  const app = new ProviderOperationsApp({ store, endpointPolicy: base.endpointPolicy,
    executionParameters: base.executionParameters, clock: base.clock,
    probe: { verify: async ({ model }) => { probes += 1; return { status: 'VERIFIED', reasonCode: 'READY', model }; } } });
  await app.put({ provider: 'deepseek-harness', apiUrl: 'https://provider.example/v1',
    model: 'model-a', expectedRevision: 0 });
  assert.equal(probes, 0, 'save does not generate');
  const result = await app.verify({ expectedRevision: 1 });
  assert.equal(result.status, 'FAILED');
  assert.equal(result.enabled, false);
  assert.equal(result.reasonCode, 'GENERATION_VERIFICATION_REQUIRED');
  await assert.rejects(app.verify({ expectedRevision: 2 }, AbortSignal.abort(new Error('CLIENT_DISCONNECTED'))), /CLIENT_DISCONNECTED/);
  assert.equal(probes, 1);
});

test('cancelling a queued verification returns promptly while preserving later revision ordering', async () => {
  const store = new Store();
  const base = createApp(store, () => '2026-09-04T00:00:00.000Z');
  let release!: () => void;
  let probes = 0;
  const app = new ProviderOperationsApp({ store, endpointPolicy: base.endpointPolicy,
    executionParameters: base.executionParameters, clock: base.clock,
    probe: { verify: async ({ model }) => {
      probes += 1;
      await new Promise<void>((resolve) => { release = resolve; });
      return { status: 'VERIFIED', reasonCode: 'GENERATION_READY', model,
        checks: { modelList: 'PASSED', generation: 'PASSED' } };
    } } });
  await app.put({ provider: 'deepseek-harness', apiUrl: 'https://provider.example/v1',
    model: 'model-a', expectedRevision: 0 });
  const first = app.verify({ expectedRevision: 1 });
  await new Promise((resolve) => setImmediate(resolve));
  const abort = new AbortController();
  const cancelled = app.verify({ expectedRevision: 1 }, abort.signal);
  const rejected = assert.rejects(cancelled, /CLIENT_DISCONNECTED/);
  abort.abort(new Error('CLIENT_DISCONNECTED'));
  await rejected;
  const next = app.put({ provider: 'deepseek-harness', apiUrl: 'https://provider.example/v1',
    model: 'next-model', expectedRevision: 2 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(store.value!.revision, 1, 'cancelled queue entry must not release the still-active mutation');
  assert.equal(probes, 1);
  release();
  await first;
  await next;
  assert.equal(store.value!.revision, 3);
  assert.equal(store.value!.model, 'next-model');
});
