/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证重建只读知识和接口，并在后续检查中断后复用成功模型结果。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStageTask } from '../../src/domain/workbench/StageTask.ts';
import { sha256 } from '../../src/domain/Domain.ts';
import { createComposition } from '../../src/interfaces/runner/Composition.ts';
import { assertModelOutput } from '../../src/infrastructure/agentAdapters/ModelExecution.ts';
import { NativeToolchain } from '../../src/infrastructure/evaluation/project/NativeToolchain.ts';

test('reconstruction freezes card inputs, keeps Code blind and reuses generated code after interface interruption and restart', async () => {
  const root = mkdtempSync(join(tmpdir(), 'reconstruction-source-')); const runtimeDir = mkdtempSync(join(tmpdir(), 'reconstruction-runtime-'));
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q'); writeFileSync(join(root, 'math.h'), 'int add(int a,int b);');
  writeFileSync(join(root, 'math.c'), '#include "math.h"\n/* HIDDEN_REFERENCE_SENTINEL */\nint add(int a,int b){return a+b;}');
  git('add', '.'); git('commit', '-qm', 'Fixed reference');
  let composition = createComposition({ runtimeDir }); let calls = 0; let interrupted = true; let toolDigest = sha256('fixed-native-tools');
  const install = () => {
    const deps = composition.apps.workbenchReconstruction.dependencies;
    deps.snapshot = async (language, build) => ({ schemaVersion: 'native-toolchain-v1', language, build, architecture: 'test', files: [], digest: toolDigest });
    deps.roles.dependencies.model = (_command, _configuration, usage) => ({ assertOutput: assertModelOutput, execute: async (request) => {
      calls++; usage(`code-${calls}`, 7); assert.equal(request.role, 'code'); assert.deepEqual(request.readablePaths, []);
      assert.doesNotMatch(request.prompt, /HIDDEN_REFERENCE_SENTINEL|return a\+b|oracle|expected/);
      assert.match(request.prompt, /The sum of the two arguments/);
      return { files: [{ path: 'math.h', content: 'int add(int left,int right);' }, { path: 'math.c', content: '#include "math.h"\nint add(int left,int right){return left+right;}' }] };
    } });
    const native = new NativeToolchain();
    deps.native = { compileAndRun: (...args) => native.compileAndRun(...args), publicInterface: async (...args) => {
      if (interrupted) throw new Error('WORKBENCH_RESOURCE_MEMORY');
      return native.publicInterface(...args);
    } };
  };
  try {
    install(); const project = await composition.apps.workbenchProjects.create({ directory: root, moduleIds: ['math'] });
    const api = await new NativeToolchain().publicInterface({ language: 'c', build: project.build, entryPath: 'math.h', files: [{ path: 'math.h', content: 'int add(int a,int b);' }] });
    const interfaceRef = await composition.artifacts.put(Buffer.from(JSON.stringify(api)), 'application/json');
    const candidate = await composition.apps.flywheel.ingestCandidate({ moduleId: 'unit-add', title: 'Addition', description: 'Representable addition',
      body: '# Addition\n## Behavior\nThe sum of the two arguments is returned. Inputs and result must be representable signed integers.',
      provenance: [{ path: 'math.c', commit: project.commit, pinned: true }], metadata: { cardId: 'card-add', language: 'c',
        sourceModule: 'math', projectSnapshotId: project.snapshotId, repositoryId: project.repositoryId, interfaceRef } });
    const task = await composition.apps.workbenchReconstruction.start(project.snapshotId, [candidate.version.versionId]);
    const paused = await composition.apps.workbenchStages.wait(task.taskId, AbortSignal.timeout(30000));
    assert.equal(paused.status, 'PAUSED', paused.reasonCode ?? ''); assert.equal(calls, 1); assert.equal(paused.usage.modelCalls, 1); assert.equal(paused.usage.tokens, 7);
    assert.equal(composition.apps.workbenchStages.store.checkpoints(task.taskId).filter((item) => item.key.startsWith('role:code:')).length, 1);
    await composition.close(); composition = createComposition({ runtimeDir }); install(); interrupted = false;
    composition.apps.workbenchStages.resume(task.taskId, task.inputDigest);
    const done = await composition.apps.workbenchStages.wait(task.taskId, AbortSignal.timeout(30000));
    assert.equal(done.status, 'SUCCEEDED', done.reasonCode ?? ''); assert.equal(calls, 1); assert.equal(done.usage.modelCalls, 1);
    const modules = done.result!.summary.modules as Array<{ interfaceComparison: { compatible: boolean }; behaviorVerified: boolean; codeRef: { sha256: string } }>;
    assert.equal(modules[0]?.interfaceComparison.compatible, true, JSON.stringify(modules)); assert.equal(modules[0]?.behaviorVerified, false);
    assert.ok(await composition.apps.workbenchReconstruction.artifact(task.taskId, modules[0]!.codeRef.sha256));
    assert.equal(await composition.apps.workbenchReconstruction.artifact(task.taskId, candidate.version.bodyRef.sha256), null, 'task download cannot read unrelated CAS bodies');
    assert.equal((await composition.apps.workbenchReconstruction.start(project.snapshotId, [candidate.version.versionId])).taskId, task.taskId);
    const comparison = (done.result!.summary.modules as Array<{ sourceComparison: { requested: number; compared: number; knowledgeErrorProven: boolean } }>)[0]!.sourceComparison;
    assert.equal(comparison.requested, 1); assert.equal(comparison.compared, 1); assert.equal(comparison.knowledgeErrorProven, false);
    const store = composition.apps.workbenchStages.store;
    const checkpoint = store.checkpoint.bind(store); let failCache = true;
    store.checkpoint = (...args) => { if (args[2] === 'code-cache:math' && failCache) { failCache = false; throw new Error('TEST_CACHE_COMMIT_INTERRUPTED'); } return checkpoint(...args); };
    const upgraded = composition.apps.workbenchStages.start(done.input, { modelCalls: 100 });
    const failedCache = await composition.apps.workbenchStages.wait(upgraded.taskId);
    assert.equal(failedCache.reasonCode, 'TEST_CACHE_COMMIT_INTERRUPTED');
    assert.equal(failedCache.usage.modelCalls, done.usage.modelCalls); assert.equal(failedCache.usage.tokens, done.usage.tokens);
    store.checkpoint = checkpoint;
    composition.apps.workbenchStages.resume(upgraded.taskId, upgraded.inputDigest);
    const reused = await composition.apps.workbenchStages.wait(upgraded.taskId);
    assert.equal(reused.status, 'SUCCEEDED', reused.reasonCode ?? ''); assert.equal(calls, 1);
    assert.equal(reused.usage.modelCalls, done.usage.modelCalls, 'inherited usage is idempotent across attempt boundaries');
    assert.equal(reused.usage.tokens, done.usage.tokens);
    assert.equal((reused.result!.summary.modules as Array<{ codeReusedFrom: string }>)[0]?.codeReusedFrom, done.taskId);
    const legacyInput = structuredClone(done.input); delete legacyInput.parameters.comparisonContract;
    const legacy = store.insert(createStageTask(legacyInput, {}, new Date().toISOString()));
    assert.throws(() => composition.apps.workbenchStages.start(legacyInput), /STAGE_CONTRACT_INCOMPATIBLE/);
    assert.throws(() => composition.apps.workbenchStages.resume(legacy.taskId, legacy.inputDigest), /STAGE_CONTRACT_INCOMPATIBLE/);
    composition.apps.workbenchStages.recover();
    assert.equal(store.get(legacy.taskId)?.status, 'PENDING', 'legacy execution is not silently migrated or started');

    toolDigest = sha256('changed-native-tools');
    const changed = await composition.apps.workbenchReconstruction.start(project.snapshotId, [candidate.version.versionId]);
    assert.notEqual(changed.taskId, task.taskId);
    assert.equal((await composition.apps.workbenchStages.wait(changed.taskId)).status, 'SUCCEEDED'); assert.equal(calls, 2);
    await assert.rejects(composition.apps.workbenchReconstruction.start(project.snapshotId, ['unknown']), /RECONSTRUCTION_SELECTION_INVALID/);
  } finally { await composition.close(); rmSync(root, { recursive: true, force: true }); rmSync(runtimeDir, { recursive: true, force: true }); }
});
