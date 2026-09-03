import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createEvent, sha256 } from '../../src/domain/index.ts';
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
    assert.match(snapshot.contracts.commandSchemaSha256, /^[a-f0-9]{64}$/);
    assert.match(snapshot.contracts.resultSchemaSha256, /^[a-f0-9]{64}$/);
    const schemaRoot = join(process.cwd(), 'specs', 'schemas');
    const artifactRef = sha256(readFileSync(join(schemaRoot, 'artifact-ref.schema.json')));
    assert.equal(snapshot.contracts.commandSchemaSha256, sha256(JSON.stringify({
      command: sha256(readFileSync(join(schemaRoot, 'agent-command.schema.json'))), artifactRef,
    })));
    assert.equal(snapshot.contracts.resultSchemaSha256, sha256(JSON.stringify({
      result: sha256(readFileSync(join(schemaRoot, 'agent-result.schema.json'))),
      artifactRef,
      correction: sha256(readFileSync(join(schemaRoot, 'correction.schema.json'))),
    })));

    const docGen = snapshot.agents.find(({ agentId }) => agentId === 'doc-gen');
    assert.equal(docGen?.promptRevision, 1);
    assert.match(docGen?.effectivePromptSha256 ?? '', /^[a-f0-9]{64}$/);
    const resolved = await composition.runConfiguration.resolvePrompt(run.runId, 'doc-gen');
    assert.match(resolved, /first frozen instruction/);
    assert.doesNotMatch(resolved, /later instruction/);

    assert.deepEqual(await composition.runConfiguration.capture(run.runId), snapshot);
    assert.deepEqual(composition.runConfiguration.get(run.runId), snapshot);
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

