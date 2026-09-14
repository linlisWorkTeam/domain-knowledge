/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证来源期限限定范围、旧期限不变和角色取消仍生效。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCE_REVIEW_POLICY, readSourceReviewPolicy, sourceReviewTimeoutMs } from '../../src/domain/knowledge/SourceReviewPolicy.ts';
import { execute } from '../../src/domain/agents/reviewAgent/ReviewAgent.ts';
import type { Input } from '../../src/domain/agents/reviewAgent/WorkbenchReviewContract.ts';
import type { StageAttempt } from '../../src/domain/agents/AgentExecution.ts';
import { sha256 } from '../../src/domain/Domain.ts';
import { roleExample } from '../helpers/RoleExample.ts';
test('source review policy has a fixed upper bound and cannot extend other review phases', () => {
  assert.equal(readSourceReviewPolicy(undefined), null);
  assert.equal(sourceReviewTimeoutMs({ phase: 'FINAL_SOURCE_REVIEW' }), 180000);
  assert.equal(sourceReviewTimeoutMs({}), 180000);
  for (const phase of ['FINAL_SOURCE_REVIEW', 'REVISION_SOURCE_REVIEW']) assert.equal(sourceReviewTimeoutMs({ phase, sourceReviewPolicy: SOURCE_REVIEW_POLICY }), 600000);
  for (const value of [null, {}, { ...SOURCE_REVIEW_POLICY, timeoutMs: 600001 }, { ...SOURCE_REVIEW_POLICY, timeoutMs: '600000' }, { ...SOURCE_REVIEW_POLICY, retryCount: 10 }]) assert.throws(() => readSourceReviewPolicy(value), /SOURCE_REVIEW_POLICY_INVALID/);
  assert.throws(() => sourceReviewTimeoutMs({ phase: 'BEHAVIOR_REVIEW', sourceReviewPolicy: SOURCE_REVIEW_POLICY }), /SOURCE_REVIEW_POLICY_INVALID/);
});
test('Review records the frozen deadline, preserves the legacy deadline and still honours cancellation', async () => {
  for (const extended of [false, true]) {
    const sample = roleExample<Input>('review', 'src/domain/agents/reviewAgent/examples/WorkbenchReviewSample.json');
    const material = sample.input.materials.find(item => item.ref.artifactId === sample.input.payload.criteriaRef.artifactId)!;
    material.content = { ...(material.content as object), phase: 'FINAL_SOURCE_REVIEW', ...(extended ? { sourceReviewPolicy: SOURCE_REVIEW_POLICY } : {}) };
    const bytes = JSON.stringify(material.content); const digest = sha256(bytes);
    material.ref = { ...material.ref, artifactId: `sha256:${digest}`, sha256: digest, size: Buffer.byteLength(bytes) };
    sample.input.payload.criteriaRef = material.ref; sample.input.provenance = sample.input.materials.map(item => item.ref);
    const history: StageAttempt[] = [{ schemaVersion: 'role-stage-v1', stage: 'evidence-attribution', attempt: 1, startedAt: 0, deadlineAt: extended ? 600000 : 180000, status: 'FAILED', failureCode: 'TEST_INTERRUPTION' }];
    sample.context.now = () => 200000;
    sample.context.stageJournal = { read: async () => history, record: async value => { history.push(value); } };
    if (!extended) { await assert.rejects(execute(sample.input, sample.context), /AGENT_STAGE_TIMEOUT/); assert.equal(sample.requests.length, 0); }
    else {
      await execute(sample.input, sample.context);
      assert.equal(sample.requests.length, 1); assert.equal(history.at(-1)!.deadlineAt, 600000);
      assert.equal(history.at(-1)!.startedAt, 0); assert.equal(history.at(-1)!.attempt, 2);
      sample.controller.abort(); await assert.rejects(execute(sample.input, sample.context), /CANCELLED/);
    }
  }
});
