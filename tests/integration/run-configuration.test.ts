import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createEvent } from '../../src/domain/index.ts';
import { AGENT_IDS } from '../../src/application/ports/index.ts';
import { createComposition } from '../../src/interfaces/runner/composition.ts';

test('RunConfigurationSnapshot freezes all Agent prompts and safe runtime identity', async () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), 'wp-run-configuration-'));
  const composition = createComposition({ runtimeDir });
  try {
    composition.apps.orchestrator.updatePromptAddon('doc-gen', 'first frozen instruction');
    const run = composition.apps.flywheel.createRun('snapshot-module', 'local-v1');
    const snapshot = await composition.runConfiguration.capture(run.runId);
    composition.apps.orchestrator.updatePromptAddon('doc-gen', 'later instruction');

    assert.equal(snapshot.schemaVersion, '1.0');
    assert.deepEqual(snapshot.agents.map(({ agentId }) => agentId).sort(), [...AGENT_IDS].sort());
    assert.equal(snapshot.provider.kind, 'fixture');
    assert.equal(snapshot.provider.model, 'schema-validated-fixture-v1');
    assert.match(snapshot.provider.parametersSha256, /^[a-f0-9]{64}$/);
    assert.equal(snapshot.contracts.commandSchema, 'https://wpknowledge.local/schemas/agent-command/v1');
    assert.equal(snapshot.contracts.resultSchema, 'https://wpknowledge.local/schemas/agent-result/v1');

    const docGen = snapshot.agents.find(({ agentId }) => agentId === 'doc-gen');
    assert.equal(docGen?.promptRevision, 1);
    assert.match(docGen?.effectivePromptSha256 ?? '', /^[a-f0-9]{64}$/);
    const resolved = await composition.runConfiguration.resolvePrompt(run.runId, 'doc-gen');
    assert.match(resolved, /first frozen instruction/);
    assert.doesNotMatch(resolved, /later instruction/);

    assert.deepEqual(await composition.runConfiguration.capture(run.runId), snapshot);
    assert.deepEqual(composition.apps.orchestrator.getRunConfiguration(run.runId), snapshot);
    assert.deepEqual(composition.repository.listEvents(run.runId).map(({ eventType }) => eventType), [
      'RunCreated', 'RunConfigurationCaptured',
    ]);
    const serialized = JSON.stringify(snapshot);
    assert.doesNotMatch(serialized, /first frozen instruction|later instruction/);
  } finally {
    composition.close();
    rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test('RunConfigurationSnapshot is immutable after capture', async () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), 'wp-run-configuration-'));
  const composition = createComposition({ runtimeDir });
  try {
    const run = composition.apps.flywheel.createRun('immutable-snapshot', 'local-v1');
    const snapshot = await composition.runConfiguration.capture(run.runId);
    const changed = {
      ...snapshot,
      provider: { ...snapshot.provider, model: 'changed-after-start' },
    };
    assert.throws(() => composition.repository.saveRunConfiguration(
      changed,
      createEvent(run.runId, 'RunConfigurationCaptured', {}, snapshot.capturedAt),
    ), /run configuration is immutable/);
  } finally {
    composition.close();
    rmSync(runtimeDir, { recursive: true, force: true });
  }
});
