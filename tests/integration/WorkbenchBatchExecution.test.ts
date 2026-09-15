/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证批次应用的模块范围、并发队列与取消，不调用模型。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorkbenchBatches } from '../../src/application/services/WorkbenchBatches.ts';
import { SqliteWorkbenchBatches } from '../../src/infrastructure/sqlite/SqliteWorkbenchBatches.ts';
import { SqliteWorkbenchProjects } from '../../src/infrastructure/sqlite/SqliteWorkbenchProjects.ts';
import { createProjectSnapshot } from '../../src/domain/workbench/WorkbenchProject.ts';
import { batchExecution } from '../../src/domain/workbench/WorkbenchBatch.ts';
import { createPipeline, type WorkbenchPipeline } from '../../src/domain/workbench/WorkbenchPipeline.ts';

const turn = () => new Promise<void>(resolve => setImmediate(resolve));
test('batch execution fixes one module, serializes its queue and preserves cancelled rounds', async () => {
  const root = mkdtempSync(join(tmpdir(), 'batch-execution-')), path = join(root, 'workbench.sqlite');
  const store = new SqliteWorkbenchBatches(path), projects = new SqliteWorkbenchProjects(path);
  let now = '2026-09-14T00:00:00.000Z';
  const ref = { artifactId: `sha256:${'a'.repeat(64)}`, sha256: 'a'.repeat(64), mediaType: 'text/plain', size: 0 };
  const project = projects.save(createProjectSnapshot({ repositoryId: 'repo', directory: '/fixed', commit: 'pinned', sourceDigest: 'source', manifestRef: ref,
    modules: ['parser', 'xml'].map(moduleId => ({ moduleId, language: 'c', sourcePaths: [`${moduleId}.c`], testPaths: [], selectedByDefault: true, reasons: [] })),
    build: { cCompiler: 'gcc', cppCompiler: 'g++', cStandard: 'c11', cppStandard: 'c++17', includeDirectories: [], definitions: [] },
    sourceFiles: ['parser', 'xml'].map(moduleId => ({ path: `${moduleId}.c`, objectId: moduleId, kind: 'source', ref })),
  }, now));
  const received: unknown[] = [];
  const pipelines = new Map<string, WorkbenchPipeline>(), finishers = new Map<string, (value: WorkbenchPipeline) => void>(), calls: string[] = [];
  const app = new WorkbenchBatches({ store, projects, materials: { get: id => id === 'material-fixed' ? {} : null }, clock: () => now, pipelines: {
    start: async (snapshotId, _scopes, _materials, _suites, executionKey) => {
      received.push([_scopes, _materials, _suites]);
      const selected = projects.get(snapshotId)!; assert.equal(selected.modules.length, 1); assert.equal(selected.sourceFiles.length, 1);
      calls.push(selected.modules[0]!.moduleId);
      const pipeline = createPipeline({ projectId: project.projectId, stage: 'GENERATE', sourceRevision: 'pinned', sourceDigest: 'source', configurationDigest: 'config', cardVersionIds: [], parameters: { snapshotId, executionKey: executionKey! } }, now, 'environment');
      pipeline.status = 'RUNNING'; pipelines.set(pipeline.pipelineId, pipeline); return pipeline;
    },
    get: id => pipelines.get(id)!, resume: () => { throw new Error('UNEXPECTED_RESUME'); },
    wait: id => new Promise(resolve => finishers.set(id, resolve)),
    cancel: id => { const pipeline = pipelines.get(id)!; pipeline.status = 'CANCELLED'; finishers.get(id)?.(pipeline); return pipeline; },
  } });
  try {
    const input = { snapshotId: project.snapshotId, moduleId: 'parser', schedule: { enabled: false } };
    const a = app.create(input, 'a'), b = app.create(input, 'b'), c = app.create({ ...input, moduleId: 'xml' }, 'c');
    assert.equal(calls.length, 0);
    app.enqueue(a.batchId, 'start-a'); app.enqueue(b.batchId, 'start-b'); app.enqueue(c.batchId, 'start-c'); await turn();
    assert.deepEqual(calls, ['parser', 'xml']); assert.equal(store.get(b.batchId)!.status, 'QUEUED');
    app.cancel(a.batchId); await turn(); assert.equal(store.get(a.batchId)!.rounds[0]!.status, 'CANCELLED');
    app.tick(); await turn(); assert.deepEqual(calls, ['parser', 'xml', 'parser']);
    for (const batch of [b, c]) {
      const pipelineId = store.get(batch.batchId)!.rounds[0]!.pipelineId!; const pipeline = pipelines.get(pipelineId)!;
      pipeline.status = 'SUCCEEDED'; finishers.get(pipelineId)!(pipeline);
    }
    await turn(); assert.ok(app.idle); assert.equal(store.get(b.batchId)!.status, 'SUCCEEDED');
    assert.equal(app.list(project.projectId).find(item => item.batchId === b.batchId)!.verified, false, 'execution success alone does not verify knowledge');
    assert.equal(app.list(project.projectId).find(item => item.batchId === b.batchId)!.evaluatedVersionCount, 0);
    assert.equal(store.get(a.batchId)!.rounds.length, 1); assert.equal(store.get(a.batchId)!.rounds[0]!.completedAt, now);
    const automatic = app.create({ ...input, schedule: { enabled: true, intervalMinutes: 1 } }, 'automatic'); await turn();
    const finishAutomatic = (status: 'SUCCEEDED' | 'PAUSED') => {
      const id = store.get(automatic.batchId)!.rounds.at(-1)!.pipelineId!, pipeline = pipelines.get(id)!;
      pipeline.status = status; pipeline.reasonCode = status === 'PAUSED' ? 'QUALITY_UNRESOLVED' : null; finishers.get(id)!(pipeline);
    };
    finishAutomatic('SUCCEEDED'); await turn();
    assert.equal(store.get(automatic.batchId)!.nextRunAt, '2026-09-14T00:01:00.000Z');
    now = '2026-09-14T00:00:59.000Z'; app.tick(); await turn(); assert.equal(store.get(automatic.batchId)!.rounds.length, 1);
    now = '2026-09-14T00:01:00.000Z'; app.tick(); await turn(); assert.equal(store.get(automatic.batchId)!.rounds.length, 2);
    finishAutomatic('PAUSED'); await turn();
    now = '2026-09-15T00:00:00.000Z'; app.tick(); await turn();
    assert.equal(store.get(automatic.batchId)!.rounds.length, 2, 'quality pause cannot be bypassed by scheduling another round');
    const execution = batchExecution({ schemaVersion: 'module-execution-v1', scope: { entryPath: 'parser.c', symbols: ['parse'] }, materialIds: ['material-fixed'], fixedSuite: { schemaVersion: 'native-cases-v1', cases: [{ caseId: 'fixed' }] } })!;
    assert.throws(() => app.create({ ...input, execution: { ...execution, materialIds: ['missing'] } }, 'missing-material'), /MATERIAL_NOT_FOUND/);
    const configured = app.create({ ...input, execution }, 'configured');
    const listed = app.list(project.projectId).find(item => item.batchId === configured.batchId)!;
    assert.equal(listed.executionSummary?.fixedCaseCount, 1);
    assert.equal('execution' in listed, false, 'polling summaries do not repeatedly transfer test bodies');
    app.enqueue(configured.batchId, 'configured-round-1'); await turn();
    const expectedInputs = [{ parser: execution.scope }, ['material-fixed'], [{ moduleId: 'parser', suite: execution.fixedSuite }]];
    assert.deepEqual(received.at(-1), expectedInputs);
    const pipelineId = store.get(configured.batchId)!.rounds.at(-1)!.pipelineId!;
    pipelines.get(pipelineId)!.status = 'SUCCEEDED'; finishers.get(pipelineId)!(pipelines.get(pipelineId)!); await turn();
    app.enqueue(configured.batchId, 'configured-round-2'); await turn();
    assert.deepEqual(received.at(-1), expectedInputs, 'later rounds use the same fixed expectations and material versions');
    app.cancel(configured.batchId); await turn();


  } finally { app.stop(); for (const [id, finish] of finishers) finish(pipelines.get(id)!); await app.shutdown(); store.close(); projects.close(); rmSync(root, { recursive: true, force: true }); }
});
