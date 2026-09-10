/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证指定材料固定修订、原文证据、重启复用及漂移拒绝。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SQLiteFlywheelRepository, LocalCasArtifactStore } from '../../src/infrastructure/sqlite/SqliteCas.ts';
import { SQLiteContentGovernance } from '../../src/infrastructure/sqlite/SqliteContentGovernance.ts';
import { SqliteExternalMaterials } from '../../src/infrastructure/sqlite/SqliteExternalMaterials.ts';
import { MaterialText } from '../../src/infrastructure/source/MaterialText.ts';
import { WorkbenchMaterials } from '../../src/application/services/WorkbenchMaterials.ts';

test('source snapshots retain raw evidence, reject drift, and reuse immutable records', async () => {
  const root = mkdtempSync(join(tmpdir(), 'material-source-'));
  let repository = new SQLiteFlywheelRepository(join(root, 'registry.sqlite')); repository.initialize();
  const artifacts = new LocalCasArtifactStore(join(root, 'cas'));
  const governance = new SQLiteContentGovernance({ database: repository.database, artifacts, repositoryRoot: root, configuredRoots: [root], defaultRule: { policyId: 'local-v1', minimumStability: 0.8, requireAllTests: true, maxIterations: 0 } }); governance.initialize();
  const app = new WorkbenchMaterials(governance, new SqliteExternalMaterials(repository.database), artifacts, new MaterialText());
  const raw = '<html><style>hidden</style><h1>jsmn_parse</h1><p>Use &lt;tokens&gt;.</p><script>evil()</script></html>';
  writeFileSync(join(root, 'guide.html'), raw);
  try {
    const created = await governance.createSource({ kind: 'FILE', locator: 'guide.html', displayName: 'Guide' }, { idempotencyKey: 'create', fingerprint: 'create', actor: 'test' });
    const sourceId = String(created.resourceId);
    const material = await app.capture(sourceId, 'JSON token parsing only');
    const detail = await app.read(material.materialId);
    assert.equal(detail.text, 'jsmn_parse\nUse <tokens>.');
    assert.equal(Buffer.from(await artifacts.get(material.rawRef)).toString(), raw);
    assert.deepEqual(await app.capture(sourceId, material.applicability), material);
    assert.notEqual((await app.capture(sourceId, 'Other conditions')).materialId, material.materialId);
    writeFileSync(join(root, 'guide.html'), '<p>changed</p>');
    await assert.rejects(app.capture(sourceId, material.applicability), /SOURCE_REVISION_INVALID/);
    assert.equal(app.store.list().length, 2);
    repository.close(); repository = new SQLiteFlywheelRepository(join(root, 'registry.sqlite')); repository.initialize();
    assert.deepEqual(new SqliteExternalMaterials(repository.database).get(material.materialId), material);
  } finally { repository.close(); rmSync(root, { recursive: true, force: true }); }
});

test('material conversion rejects binary, invalid UTF-8, empty, unsupported and oversized input', () => {
  const reader = new MaterialText();
  assert.throws(() => reader.extract(new Uint8Array([255]), 'text/plain'), /ENCODING/);
  assert.throws(() => reader.extract(Buffer.from('a\0b'), 'text/plain'), /FORMAT/);
  assert.throws(() => reader.extract(Buffer.from('hello'), 'application/pdf'), /FORMAT/);
  assert.throws(() => reader.extract(Buffer.from('<script>jsmn_parse</script>'), 'text/html'), /EMPTY/);
  assert.throws(() => reader.extract(new Uint8Array(2097153), 'text/plain'), /SIZE_LIMIT/);
  assert.equal(reader.extract(Buffer.from('# literal <tag>\r\nBody'), 'text/markdown'), '# literal <tag>\nBody');
});
