/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证固定用例子任务在一键流程中的冻结、拒绝、重启与复用。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPublication, type PublicationRecord } from '../../src/domain/services/workbench/WorkbenchPublicationRecord.ts';
import { WorkbenchPipelines } from '../../src/application/services/WorkbenchPipelines.ts';
import { WorkbenchStages } from '../../src/application/services/WorkbenchStages.ts';
import { SqliteStageTasks } from '../../src/infrastructure/sqlite/SqliteStageTasks.ts';
import { SqliteWorkbenchPipelines } from '../../src/infrastructure/sqlite/SqliteWorkbenchPipelines.ts';
import { LocalCasArtifactStore } from '../../src/infrastructure/sqlite/SqliteCas.ts';
import { FIXED_EVALUATION_CONTRACT } from '../../src/domain/services/evaluation/NativeFixedEvaluation.ts';
import type { NativeBehaviorSuite } from '../../src/domain/services/evaluation/NativeBehaviorSuite.ts';
import { canonicalJson, type StageInput, type StageResult, type JsonValue } from '../../src/domain/services/workbench/StageTask.ts';
import { sourceInput, sourceResult } from '../helpers/WorkbenchSourceFixture.ts';
test('fixed pipeline pauses before source on failed fixed cases, resumes the same child and freezes changed suites separately', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'fixed-pipeline-')); const db = join(directory, 'workbench.sqlite');
  const artifacts = new LocalCasArtifactStore(join(directory, 'cas'));
  let publicationCalls = 0; let publication: PublicationRecord | null = null;
  let fixedCalls = 0, codeCalls = 0, sourceCalls = 0, interrupted = false;
  const initial: StageInput = { projectId: 'project', sourceRevision: 'fixed', sourceDigest: 'source', configurationDigest: 'config', stage: 'GENERATE', cardVersionIds: [], parameters: { snapshotId: 'snapshot' } };
  const open = () => {
    const store = new SqliteWorkbenchPipelines(db), stageStore = new SqliteStageTasks(db);
    const stages = new WorkbenchStages(stageStore, {
      GENERATE: async () => ({ artifactRefs: [], summary: { cards: [{ versionId: 'v1' }] } }),
      INDEX: async () => ({ artifactRefs: [], summary: { failed: 0 } }),
      FLYWHEEL: async () => { codeCalls++; return { artifactRefs: [], summary: { modules: [{ moduleId: 'parser', interfaceComparison: { compatible: true } }] } }; },
      EVALUATE: async (context): Promise<StageResult> => {
        const p = context.task.input.parameters;
        if (p.operation === 'KNOWLEDGE_SOURCE_VERIFICATION') { sourceCalls++; return sourceResult(context.task.input); }
        if (p.operation !== 'FIXED_NATIVE_EVALUATION') return { artifactRefs: [], summary: { requestedModules: 1, completedModules: 1, modules: [{ moduleId: 'parser', status: 'BEHAVIOR_PASSED', interfaceCompatible: true }] } };
        fixedCalls++;
        if (!interrupted) { interrupted = true; throw new Error('WORKBENCH_RESOURCE_INSUFFICIENT'); }
        const ref = (p.suiteRefs as any).parser;
        const suite = JSON.parse(Buffer.from(await artifacts.get(ref)).toString('utf8'));
        const passed = suite.cases[0].expected.value === '1';
        return { artifactRefs: [ref], summary: { reconstructionTaskId: p.reconstructionTaskId!, publicationVerified: false,
          modules: [{ moduleId: 'parser', status: passed ? 'FIXED_PASSED' : 'FIXED_FAILED', referencePassed: true, interfaceCompatible: true, passed: passed ? 1 : 0, total: 1 }] } };
      },
      ASSOCIATE: async () => ({ artifactRefs: [], summary: { relations: 0 } }),
    });
    const app = new WorkbenchPipelines({ publications: {
      get: id => { assert.equal(id, publication?.publicationId); return publication!; },
      publishFromTasks: async ids => {
        publicationCalls++;
        assert.equal(stages.get(ids.fixedEvaluation).input.parameters.reconstructionTaskId, ids.reconstruction);
        assert.equal(stages.get(ids.sourceVerification).input.parameters.evaluationTaskId, ids.evaluation);
        assert.equal(stages.get(ids.sourceVerification).status, 'SUCCEEDED');
        if (!publication) {
          const ref = await artifacts.put(Buffer.from('published fixture'), 'application/json');
          publication = { ...createPublication({ projectId: 'project', versionIds: ['v1'], preparationRef: ref, files: [{ path: 'manifest.json', ref }] }, new Date().toISOString()), status: 'COMMITTED' };
          throw new Error('PUBLICATION_SIMULATED_RESPONSE_LOSS');
        }
        return publication;
      }
    }, artifacts, store, stages, materials: { get: () => null }, environment: async () => 'environment',
      generation: { prepare: async () => initial }, index: { prepare: ids => ({ ...initial, stage: 'INDEX', cardVersionIds: ids ?? [] }) },
      reconstruction: { prepare: async (_snapshot, ids) => ({ ...initial, stage: 'FLYWHEEL', cardVersionIds: ids ?? [] }) },
      evaluation: { prepare: async id => ({ ...stages.get(id).input, stage: 'EVALUATE' }) }, sourceVerification: { prepare: async id => sourceInput(stages.get(id)) },
      fixedEvaluation: { prepare: async (id, suites) => {
        assert.deepEqual(suites.map(item => item.moduleId), ['parser']);
        const ref = await artifacts.put(Buffer.from(canonicalJson(suites[0]!.suite)), 'application/json');
        return { ...stages.get(id).input, stage: 'EVALUATE', parameters: { ...stages.get(id).input.parameters,
          operation: 'FIXED_NATIVE_EVALUATION', fixedEvaluationContract: FIXED_EVALUATION_CONTRACT, reconstructionTaskId: id, suiteRefs: { parser: ref } as unknown as JsonValue } };
      } }, associations: { prepare: ids => ({ ...initial, stage: 'ASSOCIATE', cardVersionIds: ids ?? [] }) } });
    return { app, stages, close: async () => { await app.shutdown(); await stages.shutdown(); store.close(); stageStore.close(); } };
  };
  let runtime = open();
  const suite: NativeBehaviorSuite = { schemaVersion: 'native-cases-v1', cases: [{ caseId: 'fixed', description: 'fixed', sections: ['parser#Behavior'], variables: [],
    calls: [{ function: 'parse', arguments: [], result: 'value' }], observations: [{ name: 'value', kind: 'integer', read: { variable: 'value' } }], expected: { value: '2' } }] };
  try {
    const pending = runtime.app.start('snapshot', {}, [], [{ moduleId: 'parser', suite }]); suite.cases[0]!.expected.value = '1';
    const first = await pending; const failed = await runtime.app.wait(first.pipelineId);
    assert.equal(failed.reasonCode, 'WORKBENCH_RESOURCE_INSUFFICIENT'); assert.equal(sourceCalls, 0);
    const child = failed.iterations![0]!.fixedEvaluation!; assert.ok(runtime.app.detail(first.pipelineId).tasks.some(task => task.taskId === child.taskId));
    await runtime.close(); runtime = open(); runtime.app.resume(first.pipelineId, first.inputDigest);
    const rejected = await runtime.app.wait(first.pipelineId);
    assert.equal(rejected.reasonCode, 'PIPELINE_FIXED_FAILED'); assert.equal(sourceCalls, 0); assert.equal(rejected.currentStage, 'EVALUATE');
    assert.equal(rejected.iterations![0]!.fixedEvaluation!.taskId, child.taskId);
    runtime.app.resume(first.pipelineId, first.inputDigest); await runtime.app.wait(first.pipelineId); assert.equal(fixedCalls, 2);
    const corrected = await runtime.app.start('snapshot', {}, [], [{ moduleId: 'parser', suite }]);
    assert.notEqual(corrected.pipelineId, first.pipelineId);
    const lost = await runtime.app.wait(corrected.pipelineId);
    assert.equal(lost.reasonCode, 'PUBLICATION_SIMULATED_RESPONSE_LOSS'); assert.equal(lost.status, 'PAUSED');
    assert.ok(lost.completed.includes('ASSOCIATE')); assert.equal(publicationCalls, 1);
    await runtime.close(); runtime = open(); runtime.app.resume(corrected.pipelineId, corrected.inputDigest);
    const completed = await runtime.app.wait(corrected.pipelineId); assert.equal(completed.status, 'SUCCEEDED');
    assert.equal(completed.publicationId, publication!.publicationId); assert.equal(publicationCalls, 2);
    assert.equal(codeCalls, 1); assert.equal(sourceCalls, 1); assert.equal(fixedCalls, 3);
    assert.equal((await runtime.app.start('snapshot', {}, [], [{ moduleId: 'parser', suite }])).pipelineId, corrected.pipelineId);
    assert.equal(runtime.app.detail(corrected.pipelineId).publicationVerified, true);
    const original = JSON.parse(Buffer.from(await artifacts.get(first.fixedSuites![0]!.suiteRef)).toString('utf8'));
    assert.equal(original.cases[0].expected.value, '2', 'new selection does not rewrite old fixed expectations');
  } finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
});
