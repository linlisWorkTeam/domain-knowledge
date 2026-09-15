/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证真实卡片索引 API、增量更新、失败恢复及按需读取正文。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { createKnowledgeServer } from '../../src/interfaces/runner/Server.ts';
import { GOOD_BODY } from '../helpers/Fixture.ts';

test('index tasks expose legal YAML, incremental counts, stale results and recoverable files without eagerly reading bodies', async () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), 'knowledge-index-'));
  const instance = createKnowledgeServer({ runtimeDir, anonymousAccess: true });
  const { composition } = instance;
  instance.server.listen(0, '127.0.0.1'); await once(instance.server, 'listening');
  const address = instance.server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const post = async (path: string, payload: unknown) => fetch(`${base}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  const ingest = (id: string, body: string) => composition.service.ingestCandidate({
    moduleId: id, body, title: `Title: "${id}"`, description: `Purpose for ${id}`, category: 'index-test',
    tags: ['parser'], provenance: [{ path: `${id}.c`, commit: 'commit-one', pinned: true }],
    metadata: { cardId: id, repositoryId: 'index-repository', language: 'c', applicability: 'JSON strings' },
  });
  const getArtifact = composition.artifacts.get.bind(composition.artifacts);
  const bodies = new Set<string>(); let bodyReads = 0;
  composition.artifacts.get = async (ref) => { if (bodies.has(ref.artifactId)) bodyReads += 1; return getArtifact(ref); };
  try {
    const one = await ingest('card-one', GOOD_BODY); bodies.add(one.version.bodyRef.artifactId);
    const two = await ingest('card-two', `${GOOD_BODY}\n\nSecond card.`); bodies.add(two.version.bodyRef.artifactId);
    bodyReads = 0;
    const response = await post('/api/v1/index-builds', {}); assert.equal(response.status, 202);
    const { task } = await response.json();
    const built = await composition.apps.workbenchStages.wait(task.taskId, AbortSignal.timeout(5000));
    assert.equal(built.status, 'SUCCEEDED'); assert.equal(bodyReads, 2);
    assert.deepEqual(built.result?.summary, { added: 2, failed: 0, reused: 0, total: 2, updated: 0 });
    const preview = await (await fetch(`${base}/api/v1/knowledge-index/card-one`)).json();
    const header = parse(preview.yaml);
    assert.equal(header.cardId, 'card-one'); assert.equal(header.versionId, one.version.versionId);
    assert.equal(header.name, 'Title: "card-one"'); assert.equal(header.language, 'c');
    assert.deepEqual(header.sourceVersions, ['commit-one']); assert.ok(header.summary);
    assert.ok(readFileSync(join(runtimeDir, 'card-index', 'card-one.md'), 'utf8').endsWith(GOOD_BODY));
    bodyReads = 0;
    const repeated = await post('/api/v1/index-builds', {}); assert.equal(repeated.status, 200);
    const replay = await repeated.json(); assert.equal(replay.task.taskId, task.taskId); assert.equal(replay.reusedTask, true);
    assert.equal(bodyReads, 0);
    const search = await (await fetch(`${base}/api/v1/knowledge-index?q=parser`)).json();
    assert.equal(search.total, 2); assert.equal(search.stale, 0); assert.equal(bodyReads, 0);
    assert.ok(search.hits[0].match.terms.includes('parser')); assert.ok(search.hits[0].match.fields.includes('keywords'));
    const detail = await fetch(`${base}${search.hits[0].bodyUrl}`); assert.equal(detail.status, 200); assert.equal(bodyReads, 1);
    const revised = await ingest('card-one', `New unique frobnicate behavior.\n\n${GOOD_BODY}`);
    bodies.add(revised.version.bodyRef.artifactId); bodyReads = 0;
    const stale = await (await fetch(`${base}/api/v1/knowledge-index`)).json();
    assert.equal(stale.stale, 1); assert.equal(stale.total, 1); assert.equal(bodyReads, 0);
    const update = await (await post('/api/v1/index-builds', {})).json();
    const updated = await composition.apps.workbenchStages.wait(update.task.taskId, AbortSignal.timeout(5000));
    assert.equal(updated.status, 'SUCCEEDED'); assert.equal(bodyReads, 1);
    assert.deepEqual(updated.result?.summary, { added: 0, failed: 0, reused: 1, total: 2, updated: 1 });
    for (let repeat = 0; repeat < 2; repeat += 1) {
      rmSync(join(runtimeDir, 'card-index', 'card-one.md'));
      const recovered = await (await post('/api/v1/index-builds', {})).json();
      assert.equal(recovered.restored, 1); assert.equal(recovered.reusedTask, true);
      assert.match(readFileSync(join(runtimeDir, 'card-index', 'card-one.md'), 'utf8'), /frobnicate/);
    }
    const denied = await fetch(`${base}/api/v1/index-builds`, { method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://elsewhere.test' }, body: '{}' });
    assert.equal(denied.status, 503);
    const oldVersion = await post('/api/v1/index-builds', { versionIds: [one.version.versionId] });
    assert.equal(oldVersion.status, 409);
  } finally {
    composition.artifacts.get = getArtifact;
    await composition.shutdown(); instance.server.close(); await once(instance.server, 'close');
    rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test('an index failure preserves knowledge and successful card checkpoints; repair resumes the same task', async () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), 'knowledge-index-failure-'));
  const instance = createKnowledgeServer({ runtimeDir }); const { composition } = instance;
  const getArtifact = composition.artifacts.get.bind(composition.artifacts);
  let unavailable = true;
  try {
    const good = await composition.service.ingestCandidate({ moduleId: 'good', body: GOOD_BODY,
      title: 'Good', description: 'Good', category: 'test', tags: [], provenance: [{ path: 'source.c', commit: 'fixed', pinned: true }], metadata: { cardId: 'good' } });
    const bad = await composition.service.ingestCandidate({ moduleId: 'bad', body: `${GOOD_BODY}\nUnavailable`,
      title: 'Bad', description: 'Bad', category: 'test', tags: [], provenance: [{ path: 'source.c', commit: 'fixed', pinned: true }], metadata: { cardId: 'bad' } });
    composition.artifacts.get = async (ref) => {
      if (unavailable && ref.artifactId === bad.version.bodyRef.artifactId) throw new Error('ARTIFACT_UNAVAILABLE');
      return getArtifact(ref);
    };
    const task = composition.apps.workbenchStages.start(composition.apps.knowledgeIndex.prepare());
    const failed = await composition.apps.workbenchStages.wait(task.taskId, AbortSignal.timeout(5000));
    assert.equal(failed.status, 'FAILED'); assert.equal(failed.reasonCode, 'INDEX_BUILD_PARTIAL');
    assert.equal(composition.repository.getKnowledgeVersion(bad.version.versionId)?.bodyRef.artifactId, bad.version.bodyRef.artifactId);
    assert.equal(composition.apps.workbenchStages.store.checkpoints(task.taskId).length, 1);
    assert.equal(composition.apps.knowledgeIndex.search().hits[0]?.versionId, good.version.versionId);
    unavailable = false;
    composition.apps.workbenchStages.resume(task.taskId, task.inputDigest);
    const resumed = await composition.apps.workbenchStages.wait(task.taskId, AbortSignal.timeout(5000));
    assert.equal(resumed.status, 'SUCCEEDED'); assert.equal(resumed.attempt, 2);
    assert.equal(composition.apps.knowledgeIndex.search().total, 2);
    assert.equal(composition.repository.listKnowledgeVersions(['CANDIDATE']).length, 2);
  } finally {
    composition.artifacts.get = getArtifact; await composition.shutdown(); composition.close();
    rmSync(runtimeDir, { recursive: true, force: true });
  }
});
