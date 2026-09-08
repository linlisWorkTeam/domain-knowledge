import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client';
import { writeOpenCodeGoPatch } from '../../src/infrastructure/agents/deepseek-harness/opencode-go.ts';
import { createComposition } from '../../src/interfaces/runner/composition.ts';

test('OpenCode Go environment configuration works without deployment assets and freezes public parameters', async () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), 'opencode-go-config-'));
  const keys = ['WP_DSH_PROVIDER', 'WP_DSH_MODEL', 'WP_DSH_PROFILE', 'WP_DSH_PATCHES_JSON', 'WP_DSH_CONTEXT_WINDOW',
    'WP_DSH_MAX_TOKENS', 'OPENCODE_GO_BASE_URL', 'OPENCODE_GO_API_KEY'] as const;
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  const compositions: ReturnType<typeof createComposition>[] = [];
  const create = () => {
    const composition = createComposition({ runtimeDir, agentProviderMode: 'deepseek-harness' });
    compositions.push(composition);
    return composition;
  };
  try {
    for (const key of keys) delete process.env[key];
    process.env.WP_DSH_PROVIDER = 'opencode-go';
    process.env.OPENCODE_GO_API_KEY = 'test-key-not-for-disk';
    const first = create();
    const run = first.apps.flywheel.createRun('generic-example', 'local-v1');
    const snapshot = await first.runConfiguration.capture(run.runId);
    const directory = join(runtimeDir, 'dsh/provider-patches');
    const files = readdirSync(directory);
    assert.equal(files.length, 1);
    const text = readFileSync(join(directory, files[0]!), 'utf8');
    const patch = JSON.parse(text);
    const provider = patch[0].insert[0].config.providers['opencode-go'];
    assert.equal(provider.baseURL, 'https://opencode.ai/zen/go/v1');
    assert.equal(provider.apiKeyEnv, 'OPENCODE_GO_API_KEY');
    assert.equal(provider.compat.thinkingFormat, 'deepseek');
    assert.equal(provider.models[0].id, 'deepseek-v4-flash');
    assert.equal(provider.models[0].contextWindow, 262144);
    assert.equal(provider.models[0].maxTokens, 32768);
    assert.doesNotMatch(text + JSON.stringify(snapshot), /test-key-not-for-disk/);

    process.env.OPENCODE_GO_API_KEY = 'rotated-test-key';
    const rotated = create();
    await rotated.runConfiguration.assertCompatible(run.runId);
    assert.equal(rotated.runConfiguration.provider.parametersSha256, snapshot.provider.parametersSha256);

    for (const [key, value] of [
      ['OPENCODE_GO_BASE_URL', 'https://gateway.example/v1'],
      ['WP_DSH_MODEL', 'another-model'],
      ['WP_DSH_CONTEXT_WINDOW', '131072'],
      ['WP_DSH_MAX_TOKENS', '16384'],
    ] as const) {
      process.env[key] = value;
      const changed = create();
      await assert.rejects(changed.runConfiguration.assertCompatible(run.runId), /provider configuration changed/);
      delete process.env[key];
    }

    const customPath = join(runtimeDir, 'custom-patch.json');
    writeFileSync(customPath, '[]');
    process.env.WP_DSH_PATCHES_JSON = JSON.stringify([customPath]);
    process.env.OPENCODE_GO_BASE_URL = 'not-used-with-explicit-patches';
    const custom = create();
    assert.notEqual(custom.runConfiguration.provider.parametersSha256, snapshot.provider.parametersSha256);
  } finally {
    for (const composition of compositions) composition.close();
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test('generated OpenCode Go patch registers its model adapter in the real minimal DSH profile', async () => {
  const root = mkdtempSync(join(tmpdir(), 'opencode-go-profile-'));
  const model = 'fixture-deepseek';
  const patch = writeOpenCodeGoPatch({ runtimeDir: root, model, maxTokens: 1000 });
  const env = { ...process.env, DSH_HOME: join(root, 'profile-home'),
    DSH_TELEMETRY_MODE: 'DISABLED', OPENCODE_GO_API_KEY: 'fixture-not-a-real-key' };
  const harness = new DeepSeekHarness({
    profile: 'sdk-minimal', patches: [patch], provider: 'opencode-go', model,
    cwd: root, processCwd: root, dshHome: env.DSH_HOME, env, initializeTimeoutMs: 15000,
  });
  try {
    const dump = execFileSync(process.execPath, [
      join(process.cwd(), 'node_modules/@deepseek-ai/dsh/lib/bin.js'),
      '--profile', 'sdk-minimal', '--dump-config', '--patch', patch,
    ], { cwd: root, env, encoding: 'utf8', timeout: 15000 });
    assert.match(dump, /name: ['"]?@deepseek-ai\/dsh-llm-pi-ai/);
    assert.match(dump, /apiKeyEnv: OPENCODE_GO_API_KEY/);
    assert.match(dump, /id: fixture-deepseek/);
    assert.doesNotMatch(dump, /fixture-not-a-real-key/);
    await harness.start(); // Startup only: no prompt and no external model request.
  } finally {
    await harness.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('OpenCode Go rejects invalid connection parameters without exposing credentials', () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), 'opencode-go-invalid-'));
  const input = { runtimeDir, model: 'example', maxTokens: 100 };
  try {
    for (const baseURL of ['not-a-url', 'http://example.com/v1', 'https://user:secret@example.com/v1',
      'https://example.com/v1?key=secret', 'https://example.com/v1#secret']) {
      assert.throws(() => writeOpenCodeGoPatch({ ...input, baseURL }), (error: Error) => {
        assert.match(error.message, /CONFIG_INVALID/);
        assert.doesNotMatch(error.message, /secret/);
        return true;
      });
    }
    for (const contextWindow of [99, NaN, Infinity]) {
      assert.throws(() => writeOpenCodeGoPatch({ ...input, contextWindow }), /CONFIG_INVALID/);
    }
    assert.equal(readdirSync(runtimeDir).length, 0);
  } finally { rmSync(runtimeDir, { recursive: true, force: true }); }
});
