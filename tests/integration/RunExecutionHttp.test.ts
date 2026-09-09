/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证运行查询保留业务阶段并提供失败、恢复、取消的真实执行投影。
 */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createRunExecutionFixture } from '../helpers/RunExecutionFixture.ts';

test('run list, filters and detail expose execution failure without rewriting business or historical node facts', async () => {
  const fixture = await createRunExecutionFixture();
  const { instance, ids } = fixture;
  instance.server.listen(0, '127.0.0.1'); await once(instance.server, 'listening');
  const address = instance.server.address(); assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const items = (await (await fetch(base + '/api/v1/runs')).json()).items;
    assert.equal(items.filter((run: { isActive: boolean }) => run.isActive).length, 1);
    const failed = items.find((run: { runId: string }) => run.runId === ids.failed);
    assert.equal(failed.state, 'GENERATING'); assert.equal(failed.executionStatus, 'FAILED');
    assert.equal(failed.isActive, false); assert.equal(failed.canCancel, false); assert.equal(failed.recovery.canResume, true);
    assert.deepEqual(failed.executionFailure, { code: 'DOC_WORKER_SOURCE_EVIDENCE_INVALID', nodeId: 'doc_worker' });
    assert.equal(JSON.stringify(items).includes('private-'), false);
    assert.equal(items.find((run: { runId: string }) => run.runId === ids.untracked).executionStatus, 'NOT_TRACKED');
    assert.equal(items.find((run: { runId: string }) => run.runId === ids.unavailable).executionStatus, 'UNAVAILABLE');
    const failures = await (await fetch(base + '/api/v1/runs?executionStatus=FAILED')).json();
    assert.deepEqual(failures.items.map((run: { runId: string }) => run.runId).sort(), [ids.failed, ids.expired, ids.incompatible].sort());
    const generating = await (await fetch(base + '/api/v1/runs?status=GENERATING')).json();
    assert.ok(generating.items.some((run: { runId: string }) => run.runId === ids.failed), 'status keeps its business-state meaning');
    for (const [runId, reason] of [[ids.expired, 'BUDGET_EXHAUSTED'], [ids.incompatible, 'RUN_CONFIGURATION_INCOMPATIBLE']]) {
      const detail = await (await fetch(base + '/api/v1/runs/' + runId)).json();
      assert.equal(detail.run.state, 'GENERATING'); assert.equal(detail.run.executionStatus, 'FAILED');
      assert.equal(detail.run.recovery.canResume, false); assert.equal(detail.run.recovery.reasonCode, reason);
    }
    const cancelled = await (await fetch(base + '/api/v1/runs/' + ids.cancelled)).json();
    assert.equal(cancelled.run.executionStatus, 'CANCELLED'); assert.equal(cancelled.run.isActive, false);
    assert.equal(cancelled.workflowNodes[0].status, 'RUNNING', 'historical node facts must not be rewritten for display');
    assert.equal(instance.composition.apps.flywheel.getRun(ids.failed)?.state, 'GENERATING');
  } finally { await fixture.dispose(); }
});

test('resume rejection gives an explicit budget reason without upstream material', async () => {
  const fixture = await createRunExecutionFixture();
  const { instance, ids } = fixture;
  instance.composition.apps.orchestrator.resume = async () => { throw new Error('ACCEPTANCE_LIMIT_REACHED: private-authorization-material'); };
  instance.server.listen(0, '127.0.0.1'); await once(instance.server, 'listening');
  const address = instance.server.address(); assert.ok(address && typeof address === 'object');
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/runs/${ids.failed}/resume`, {
      method: 'POST', headers: { authorization: 'Bearer run-view-token', 'content-type': 'application/json', 'idempotency-key': 'blocked-resume' }, body: '{}',
    });
    assert.equal(response.status, 409);
    const payload = await response.json(); assert.equal(payload.error.code, 'ACCEPTANCE_LIMIT_REACHED');
    assert.equal(JSON.stringify(payload).includes('private-'), false);
    assert.equal(instance.composition.apps.flywheel.getRun(ids.failed)?.state, 'GENERATING');
  } finally { await fixture.dispose(); }
});
