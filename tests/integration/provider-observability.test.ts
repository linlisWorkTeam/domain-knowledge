import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type {
  ProviderEndpointPolicy, ProviderSettingsRecord, ProviderSettingsStore,
} from '../../src/application/ports/index.ts';
import { createKnowledgeServer } from '../../src/interfaces/runner/server.ts';

class MemoryProviderSettingsStore implements ProviderSettingsStore {
  value: ProviderSettingsRecord | null = null;

  load(): ProviderSettingsRecord | null {
    return this.value ? structuredClone(this.value) : null;
  }

  save(record: ProviderSettingsRecord): void {
    this.value = structuredClone(record);
  }
}

const endpointPolicy: ProviderEndpointPolicy = {
  validate: async (raw) => ({ url: new URL(raw.endsWith('/') ? raw : `${raw}/`), addresses: ['1.1.1.1'] }),
};

test('Provider HTTP contract redacts credentials, persists idempotency, and activates Pi for new Runs', async () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), 'provider-http-'));
  const store = new MemoryProviderSettingsStore();
  let policyCalls = 0;
  let verificationSucceeds = true;
  const instance = createKnowledgeServer({
    runtimeDir,
    writeToken: 'admin-token',
    providerSettingsStore: store,
    providerEndpointPolicy: {
      validate: async (raw) => {
        policyCalls += 1;
        return endpointPolicy.validate(raw);
      },
    },
    providerProbe: {
      verify: async ({ model }) => verificationSucceeds
        ? { status: 'VERIFIED', reasonCode: 'READY', model: model ?? 'discovered-model' }
        : { status: 'FAILED', reasonCode: 'PROVIDER_AUTH_INVALID', model },
    },
    clock: () => '2026-09-04T01:02:03.000Z',
  });
  instance.server.listen(0, '127.0.0.1');
  await once(instance.server, 'listening');
  const address = instance.server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  const auth = { 'content-type': 'application/json', authorization: 'Bearer admin-token' };
  const secret = 'sk-never-return-this';
  try {
    const initial = await (await fetch(`${base}/api/v1/provider-settings`)).json();
    assert.deepEqual(initial.verification, {
      status: 'NOT_CONFIGURED', reasonCode: 'NOT_CONFIGURED', checkedAt: null,
    });
    assert.equal(initial.revision, 0);

    const unauthorized = await fetch(`${base}/api/v1/provider-settings`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    assert.equal(unauthorized.status, 401);
    const missingKey = await fetch(`${base}/api/v1/provider-settings`, {
      method: 'PUT', headers: auth,
      body: JSON.stringify({ provider: 'pi-agent', apiUrl: 'https://provider.example/v1', expectedRevision: 0 }),
    });
    assert.equal(missingKey.status, 422);
    assert.equal((await missingKey.json()).error.code, 'IDEMPOTENCY_KEY_REQUIRED');

    const requestBody = {
      provider: 'pi-agent', apiUrl: 'https://provider.example/v1', apiKey: secret,
      model: 'model-a', expectedRevision: 0,
    };
    const saved = await fetch(`${base}/api/v1/provider-settings`, {
      method: 'PUT', headers: { ...auth, 'idempotency-key': 'save-1' }, body: JSON.stringify(requestBody),
    });
    assert.equal(saved.status, 200);
    const savedText = await saved.text();
    assert.doesNotMatch(savedText, new RegExp(secret));
    const savedPayload = JSON.parse(savedText);
    assert.equal(savedPayload.revision, 1);
    assert.equal(savedPayload.settings.apiUrlMasked, 'https://provider.example/…');
    assert.equal(savedPayload.settings.apiKeyConfigured, true);
    assert.equal(savedPayload.settings.enabled, false);

    const replay = await fetch(`${base}/api/v1/provider-settings`, {
      method: 'PUT', headers: { ...auth, 'idempotency-key': 'save-1' }, body: JSON.stringify(requestBody),
    });
    assert.equal(replay.status, 200);
    assert.deepEqual(await replay.json(), savedPayload);
    assert.equal(store.value?.revision, 1);
    const conflict = await fetch(`${base}/api/v1/provider-settings`, {
      method: 'PUT', headers: { ...auth, 'idempotency-key': 'save-1' },
      body: JSON.stringify({ ...requestBody, model: 'model-b' }),
    });
    assert.equal(conflict.status, 409);

    const verified = await fetch(`${base}/api/v1/provider-settings/verify`, {
      method: 'POST', headers: { ...auth, 'idempotency-key': 'verify-1' },
      body: JSON.stringify({ expectedRevision: 1 }),
    });
    assert.equal(verified.status, 200);
    const verifiedPayload = await verified.json();
    assert.equal(verifiedPayload.status, 'VERIFIED');
    assert.equal(verifiedPayload.enabled, true);
    assert.equal(verifiedPayload.revision, 2);
    assert.equal(policyCalls, 2, 'the address is re-resolved immediately before verification');

    const status = await (await fetch(`${base}/api/v1/agents/providers/status`)).json();
    assert.deepEqual({
      provider: status.provider,
      availability: status.availability,
      authentication: status.authentication,
      enabled: status.enabled,
      reasonCode: status.reasonCode,
    }, {
      provider: 'pi-agent', availability: 'AVAILABLE', authentication: 'AUTHENTICATED',
      enabled: true, reasonCode: 'READY',
    });
    const piCapabilities = await (await fetch(`${base}/api/v1/system/capabilities`)).json();
    assert.equal(piCapabilities.agentProvider, 'pi-agent');
    assert.equal(piCapabilities.agentPromptTransport, 'pi-agent-openai-compatible');

    const run = instance.composition.apps.flywheel.createRun('provider-contract', 'local-v1');
    const snapshot = await instance.composition.runConfiguration.capture(run.runId);
    assert.equal(snapshot.provider.kind, 'pi-agent');
    assert.equal(snapshot.provider.model, 'model-a');
    assert.doesNotMatch(JSON.stringify(snapshot), /sk-never-return-this|apiKey/i);
    assert.equal(instance.composition.repository.database.prepare(
      "SELECT COUNT(*) AS count FROM command_receipts WHERE fingerprint LIKE '%sk-never%'",
    ).get()?.count, 0);
    const audit = instance.composition.repository.listEvents('provider-settings:pi-agent');
    assert.deepEqual(audit.map((event) => event.eventType), [
      'ComponentStatusChanged', 'ComponentStatusChanged',
    ]);
    assert.deepEqual(audit.map((event) => event.payload.changeType), [
      'SETTINGS_CHANGED', 'VERIFICATION_COMPLETED',
    ]);
    assert.doesNotMatch(JSON.stringify(audit), /sk-never-return-this/);

    const emptyRuns = await (await fetch(`${base}/api/v1/metrics/runs?window=24h`)).json();
    assert.equal(emptyRuns.cohort.kind, 'REAL');
    assert.equal(emptyRuns.cohort.runCount, 1);
    assert.equal(emptyRuns.runDurationMs.sampleSize, 0);
    assert.equal(emptyRuns.runDurationMs.p50, null);
    assert.equal(emptyRuns.tokens.total, null);
    assert.equal(emptyRuns.estimatedCostUsd.total, null);
    const emptyGovernance = await (await fetch(`${base}/api/v1/metrics/governance?window=24h`)).json();
    assert.equal(emptyGovernance.firstRevisionPassRate.value, null);
    assert.equal(emptyGovernance.humanInterventionRate.value, 0);
    const invalidWindow = await fetch(`${base}/api/v1/metrics/runs?window=1h`);
    assert.equal(invalidWindow.status, 422);
    assert.equal((await invalidWindow.json()).error.code, 'METRICS_WINDOW_INVALID');

    verificationSucceeds = false;
    const resaved = await fetch(`${base}/api/v1/provider-settings`, {
      method: 'PUT', headers: { ...auth, 'idempotency-key': 'save-2' },
      body: JSON.stringify({
        provider: 'pi-agent', apiUrl: 'https://provider.example/v1', model: 'model-a', expectedRevision: 2,
      }),
    });
    assert.equal(resaved.status, 200);
    assert.equal((await resaved.json()).settings.enabled, false);
    const failed = await fetch(`${base}/api/v1/provider-settings/verify`, {
      method: 'POST', headers: { ...auth, 'idempotency-key': 'verify-2' },
      body: JSON.stringify({ expectedRevision: 3 }),
    });
    assert.equal(failed.status, 200);
    assert.deepEqual(
      (({ status, reasonCode, enabled }) => ({ status, reasonCode, enabled }))(await failed.json()),
      { status: 'FAILED', reasonCode: 'PROVIDER_AUTH_INVALID', enabled: false },
    );
    const failedSettings = await (await fetch(`${base}/api/v1/provider-settings`)).json();
    assert.equal(failedSettings.apiKeyConfigured, true, 'an omitted key preserves the encrypted credential');
    assert.equal(failedSettings.enabled, false);
    assert.equal(failedSettings.verification.status, 'FAILED');
    const fallbackCapabilities = await (await fetch(`${base}/api/v1/system/capabilities`)).json();
    assert.equal(fallbackCapabilities.agentProvider, 'fixture');
  } finally {
    instance.server.close();
    await once(instance.server, 'close');
    rmSync(runtimeDir, { recursive: true, force: true });
  }
});
