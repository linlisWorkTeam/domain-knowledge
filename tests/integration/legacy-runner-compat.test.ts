import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { translateLegacyArgs } from '../../src/interfaces/runner/compat.ts';
import { GOOD_BODY } from '../helpers/fixture.ts';

test('legacy arguments map to the single TypeScript core', () => {
  assert.deepEqual(
    translateLegacyArgs(['ingest', '--content', 'body', '--name', 'module-a', '--source', 'source.md', '--force-draft', '--json']),
    ['ingest', '--module', 'module-a', '--source', 'source.md', '--content', 'body'],
  );
  assert.deepEqual(
    translateLegacyArgs(['query', '--q', 'gate', '--status', 'draft', '--no-feedback']),
    ['query', '--q', 'gate', '--status', 'CANDIDATE'],
  );
  assert.deepEqual(translateLegacyArgs(['get', '--name', 'module-a']), ['get', '--module', 'module-a']);
  assert.throws(() => translateLegacyArgs(['eval', '--name', 'module-a']), /LEGACY_COMMAND_RETIRED/);
});

test('legacy facade writes only the shared SQLite and CAS runtime', () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), 'wp-legacy-facade-'));
  const run = (args: string[]) => spawnSync(process.execPath, ['fw.mjs', ...args], {
    cwd: process.cwd(),
    env: { ...process.env, WP_FLYWHEEL_HOME: runtimeDir },
    encoding: 'utf8',
  });
  try {
    assert.equal(run(['init']).status, 0);
    const ingest = run([
      'ingest', '--content', GOOD_BODY, '--name', 'legacy-module', '--source', 'knowledge/source.md',
      '--title', 'Legacy module', '--description', 'Compatibility entrypoint candidate.', '--pinned',
    ]);
    assert.equal(ingest.status, 0, ingest.stderr);
    assert.equal(JSON.parse(ingest.stdout).version.status, 'CANDIDATE');
    const get = run(['get', '--name', 'legacy-module']);
    assert.equal(get.status, 0, get.stderr);
    const fullCard = JSON.parse(get.stdout);
    assert.equal(fullCard.moduleId, 'legacy-module');
    assert.equal(fullCard.body, GOOD_BODY);
    const status = run(['status']);
    assert.equal(status.status, 0, status.stderr);
    assert.equal(JSON.parse(status.stdout).knowledgeTotal, 1);
    const retired = run(['score', '--name', 'legacy-module']);
    assert.notEqual(retired.status, 0);
    assert.match(retired.stderr, /LEGACY_COMMAND_RETIRED/);
  } finally {
    rmSync(runtimeDir, { recursive: true, force: true });
  }
});
