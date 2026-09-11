/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证工作台发布 HTTP 使用完整证据门禁和受限匿名下载。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createKnowledgeServer } from '../../src/interfaces/runner/Server.ts';
import { createPublicationPreparationFixture } from '../helpers/PublicationPreparationFixture.ts';
import { WorkbenchPublications } from '../../src/application/services/WorkbenchPublications.ts';
import { LocalWorkbenchPublicationFiles } from '../../src/infrastructure/publication/LocalWorkbenchPublicationFiles.ts';

test('anonymous publication validates frozen tasks, groups versions, restricts downloads and resumes idempotently', async () => {
  const root = mkdtempSync(join(tmpdir(), 'workbench-publication-http-'));
  const instance = createKnowledgeServer({ runtimeDir: root, anonymousAccess: true, writeToken: 'legacy-token' });
  const f = await createPublicationPreparationFixture();
  const original = instance.composition.apps.workbenchPublications;
  const app = new WorkbenchPublications({ ...original.dependencies, evidence: f.service,
    files: new LocalWorkbenchPublicationFiles(join(root, 'published-test'), f.service.dependencies.artifacts) });
  instance.composition.apps.workbenchPublications = app;
  instance.server.listen(0, '127.0.0.1'); await once(instance.server, 'listening');
  const address = instance.server.address(); assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}/api/v1/workbench-publications`;
  const post = (url: string, value: unknown) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
  const payload = { reconstructionTaskId: f.ids.reconstruction, evaluationTaskId: f.ids.evaluation,
    fixedEvaluationTaskId: f.ids.fixedEvaluation, sourceVerificationTaskId: f.ids.sourceVerification };
  try {
    assert.equal((await post(base, { ...payload, fixedSuites: [] })).status, 422);
    assert.equal((await post(base, { ...payload, evaluationTaskId: '' })).status, 422);
    const first = await post(base, payload); assert.equal(first.status, 200);
    const detail = await first.json(); assert.equal(detail.publicationVerified, true); assert.equal(detail.filesAvailable, true);
    const record = detail.publication;
    const repeated = await post(base, payload); assert.deepEqual(await repeated.json(), detail);
    const list = await (await fetch(base + '?versionId=' + encodeURIComponent(record.versionIds[0]))).json();
    assert.equal(list.items.length, 1); assert.equal(list.items[0].publicationVerified, true);
    assert.equal((await (await fetch(base + '?versionId=missing')).json()).items.length, 0);
    const file = record.files.find((value: { path: string }) => value.path.startsWith('cards/'));
    const download = await fetch(`${base}/${record.publicationId}/artifacts/${file.ref.sha256}`);
    assert.equal(download.status, 200); assert.match(await download.text(), /## Value/);
    assert.match(download.headers.get('content-disposition')!, /card.md/);
    assert.equal((await fetch(`${base}/${record.publicationId}/artifacts/${f.nestedRef.sha256}`)).status, 404);
    const resumed = await post(`${base}/${record.publicationId}/resume`, {}); assert.deepEqual(await resumed.json(), detail);
    assert.equal((await fetch(base + '/missing')).status, 404);
  } finally {
    await app.shutdown();
    instance.server.closeAllConnections(); await new Promise<void>(resolve => instance.server.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  }
});
