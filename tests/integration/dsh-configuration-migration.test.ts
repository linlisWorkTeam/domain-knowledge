import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createComposition } from '../../src/interfaces/runner/composition.ts';
import { createEvent } from '../../src/domain/index.ts';
import { EncryptedFileProviderSettingsStore } from '../../src/infrastructure/security/provider-settings.ts';

const connection = {
  providerEndpointPolicy: { validate: async (raw: string) => ({ url: new URL(raw), addresses: ['1.1.1.1'] }) },
  providerProbe: { verify: async ({ model }: { model: string | null }) => ({ status: 'VERIFIED' as const, reasonCode: 'READY', model }) },
};

test('DSH is the default without CodeAgent installed and running configurations survive settings edits', async () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), 'dsh-frozen-config-'));
  const composition = createComposition({ runtimeDir, ...connection });
  try {
    assert.equal(composition.agentProviderMode, 'deepseek-harness');
    const app = composition.apps.providerOperations;
    await app.put({ provider: 'deepseek-harness', apiUrl: 'https://provider.example/v1', apiKey: 'old-secret', model: 'old-model', expectedRevision: 0 });
    await app.verify({ expectedRevision: 1 });
    const run = composition.service.createRun('old-task', 'local-v1');
    const oldSnapshot = await composition.runConfiguration.capture(run.runId);
    const oldPrompt = await composition.runConfiguration.resolvePrompt(run.runId, 'doc-gen');
    await app.put({ provider: 'deepseek-harness', apiUrl: 'https://other.example/v1', apiKey: 'new-secret', model: 'new-model', expectedRevision: 2 });
    await app.verify({ expectedRevision: 3 });
    const frozen = app.requireRuntimeConfiguration(oldSnapshot.provider);
    assert.equal(frozen.settings.apiKey, 'old-secret');
    assert.equal(frozen.settings.model, 'old-model');
    assert.equal(await composition.runConfiguration.resolvePrompt(run.runId, 'doc-gen'), oldPrompt);
    assert.deepEqual(composition.runConfiguration.get(run.runId), oldSnapshot);
    await assert.rejects(composition.runConfiguration.assertCompatible(run.runId), /provider configuration changed/);
    const next = composition.service.createRun('new-task', 'local-v1');
    assert.equal((await composition.runConfiguration.capture(next.runId)).provider.model, 'new-model');
  } finally { composition.close(); rmSync(runtimeDir, { recursive: true, force: true }); }
});

test('legacy Pi Run remains readable, cannot resume on DSH, and legacy secrets are not migrated', async () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), 'dsh-legacy-config-'));
  const composition = createComposition({ runtimeDir, ...connection });
  try {
    const template = composition.service.createRun('template', 'local-v1');
    const snapshot = await composition.runConfiguration.capture(template.runId);
    const legacy = composition.service.createRun('legacy-module', 'local-v1');
    const oldSnapshot = { ...snapshot, runId: legacy.runId, provider: { ...snapshot.provider, kind: 'pi-agent' } };
    composition.repository.saveRunConfiguration(oldSnapshot, createEvent(legacy.runId, 'RunConfigurationCaptured', {}, snapshot.capturedAt));
    const settingsPath = join(runtimeDir, 'secrets/provider-settings.enc');
    const legacyStore = new EncryptedFileProviderSettingsStore(settingsPath, join(runtimeDir, 'secrets/provider-settings.key'));
    legacyStore.save({ provider: 'pi-agent', apiUrl: 'https://legacy.example/v1', apiKey: 'legacy-secret', model: 'legacy-model', enabled: true,
      revision: 2, verificationStatus: 'VERIFIED', verificationReasonCode: 'READY', lastVerifiedAt: null, verifiedFingerprint: null, updatedAt: snapshot.capturedAt });
    const sealed = readFileSync(settingsPath);
    assert.equal(composition.apps.providerOperations.getSettings().verification.reasonCode, 'PROVIDER_MIGRATION_REQUIRED');
    assert.equal(composition.apps.providerOperations.getSettings().enabled, false);
    assert.throws(() => composition.apps.providerOperations.runConfigurationProvider(snapshot.provider), /PROVIDER_MIGRATION_REQUIRED/);
    await assert.rejects(composition.apps.orchestrator.resume(legacy.runId), /RUN_CONFIGURATION_INCOMPATIBLE/);
    await composition.apps.providerOperations.put({ provider: 'deepseek-harness', apiUrl: 'https://provider.example/v1', model: 'dsh-model', expectedRevision: 2 });
    assert.equal(composition.apps.providerOperations.getSettings().apiKeyConfigured, false);
    assert.deepEqual(readFileSync(settingsPath), sealed);
    assert.equal(legacyStore.load()?.apiKey, 'legacy-secret');
    assert.deepEqual(composition.runConfiguration.get(legacy.runId), oldSnapshot);
    await assert.rejects(composition.apps.orchestrator.resume(legacy.runId), /RUN_CONFIGURATION_INCOMPATIBLE/);
  } finally { composition.close(); rmSync(runtimeDir, { recursive: true, force: true }); }
});
