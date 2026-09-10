/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证运行配置的行为、约束及失败场景。
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createEvent, sha256 } from '../../src/domain/Domain.ts';
import { AGENT_IDS } from '../../src/application/ports/ApplicationPorts.ts';
import { createComposition } from '../../src/interfaces/runner/Composition.ts';

test('RunConfigurationSnapshot freezes all Agent prompts and safe runtime identity', async () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), 'wp-run-configuration-'));
  const composition = createComposition({ runtimeDir, agentProviderMode: 'fixture' });
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
    const schemaRoot = join(process.cwd(), 'docs', 'specs', 'schemas');
    const artifactRef = sha256(readFileSync(join(schemaRoot, 'ArtifactRef.schema.json')));
    assert.equal(snapshot.contracts.commandSchemaSha256, sha256(JSON.stringify({
      command: sha256(readFileSync(join(schemaRoot, 'AgentCommand.schema.json'))), artifactRef,
    })));
    assert.equal(snapshot.contracts.resultSchemaSha256, sha256(JSON.stringify({
      result: sha256(readFileSync(join(schemaRoot, 'AgentResult.schema.json'))),
      artifactRef,
      correction: sha256(readFileSync(join(schemaRoot, 'Correction.schema.json'))),
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

test('Company CodeAgent snapshot freezes all non-secret CLI execution parameters', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wp-codeagent-provider-digest-'));
  const runtimeDir = join(root, 'runtime');
  const trackedKeys = [
    'WP_FLYWHEEL_AGENT_PROVIDER', 'WP_CODEAGENT_BIN', 'WP_CODEAGENT_RUN_ARGS_JSON',
    'WP_CODEAGENT_MODEL', 'WP_CODEAGENT_TIMEOUT_MS', 'WP_CODEAGENT_AUTH_TIMEOUT_MS',
    'WP_CODEAGENT_MAX_OUTPUT_BYTES', 'WP_CODEAGENT_ALLOWED_ROOTS',
  ] as const;
  const previous = new Map(trackedKeys.map((key) => [key, process.env[key]]));
  const compositions: ReturnType<typeof createComposition>[] = [];
  const create = () => {
    const composition = createComposition({ runtimeDir });
    compositions.push(composition);
    return composition;
  };
  try {
    process.env.WP_FLYWHEEL_AGENT_PROVIDER = 'company-codeagent-cli';
    process.env.WP_CODEAGENT_BIN = '/opt/company/bin/codeagent';
    process.env.WP_CODEAGENT_RUN_ARGS_JSON = '["run","--tenant","knowledge"]';
    process.env.WP_CODEAGENT_MODEL = 'company-model-a';
    process.env.WP_CODEAGENT_TIMEOUT_MS = '12345';
    process.env.WP_CODEAGENT_AUTH_TIMEOUT_MS = '2345';
    process.env.WP_CODEAGENT_MAX_OUTPUT_BYTES = '456789';
    process.env.WP_CODEAGENT_ALLOWED_ROOTS = root;
    const first = create();
    const run = first.apps.flywheel.createRun('codeagent-runtime-snapshot', 'local-v1');
    const snapshot = await first.runConfiguration.capture(run.runId);
    assert.equal(snapshot.provider.kind, 'company-codeagent-cli');
    assert.equal(snapshot.provider.model, 'company-model-a');
    assert.match(snapshot.provider.parametersSha256, /^[a-f0-9]{64}$/);
    first.close();

    const same = create();
    await same.runConfiguration.assertCompatible(run.runId);
    same.close();

    process.env.WP_CODEAGENT_MODEL = 'company-model-b';
    const changed = create();
    await assert.rejects(changed.runConfiguration.assertCompatible(run.runId), /run provider configuration changed/);
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

test('DSH RunConfigurationSnapshot freezes every non-secret execution parameter', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wp-dsh-provider-digest-'));
  const runtimeDir = join(root, 'runtime');
  const trackedKeys = [
    'WP_DSH_MAX_TOKENS', 'WP_DSH_MAX_SCHEMA_ATTEMPTS', 'WP_DSH_CONTEXT_WINDOW',
    'WP_PI_MAX_TOKENS',
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
        verify: async ({ model }) => ({ status: 'VERIFIED', reasonCode: 'GENERATION_READY', checks: { modelList: 'PASSED' as const, generation: 'PASSED' as const }, model }),
      },
    });
    compositions.push(composition);
    return composition;
  };
  try {
    process.env.WP_DSH_MAX_TOKENS = '4096';
    process.env.WP_DSH_MAX_SCHEMA_ATTEMPTS = '2';
    process.env.WP_DSH_CONTEXT_WINDOW = '16384';
    process.env.WP_PI_MAX_TOKENS = '1111';
    const first = create();
    await first.apps.providerOperations.put({
      provider: 'deepseek-harness', apiUrl: 'https://provider.example/v1', apiKey: 'snapshot-secret',
      model: 'model-a', expectedRevision: 0,
    });
    await first.apps.providerOperations.verify({ expectedRevision: 1 });
    const run = first.apps.flywheel.createRun('dsh-runtime-snapshot', 'local-v1');
    const snapshot = await first.runConfiguration.capture(run.runId);
    assert.equal(snapshot.provider.kind, 'deepseek-harness');
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

    // Retired Pi settings cannot alter the DSH execution digest.
    process.env.WP_PI_MAX_TOKENS = '2222';
    const dshChanged = create();
    await dshChanged.runConfiguration.assertCompatible(run.runId);
    dshChanged.close();

    process.env.WP_DSH_MAX_TOKENS = '4097';
    const tokenChanged = create();
    await assert.rejects(
      tokenChanged.runConfiguration.assertCompatible(run.runId),
      /run provider configuration changed/,
    );
    tokenChanged.close();

    process.env.WP_DSH_MAX_TOKENS = '4096';
    process.env.WP_DSH_MAX_SCHEMA_ATTEMPTS = '3';
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

test('old role execution versions remain readable but cannot resume; same version remains compatible', async () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), 'wp-role-version-'));
  const composition = createComposition({ runtimeDir, agentProviderMode: 'fixture' });
  try {
    const run = composition.apps.flywheel.createRun('role-version', 'local-v1');
    const snapshot = await composition.runConfiguration.capture(run.runId);
    assert.equal(snapshot.roleExecutionVersion, 'seven-role-mvp-v5');
    await composition.runConfiguration.assertCompatible(run.runId);
    const original = composition.repository.getRunConfiguration.bind(composition.repository);
    composition.repository.getRunConfiguration = (runId) => {
      const result = original(runId);
      if (result) delete result.roleExecutionVersion;
      return result;
    };
    assert.equal(composition.runConfiguration.get(run.runId)?.runId, run.runId);
    assert.ok(composition.repository.getRun(run.runId));
    await assert.rejects(composition.runConfiguration.assertCompatible(run.runId), /RUN_CONFIGURATION_INCOMPATIBLE: role execution version/);
    await assert.rejects(composition.runConfiguration.resolvePrompt(run.runId, 'doc-gen'), /RUN_CONFIGURATION_INCOMPATIBLE/);
    composition.repository.getRunConfiguration = (runId) => {
      const result = original(runId);
      if (result) result.roleExecutionVersion = 'seven-role-mvp-v3';
      return result;
    };
    assert.equal(composition.runConfiguration.get(run.runId)?.runId, run.runId);
    await assert.rejects(composition.runConfiguration.assertCompatible(run.runId), /RUN_CONFIGURATION_INCOMPATIBLE: role execution version/);
    composition.repository.getRunConfiguration = original;
    await composition.runConfiguration.assertCompatible(run.runId);
  } finally { composition.close(); rmSync(runtimeDir, { recursive: true, force: true }); }
});
