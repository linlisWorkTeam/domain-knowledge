/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验收 AC-AGENT-106 所有人工停止路径的持久交接与幂等。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { ArtifactRef } from '../../src/domain/Domain.ts';
import { agentScenario } from '../helpers/AgentScenario.ts';

for (const kind of ['test', 'proposal', 'quality', 'gate'] as const) {
  test(`AC-AGENT-106: ${kind} stop preserves actionable CAS handoff exactly once`, async () => {
    const env = await agentScenario({ testFailure: kind === 'test', proposal: kind === 'proposal', qualityFailure: kind === 'quality' });
    try {
      const { handle, result } = await env.start(1);
      assert.equal(result.route, 'STOPPED', result.error ?? '');
      const events = () => env.c.repository.listEvents(handle.runId).filter(e => e.eventType === 'ReviewHandoffPrepared');
      assert.equal(events().length, 1);
      const payload = events()[0]!.payload;
      assert.match(String(payload.summary), /建议|请|决定/);
      const handoff = JSON.parse(Buffer.from(await env.c.artifacts.get(payload.handoffRef as ArtifactRef)).toString());
      assert.equal(handoff.summary, payload.summary);
      assert.ok(handoff.evidenceRefs.length > 0);
      for (const ref of handoff.evidenceRefs) assert.ok((await env.c.artifacts.get(ref)).length);
      if (kind === 'gate') assert.ok(handoff.historySummary.length > 0);
      else assert.equal(env.calls.filter(c => c.role === 'review').length, 0);
      assert.ok(env.c.service.listActionItems().some(a => String(a.summary).includes(handoff.summary)));
      await env.stages.execute(env.routes.at(-1)!);
      assert.equal(events().length, 1);
    } finally { env.dispose(); }
  });
}
