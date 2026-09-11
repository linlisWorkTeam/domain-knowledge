/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证按冻结源码版本和阶段过滤历史任务后再分页。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createKnowledgeServer } from '../../src/interfaces/runner/Server.ts';
import { createStageTask, type WorkbenchStage } from '../../src/domain/services/workbench/StageTask.ts';
test('snapshot and stage filters precede pagination and do not mix old versions', async () => {
  const root = mkdtempSync(join(tmpdir(), 'stage-history-')); const server = createKnowledgeServer({ runtimeDir: root, anonymousAccess: true });
  server.server.listen(0, '127.0.0.1'); await once(server.server, 'listening');
  const address = server.server.address(); assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}/api/v1/stage-tasks`;
  try {
    for (const [snapshotId, stage, index] of [['old', 'GENERATE', 1], ['new', 'GENERATE', 2], ['old', 'EVALUATE', 3], ['old', 'GENERATE', 4]] as Array<[string, WorkbenchStage, number]>) {
      server.composition.apps.workbenchStages.store.insert(createStageTask({ projectId: 'p', stage, sourceRevision: snapshotId, sourceDigest: snapshotId, configurationDigest: 'config', cardVersionIds: [], parameters: { snapshotId, index } }, {}, 'now'));
    }
    const first = await (await fetch(base + '?snapshotId=old&stage=GENERATE&limit=1')).json();
    assert.equal(first.items.length, 1); assert.ok(first.nextCursor); assert.equal(first.items[0].input.parameters.snapshotId, 'old');
    const second = await (await fetch(base + '?snapshotId=old&stage=GENERATE&limit=1&cursor=' + encodeURIComponent(first.nextCursor))).json();
    assert.equal(second.items.length, 1); assert.equal(second.nextCursor, null); assert.notEqual(first.items[0].taskId, second.items[0].taskId);
    assert.equal(second.items[0].input.stage, 'GENERATE');
    assert.equal((await (await fetch(base + '?snapshotId=missing')).json()).items.length, 0);
  } finally { server.server.closeAllConnections(); await new Promise<void>(resolve => server.server.close(() => resolve())); rmSync(root, { recursive: true, force: true }); }
});
