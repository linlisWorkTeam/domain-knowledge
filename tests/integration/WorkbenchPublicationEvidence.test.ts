/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证发布准备重读卡片并拒绝缺失或被篡改的递归工件。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256, type ArtifactRef, type KnowledgeVersion } from '../../src/domain/Domain.ts';
import { WorkbenchPublicationEvidence } from '../../src/application/services/WorkbenchPublicationEvidence.ts';
import { publicationFixture } from '../helpers/WorkbenchPublicationFixture.ts';
import { canonicalJson, createStageTask } from '../../src/domain/services/workbench/StageTask.ts';
async function setup() {
  const input = publicationFixture(); const contents = new Map<string, Buffer>(); let puts = 0;
  const put = async (data: Uint8Array, mediaType: string): Promise<ArtifactRef> => {
    puts++; const buffer = Buffer.from(data); const digest = sha256(buffer); contents.set(digest, buffer);
    return { artifactId: `sha256:${digest}`, sha256: digest, size: buffer.length, mediaType };
  };
  const bodyRef = await put(Buffer.from('body'), 'text/markdown');
  const nestedRef = await put(Buffer.from('audit'), 'text/plain');
  const suiteRef = await put(Buffer.from(JSON.stringify({ schemaVersion: 'fixture', nestedRef })), 'application/json');
  input.fixedSuites[0]!.suiteRef = suiteRef; input.fixedEvaluation.input.parameters.suiteRefs = { module: { ...suiteRef } };
  const identity = createStageTask(input.fixedEvaluation.input, input.fixedEvaluation.limits, 'now');
  input.fixedEvaluation.taskId = identity.taskId; input.fixedEvaluation.inputDigest = identity.inputDigest;
  const records = [input.reconstruction, input.evaluation, input.fixedEvaluation, input.sourceVerification];
  const card = { versionId: 'version', bodyRef, metadata: { cardId: 'card', sourceModule: 'module', projectSnapshotId: 'snapshot' } } as unknown as KnowledgeVersion;
  const service = new WorkbenchPublicationEvidence({ stages: { get(id) { const task = records.find(task => task.taskId === id); assert.ok(task); return structuredClone(task); } },
    repository: { getKnowledgeVersion: () => structuredClone(card) }, artifacts: {
      put, get: async ref => { const value = contents.get(ref.sha256); assert.ok(value); return value; },
      verify: async ref => { const data = contents.get(ref.sha256); return Boolean(data && data.length === ref.size && sha256(data) === ref.sha256); },
    } });
  puts = 0;
  const ids = { reconstruction: input.reconstruction.taskId, evaluation: input.evaluation.taskId, fixedEvaluation: input.fixedEvaluation.taskId, sourceVerification: input.sourceVerification.taskId };
  return { service, ids, input, contents, nestedRef, card, puts: () => puts };
}
test('preparation checks recursive CAS graph, binds body and is content-idempotent', async () => {
  const f = await setup(); const prepared = await f.service.prepare(f.ids, f.input.fixedSuites);
  assert.equal(prepared.state, 'PREPARED'); assert.equal(prepared.publicationVerified, false);
  assert.equal(prepared.verifiedArtifactRefs.length, 3);
  assert.equal((await f.service.prepare(f.ids, f.input.fixedSuites)).artifactRef.sha256, prepared.artifactRef.sha256);
});
test('corrupt nested artifact and changed persistent body reject before writing preparation', async () => {
  const f = await setup(); f.contents.set(f.nestedRef.sha256, Buffer.from('wrong'));
  await assert.rejects(f.service.prepare(f.ids, f.input.fixedSuites), /PUBLICATION_ARTIFACT_CORRUPT/); assert.equal(f.puts(), 0);
  const g = await setup(); g.card.bodyRef.sha256 = sha256('changed');
  await assert.rejects(g.service.prepare(g.ids, g.input.fixedSuites)); assert.equal(g.puts(), 0);
});
