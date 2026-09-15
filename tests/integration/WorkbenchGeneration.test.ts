/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证固定C源码经真实角色生成多卡片、恢复、索引和版本分组。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createComposition } from '../../src/interfaces/runner/Composition.ts';
import { assertModelOutput } from '../../src/infrastructure/agentAdapters/ModelExecution.ts';

test('generation commits each C card before interruption, resumes frozen role journals and indexes readable unassessed versions', async () => {
  const root = mkdtempSync(join(tmpdir(), 'generation-source-')); const runtimeDir = mkdtempSync(join(tmpdir(), 'generation-runtime-'));
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q');
  writeFileSync(join(root, 'math.h'), 'int add(int a, int b);\nint sub(int a, int b);\n');
  writeFileSync(join(root, 'math.c'), '#include "math.h"\nint add(int a,int b){return a+b;}\nint sub(int a,int b){return a-b;}\n');
  git('add', '.'); git('commit', '-qm', 'Fixed arithmetic');
  let composition = createComposition({ runtimeDir }); let calls = 0; let fail = true;
  const install = () => { composition.apps.workbenchGeneration.dependencies.model = (_command, _configuration, usage) => ({
    assertOutput: assertModelOutput,
    execute: async (request) => {
      calls++; usage(`test-${calls}`, 11);
      assert.deepEqual(request.readablePaths, []); assert.match(request.prompt, /return a\+b/);
      if (calls >= 4 && fail) throw new Error('PROVIDER_QUOTA_EXHAUSTED');
      const title = 'Arithmetic contract'; const description = 'Integer arithmetic with explicit limits.';
      if (request.stage?.startsWith('outline')) return { title, description, sections: [{ heading: 'Contract', purpose: 'Interfaces and boundaries' }] };
      return { title, description, sections: [{ sectionId: 'section-1', body: 'The public interface accepts two signed integer arguments and returns a signed integer. The source supplies arithmetic operations. Callers must keep the result representable; overflow is outside this contract. Evidence comes from the fixed source files. Behavior tests have not been executed, and this document does not claim publication approval.' }] };
    },
  }); };
  try {
    install();
    const project = await composition.apps.workbenchProjects.create({ directory: root, moduleIds: ['math'] });
    const task = await composition.apps.workbenchGeneration.start(project.snapshotId);
    const first = await composition.apps.workbenchStages.wait(task.taskId, AbortSignal.timeout(30000));
    assert.equal(first.status, 'PAUSED', first.reasonCode ?? ''); assert.equal(calls, 4);
    assert.equal(composition.apps.workbenchStages.store.checkpoints(task.taskId).filter((entry) => entry.key.startsWith('card:')).length, 1);
    assert.equal(first.usage.modelCalls, 4); assert.equal(first.usage.tokens, 44);
    await composition.close(); composition = createComposition({ runtimeDir }); install();
    composition.apps.workbenchStages.resume(task.taskId, task.inputDigest);
    const stillPaused = await composition.apps.workbenchStages.wait(task.taskId, AbortSignal.timeout(30000));
    assert.equal(stillPaused.status, 'PAUSED'); assert.equal(stillPaused.usage.modelCalls, 5);
    fail = false;
    composition.apps.workbenchStages.resume(task.taskId, task.inputDigest);
    const done = await composition.apps.workbenchStages.wait(task.taskId, AbortSignal.timeout(30000));
    assert.equal(done.status, 'SUCCEEDED', done.reasonCode ?? ''); assert.equal(calls, 6, 'only the interrupted body needs another model request');
    assert.equal(done.usage.modelCalls, 6); assert.equal(done.usage.tokens, 66);
    assert.equal(done.result?.summary.generated, 2); assert.equal(done.result?.summary.evaluated, false);
    const replay = await composition.apps.workbenchGeneration.start(project.snapshotId);
    assert.equal(replay.taskId, task.taskId); assert.equal(calls, 6);
    const indexed = composition.apps.workbenchStages.start(composition.apps.knowledgeIndex.prepare());
    assert.equal((await composition.apps.workbenchStages.wait(indexed.taskId)).status, 'SUCCEEDED');
    assert.equal(composition.apps.knowledgeIndex.search('').total, 2);
    writeFileSync(join(root, 'math.c'), '#include "math.h"\nint add(int a,int b){return a+b;}\nint sub(int a,int b){return a-b;}\n/* new source version */\n');
    git('add', '.'); git('commit', '-qm', 'Changed source');
    const next = await composition.apps.workbenchProjects.create({ directory: root, moduleIds: ['math'] });
    const revised = await composition.apps.workbenchGeneration.start(next.snapshotId);
    const final = await composition.apps.workbenchStages.wait(revised.taskId, AbortSignal.timeout(30000));
    assert.equal(final.status, 'SUCCEEDED', final.reasonCode ?? '');
    assert.notEqual(revised.taskId, task.taskId); assert.equal(calls, 10);
    assert.equal(composition.apps.knowledgeIndex.search('').stale, 2);
    const oldCards = done.result!.summary.cards as Array<{ cardId: string; versionId: string }>;
    const newCards = final.result!.summary.cards as Array<{ cardId: string; versionId: string }>;
    assert.deepEqual(oldCards.map((card) => card.cardId), newCards.map((card) => card.cardId));
    assert.ok(oldCards.every((card, index) => card.versionId !== newCards[index]!.versionId));
  } finally { await composition.close(); rmSync(root, { recursive: true, force: true }); rmSync(runtimeDir, { recursive: true, force: true }); }
});
