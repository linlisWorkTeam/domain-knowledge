/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：用受控重建材料和真实gcc验证固定评测拒绝、检查点恢复与无模型执行。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createKnowledgeServer } from '../../src/interfaces/runner/Server.ts';
import { createComposition } from '../../src/interfaces/runner/Composition.ts';
import { createStageTask, type JsonValue } from '../../src/domain/workbench/StageTask.ts';
import { sha256 } from '../../src/domain/Domain.ts';
import { NativeToolchain } from '../../src/infrastructure/evaluation/project/NativeToolchain.ts';
import { NativeCaseExecutor } from '../../src/infrastructure/evaluation/project/NativeCaseExecutor.ts';
import type { NativeBehaviorSuite } from '../../src/domain/evaluation/NativeBehaviorSuite.ts';
const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value));
for (const apiSource of ['math.h', 'math.c']) test(`fixed reference rejection and restart preserve cases with interface source ${apiSource}`, async () => {
  const root = mkdtempSync(join(tmpdir(), 'fixed-stage-source-')); const runtimeDir = mkdtempSync(join(tmpdir(), 'fixed-stage-runtime-'));
  const server = createKnowledgeServer({ runtimeDir, anonymousAccess: true });
  // This fixture explicitly awaits composition shutdown before reopening the database.
  server.server.off('close', server.composition.close);
  server.server.listen(0, '127.0.0.1'); await once(server.server, 'listening');
  const address = server.server.address(); assert.ok(address && typeof address !== 'string');
  let c = server.composition;
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q'); writeFileSync(join(root, 'math.h'), 'int add(int a, int b);');
  writeFileSync(join(root, 'math.c'), '#include "math.h"\n/* PINNED_REFERENCE */\nint add(int a,int b){return a+b;}'); git('add', '.'); git('commit', '-qm', 'Fixed source');
  let referenceRuns = 0, generatedRuns = 0, interrupt = false;
  const install = () => {
    c.apps.nativeEvaluation.dependencies.snapshot = async (language, build) => ({ schemaVersion: 'native-toolchain-v1', language, build, architecture: 'fixture', files: [], digest: sha256('fixed-fixture-toolchain') });
    const native = new NativeCaseExecutor(new NativeToolchain());
    c.apps.nativeEvaluation.dependencies.runner = { execute: async (input, contract, sample, signal) => {
      if (input.files.some(file => file.content.includes('PINNED_REFERENCE'))) referenceRuns++;
      else { generatedRuns++; if (interrupt && sample.caseId === 'second') throw new Error('WORKBENCH_RESOURCE_INSUFFICIENT'); }
      return native.execute(input, contract, sample, signal);
    } };
  };
  try {
    install(); const project = await c.apps.workbenchProjects.create({ directory: root, moduleIds: ['math'] });
    const api = await new NativeToolchain().publicInterface({ language: 'c', build: project.build, files: [{ path: 'math.h', content: 'int add(int a,int b);' }, { path: 'math.c', content: '#include "math.h"\nint add(int a,int b){return a+b;}' }], entryPath: apiSource });
    const interfaceRef = await c.artifacts.put(Buffer.from(JSON.stringify(api)), 'application/json');
    const candidate = await c.apps.flywheel.ingestCandidate({ moduleId: 'math', title: 'Sum', description: 'sum', body: '# Sum\n## Behavior\nReturn the sum.', provenance: [{ path: 'math.c', commit: project.commit, pinned: true }], metadata: { cardId: 'card-math', projectSnapshotId: project.snapshotId, language: 'c', sourceModule: 'math', repositoryId: project.repositoryId, interfaceRef } });
    const codeRef = await c.artifacts.put(Buffer.from(JSON.stringify({ files: [{ path: 'math.h', content: 'int add(int a,int b);' }, { path: 'math.c', content: '#include "math.h"\nint add(int a,int b){return a+b;}' }] })), 'application/json');
    // Controlled handoff fixture only; no claim that a real model produced this task.
    const parent = c.apps.workbenchStages.store.insert(createStageTask({ projectId: project.projectId, stage: 'FLYWHEEL', sourceRevision: project.commit, sourceDigest: project.sourceDigest, configurationDigest: sha256('fixture'), cardVersionIds: [candidate.version.versionId], parameters: { snapshotId: project.snapshotId } }, {}, new Date().toISOString()));
    const claim = c.apps.workbenchStages.store.claim(parent.taskId)!;
    c.apps.workbenchStages.store.finish(parent.taskId, claim.leaseId, 'SUCCEEDED', { artifactRefs: [codeRef, interfaceRef], summary: { modules: json([{ moduleId: 'math', language: 'c', cardVersionIds: parent.input.cardVersionIds, codeRef, interfaceRef }]) } }, null);
    const suite: NativeBehaviorSuite = { schemaVersion: 'native-cases-v1', cases: ['first', 'second'].map(caseId => ({ caseId, description: 'fixed sum', sections: ['fixed-interface#add'], variables: [], calls: [{ function: 'add', arguments: [{ integer: '3' }, { integer: '4' }], result: 'sum' }], observations: [{ name: 'sum', kind: 'integer', read: { variable: 'sum' } }], expected: { sum: '9' } })) };
    await assert.rejects(c.apps.workbenchFixedEvaluation.start(parent.taskId, []), /FIXED_MODULE_COVERAGE_INVALID/);
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/fixed-evaluations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reconstructionTaskId: parent.taskId, suites: [{ moduleId: 'math', suite }] }) });
    assert.equal(response.status, 202); const bad = (await response.json()).task;
    const rejected = await c.apps.workbenchStages.wait(bad.taskId);
    assert.equal(rejected.status, 'SUCCEEDED', rejected.reasonCode ?? '');
    assert.equal((rejected.result!.summary.modules as Array<{ status: string }>)[0]!.status, 'REFERENCE_REJECTED'); assert.equal(generatedRuns, 0);
    suite.cases.forEach(sample => sample.expected.sum = '7'); interrupt = true;
    const fixed = await c.apps.workbenchFixedEvaluation.start(parent.taskId, [{ moduleId: 'math', suite }]);
    assert.notEqual(fixed.taskId, bad.taskId);
    const paused = await c.apps.workbenchStages.wait(fixed.taskId); assert.equal(paused.status, 'PAUSED', paused.reasonCode ?? '');
    const previousReferenceRuns = referenceRuns; const previousGeneratedRuns = generatedRuns;
    await new Promise<void>(resolve => server.server.close(() => resolve()));
    await c.close(); c = createComposition({ runtimeDir }); interrupt = false; install();
    c.apps.workbenchStages.resume(fixed.taskId, fixed.inputDigest);
    const completed = await c.apps.workbenchStages.wait(fixed.taskId);
    assert.equal(completed.status, 'SUCCEEDED', completed.reasonCode ?? '');
    assert.equal((completed.result!.summary.modules as Array<{ status: string }>)[0]!.status, 'FIXED_PASSED');
    assert.equal(referenceRuns, previousReferenceRuns); assert.equal(generatedRuns, previousGeneratedRuns + 1);
    assert.equal(completed.usage.modelCalls, 0); assert.equal(completed.result!.summary.publicationVerified, false);
    assert.equal((await c.apps.workbenchFixedEvaluation.start(parent.taskId, [{ moduleId: 'math', suite }])).taskId, fixed.taskId);
  } finally { server.server.closeAllConnections(); if (server.server.listening) await new Promise<void>(resolve => server.server.close(() => resolve())); await c.close(); rmSync(root, { recursive: true, force: true }); rmSync(runtimeDir, { recursive: true, force: true }); }
});