test('resume compatibility fails closed when frozen runtime inputs change', async () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), 'wp-run-configuration-'));
  const composition = createComposition({ runtimeDir });
  try {
    const run = composition.apps.flywheel.createRun('resume-compatibility', 'local-v1');
    const snapshot = await composition.runConfiguration.capture(run.runId);
    composition.apps.orchestrator.updatePromptAddon('doc-gen', 'allowed for a future Run only');
    await composition.runConfiguration.assertCompatible(run.runId);

    composition.runConfiguration.provider.model = 'changed-model';
    await assert.rejects(composition.runConfiguration.assertCompatible(run.runId), /provider configuration changed/);
    composition.runConfiguration.provider.model = snapshot.provider.model;

    composition.runConfiguration.contracts.commandSchemaSha256 = 'b'.repeat(64);
    await assert.rejects(composition.runConfiguration.assertCompatible(run.runId), /schema configuration changed/);
    composition.runConfiguration.contracts.commandSchemaSha256 = snapshot.contracts.commandSchemaSha256;

    const orchestrator = composition.runConfiguration.definitions.find(({ agentId }) => agentId === 'orchestrator');
    assert.ok(orchestrator);
    orchestrator.tools.push('unexpected-tool');
    await assert.rejects(composition.runConfiguration.assertCompatible(run.runId), /Agent tools changed/);
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

test('provider parameter digest covers headless arguments and SDK patch content', () => {
  const root = mkdtempSync(join(tmpdir(), 'wp-provider-digest-'));
  const trackedKeys = [
    'WP_FLYWHEEL_AGENT_PROVIDER', 'WP_DSH_ARGS_JSON', 'WP_DSH_ALLOWED_ROOTS', 'WP_DSH_PATCHES_JSON',
  ] as const;
  const previous = new Map(trackedKeys.map((key) => [key, process.env[key]]));
  const digests: string[] = [];
  try {
    process.env.WP_FLYWHEEL_AGENT_PROVIDER = 'deepseek-harness-headless';
    process.env.WP_DSH_ARGS_JSON = '["--profile","first"]';
    process.env.WP_DSH_ALLOWED_ROOTS = join(root, 'allowed-a');
    const headlessA = createComposition({ runtimeDir: join(root, 'headless-a') });
    digests.push(headlessA.runConfiguration.provider.parametersSha256);
    headlessA.close();
    process.env.WP_DSH_ARGS_JSON = '["--profile","second"]';
    const headlessB = createComposition({ runtimeDir: join(root, 'headless-b') });
    digests.push(headlessB.runConfiguration.provider.parametersSha256);
    headlessB.close();

    const patchPath = join(root, 'provider-patch.yml');
    process.env.WP_FLYWHEEL_AGENT_PROVIDER = 'deepseek-harness';
    process.env.WP_DSH_PATCHES_JSON = JSON.stringify([patchPath]);
    writeFileSync(patchPath, 'provider: first\n');
    const sdkA = createComposition({ runtimeDir: join(root, 'sdk-a') });
    digests.push(sdkA.runConfiguration.provider.parametersSha256);
    sdkA.close();
    writeFileSync(patchPath, 'provider: second\n');
    const sdkB = createComposition({ runtimeDir: join(root, 'sdk-b') });
    digests.push(sdkB.runConfiguration.provider.parametersSha256);
    sdkB.close();

    assert.notEqual(digests[0], digests[1]);
    assert.notEqual(digests[2], digests[3]);
  } finally {
    for (const key of trackedKeys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test('Pi RunConfigurationSnapshot freezes every non-secret execution parameter', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wp-pi-provider-digest-'));
  const runtimeDir = join(root, 'runtime');
  const trackedKeys = [
    'WP_PI_MAX_TOKENS', 'WP_PI_MAX_SCHEMA_ATTEMPTS', 'WP_PI_CONTEXT_WINDOW',
    'WP_DSH_MAX_TOKENS',
  ] as const;
  const previous = new Map(trackedKeys.map((key) => [key, process.env[key]]));
  const compositions: ReturnType<typeof createComposition>[] = [];
  const create = () => {
    const composition = createComposition({
      runtimeDir,
      clock: () => '2026-09-04T00:00:00.000Z',
      providerEndpointPolicy: {
        validate: async (raw) => ({
          url: new URL(raw.endsWith('/') ? raw : `${raw}/`), addresses: ['1.1.1.1'],
        }),
      },
      providerProbe: {
        verify: async ({ model }) => ({ status: 'VERIFIED', reasonCode: 'READY', model }),
      },
    });
    compositions.push(composition);
    return composition;
  };
  try {
    process.env.WP_PI_MAX_TOKENS = '4096';
    process.env.WP_PI_MAX_SCHEMA_ATTEMPTS = '2';
    process.env.WP_PI_CONTEXT_WINDOW = '16384';
    process.env.WP_DSH_MAX_TOKENS = '1111';
    const first = create();
    await first.apps.providerOperations.put({
      provider: 'pi-agent', apiUrl: 'https://provider.example/v1', apiKey: 'snapshot-secret',
      model: 'model-a', expectedRevision: 0,
    });
    await first.apps.providerOperations.verify({ expectedRevision: 1 });
    const run = first.apps.flywheel.createRun('pi-runtime-snapshot', 'local-v1');
    const snapshot = await first.runConfiguration.capture(run.runId);
    assert.equal(snapshot.provider.kind, 'pi-agent');
    const runtime = first.apps.providerOperations.requireRuntimeConfiguration(snapshot.provider);
    assert.deepEqual({
      api: runtime.api,
      maxTokens: runtime.maxTokens,
      maxSchemaAttempts: runtime.maxSchemaAttempts,
      contextWindow: runtime.contextWindow,
    }, {
      api: 'openai-completions', maxTokens: 4096, maxSchemaAttempts: 2, contextWindow: 16384,
    });
    assert.doesNotMatch(JSON.stringify(snapshot), /snapshot-secret/);
    first.close();

    // DSH settings no longer affect the Pi execution digest.
    process.env.WP_DSH_MAX_TOKENS = '2222';
    const dshChanged = create();
    await dshChanged.runConfiguration.assertCompatible(run.runId);
    dshChanged.close();

    process.env.WP_PI_MAX_TOKENS = '4097';
    const tokenChanged = create();
    await assert.rejects(
      tokenChanged.runConfiguration.assertCompatible(run.runId),
      /run provider configuration changed/,
    );
    tokenChanged.close();

    process.env.WP_PI_MAX_TOKENS = '4096';
    process.env.WP_PI_MAX_SCHEMA_ATTEMPTS = '3';
    const attemptsChanged = create();
    await assert.rejects(
      attemptsChanged.runConfiguration.assertCompatible(run.runId),
      /run provider configuration changed/,
    );
    attemptsChanged.close();
  } finally {
    for (const composition of compositions) {
      try { composition.close(); } catch { /* already closed */ }
    }
    for (const key of trackedKeys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
});
