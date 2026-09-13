/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证免登录下构建证据在检查点提交后可读，未绑定工件仍拒绝。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createKnowledgeServer } from '../../src/interfaces/runner/Server.ts';
import { createStageTask } from '../../src/domain/services/workbench/StageTask.ts';
test('scope downloads become available during a source run and survive failure without exposing unrelated CAS', async () => {
  const root = mkdtempSync(join(tmpdir(), 'source-scope-http-'));
  const server = createKnowledgeServer({ runtimeDir: root, anonymousAccess: true });
  server.server.listen(0, '127.0.0.1'); await once(server.server, 'listening');
  const address = server.server.address(); assert.ok(address && typeof address === 'object');
  const { composition } = server, store = composition.apps.workbenchStages.store;
  try {
    const scope = await composition.artifacts.put(Buffer.from('[{"moduleId":"module"}]'), 'application/json');
    const unrelated = await composition.artifacts.put(Buffer.from('{"unrelated":true}'), 'application/json');
    const task = store.insert(createStageTask({ projectId: 'project', stage: 'EVALUATE', sourceRevision: 'commit', sourceDigest: 'source', configurationDigest: 'config', cardVersionIds: [],
      parameters: { operation: 'KNOWLEDGE_SOURCE_VERIFICATION', verificationContract: 'knowledge-source-verification-v4', executionScopesRef: JSON.parse(JSON.stringify(scope)) } }, {}, 'now'));
    const url = `http://127.0.0.1:${address.port}/api/v1/stage-tasks/${task.taskId}/artifacts/`;
    assert.equal((await fetch(url + scope.sha256)).status, 404, 'input reference alone does not grant artifact download');
    const lease = store.claim(task.taskId); assert.ok(lease);
    store.checkpoint(task.taskId, lease.leaseId, 'source-execution-scope', { artifactRefs: [scope], summary: { publicationVerified: false } });
    assert.equal(store.get(task.taskId)!.status, 'RUNNING');
    const response = await fetch(url + scope.sha256); assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), [{ moduleId: 'module' }]);
    assert.equal((await fetch(url + unrelated.sha256)).status, 404);
    store.finish(task.taskId, lease.leaseId, 'FAILED', null, 'TEST_REVIEW_FAILED');
    assert.equal((await fetch(url + scope.sha256)).status, 200);
  } finally {
    server.server.closeAllConnections(); await new Promise<void>(resolve => server.server.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  }
});
