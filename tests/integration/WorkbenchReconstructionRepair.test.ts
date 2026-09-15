/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证原生编译拒绝及旧诊断迁移可在原任务预算内修复生成代码。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createComposition } from '../../src/interfaces/runner/Composition.ts';
import { sha256 } from '../../src/domain/Domain.ts';
import { assertModelOutput } from '../../src/infrastructure/agentAdapters/ModelExecution.ts';
import { NativeToolchain } from '../../src/infrastructure/evaluation/project/NativeToolchain.ts';
import { canRepairNativeCode } from '../../src/domain/evaluation/NativeCodeRepair.ts';

test('resource failures cannot authorize new generated code', () => {
  const diagnostic = { exitCode: 1, timedOut: false, outputLimitExceeded: false, stderr: 'unknown type name' };
  assert.equal(canRepairNativeCode('NATIVE_INTERFACE_COMPILE_FAILED', diagnostic), true);
  for (const changed of [{ timedOut: true }, { outputLimitExceeded: true }, { exitCode: null }, { stderr: 'File too large' }, { stderr: 'Killed signal terminated program cc1plus' }]) {
    assert.equal(canRepairNativeCode('NATIVE_INTERFACE_COMPILE_FAILED', { ...diagnostic, ...changed }), false);
  }
  assert.equal(canRepairNativeCode('NATIVE_AST_AMBIGUOUS', diagnostic), false);
});

for (const legacy of [false, true]) test(`generated compiler rejection repairs within original task and budget (legacy progress=${legacy})`, async () => {
  const root = mkdtempSync(join(tmpdir(), 'repair-source-')), runtimeDir = mkdtempSync(join(tmpdir(), 'repair-runtime-'));
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], { cwd: root });
  git('init', '-q'); writeFileSync(join(root, 'math.h'), 'int add(int a, int b);');
  writeFileSync(join(root, 'math.c'), '#include "math.h"\n/* HIDDEN_REFERENCE_BODY */\nint add(int a, int b){return a+b;}');
  git('add', '.'); git('commit', '-qm', 'Fixed reference');
  let composition = createComposition({ runtimeDir }); let calls = 0;
  const install = () => {
    const deps = composition.apps.workbenchReconstruction.dependencies;
    deps.snapshot = async (language, build) => ({ schemaVersion: 'native-toolchain-v1', language, build, architecture: 'test', files: [], digest: sha256('stable-tools') });
    deps.roles.dependencies.model = (_command, _configuration, usage) => ({ assertOutput: assertModelOutput, execute: async (request) => {
      calls++; usage(`code-${calls}`, 11); assert.deepEqual(request.readablePaths, []); assert.doesNotMatch(request.prompt, /HIDDEN_REFERENCE_BODY|return a\+b/);
      if (calls > 1) { assert.match(request.prompt, /MISSING_API/); assert.match(request.prompt, /unknown type name/); }
      return { files: [{ path: 'math.h', content: `${calls === 1 ? 'MISSING_API ' : ''}int add(int left, int right);` },
        { path: 'math.c', content: '#include "math.h"\nint add(int left,int right){return left+right;}' }] };
    } });
  };
  try {
    install(); const project = await composition.apps.workbenchProjects.create({ directory: root, moduleIds: ['math'] });
    const api = await new NativeToolchain().publicInterface({ language: 'c', build: project.build, entryPath: 'math.h', files: [{ path: 'math.h', content: 'int add(int a,int b);' }] });
    const interfaceRef = await composition.artifacts.put(Buffer.from(JSON.stringify(api)), 'application/json');
    const card = await composition.apps.flywheel.ingestCandidate({ moduleId: 'unit-add', title: 'Addition', description: 'Representable sum',
      body: '# Addition\n## Behavior\nAdd the two representable integers.', provenance: [{ path: 'math.c', commit: project.commit, pinned: true }],
      metadata: { cardId: 'card-add', projectSnapshotId: project.snapshotId, repositoryId: project.repositoryId, sourceModule: 'math', language: 'c', interfaceRef } });
    const started = await composition.apps.workbenchReconstruction.start(project.snapshotId, [card.version.versionId]);
    const failed = await composition.apps.workbenchStages.wait(started.taskId);
    assert.equal(failed.reasonCode, 'NATIVE_INTERFACE_COMPILE_FAILED'); assert.equal(calls, 1);
    const rejection = composition.apps.workbenchStages.store.checkpoints(started.taskId).find((item) => item.key === 'code-rejection:math:0')!;
    assert.ok(await composition.apps.workbenchReconstruction.artifact(started.taskId, rejection.result.artifactRefs[1]!.sha256));
    await composition.close();
    if (legacy) { const db = new DatabaseSync(join(runtimeDir, 'workbench.sqlite')); db.prepare("DELETE FROM wb_stage_checkpoints WHERE task_id=? AND step_key='code-rejection:math:0'").run(started.taskId); db.close(); }
    composition = createComposition({ runtimeDir }); install();
    composition.apps.workbenchStages.resume(started.taskId, started.inputDigest);
    const repaired = await composition.apps.workbenchStages.wait(started.taskId);
    assert.equal(repaired.status, 'SUCCEEDED', repaired.reasonCode ?? ''); assert.equal(calls, 2);
    assert.equal(repaired.taskId, started.taskId); assert.equal(repaired.usage.modelCalls, 2); assert.equal(repaired.usage.tokens, 22);
    assert.equal(composition.apps.workbenchStages.store.checkpoints(started.taskId).filter((item) => item.key.startsWith('role:code:')).length, 2);
    assert.equal((await composition.apps.workbenchReconstruction.start(project.snapshotId, [card.version.versionId])).taskId, started.taskId);
  } finally { await composition.close(); rmSync(root, { recursive: true, force: true }); rmSync(runtimeDir, { recursive: true, force: true }); }
});
