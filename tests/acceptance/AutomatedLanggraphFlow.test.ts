/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证AutomatedLanggraphFlow的行为、约束及失败场景。
 */
import { ConcurrentTasks } from '../../src/infrastructure/agentAdapters/ConcurrentTasks.ts';
import { NODE_BY_AGENT } from '../../src/domain/workflow/AgentDefinitions.ts';
import { FixtureProjectWorkflowStages, type FixtureProjectScenario } from '../../src/infrastructure/agentAdapters/scenario/ProjectWorkflowFixture.ts';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  AutomatedProjectWorkflowService,
} from '../../src/application/services/ApplicationServices.ts';
import { TrustedProjectEvaluator } from '../../src/infrastructure/evaluation/project/TrustedProjectEvaluator.ts';
import { JsonSchemaAgentContractValidator } from '../../src/infrastructure/agentAdapters/contracts/JsonSchemaAgentContractValidator.ts';
import { createDomainKnowledgeInfrastructure } from '../../src/infrastructure/langgraph/LangGraph.ts';
import { createComposition } from '../../src/interfaces/runner/Composition.ts';
import { GOOD_BODY } from '../helpers/Fixture.ts';

function git(root: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

for (const [moduleId, layout, testName] of [['formatter', 'lib', 'format.test.js'], ['normalizer', 'components/nested', 'normalize.test.js']]) {
test(`generic ${moduleId} scenario runs all LangGraph nodes and independent test commands`, async () => {
  const repositoryRoot = mkdtempSync(join(tmpdir(), 'wp-automated-source-'));
  const assetRoot = mkdtempSync(join(tmpdir(), 'wp-automated-assets-'));
  const runtimeDir = mkdtempSync(join(tmpdir(), 'wp-automated-runtime-'));
  mkdirSync(join(repositoryRoot, layout), { recursive: true });
  writeFileSync(join(repositoryRoot, 'package.json'), '{"name":"automated-source","type":"module"}\n');
  writeFileSync(join(repositoryRoot, layout, 'contract.js'), 'export const expected = 4;\n');
  writeFileSync(join(repositoryRoot, layout, 'module.js'), 'export const calculate = () => 4;\n');
  writeFileSync(join(repositoryRoot, layout, testName), `
import assert from 'node:assert/strict';
import test from 'node:test';
import { expected } from './contract.js';
import { calculate } from './module.js';
test('generated result matches contract', () => assert.equal(calculate(), expected));
`.trimStart());
  writeFileSync(join(assetRoot, 'knowledge-v1.md'), `${GOOD_BODY}\n\n## 行为契约\n\n第一轮没有固定精确结果。`);
  writeFileSync(join(assetRoot, 'knowledge-v2.md'), `${GOOD_BODY}\n\n## 行为契约\n\n修订后必须返回公开契约固定的数值 4。`);
  writeFileSync(join(assetRoot, 'code-v1.js'), 'export const calculate = () => 3;\n');
  writeFileSync(join(assetRoot, 'code-v2.js'), 'export const calculate = () => 4;\n');
  writeFileSync(join(assetRoot, 'correction.json'), JSON.stringify({
    correctionId: 'COR-AUTO-001', knowledgePath: '行为契约',
    criterion: '返回公开契约值 4', risk: '生成实现无法通过门禁',
  }));
  git(repositoryRoot, ['init']);
  git(repositoryRoot, ['config', 'user.email', 'acceptance@example.invalid']);
  git(repositoryRoot, ['config', 'user.name', 'Acceptance Fixture']);
  git(repositoryRoot, ['add', '.']);
  git(repositoryRoot, ['commit', '-m', 'fixture']);
  const commit = git(repositoryRoot, ['rev-parse', 'HEAD']);

  const composition = createComposition({ runtimeDir });
  try {
    composition.agents.updatePromptAddon('doc-gen', '先写清行为边界。');
    const executor = new FixtureProjectWorkflowStages({
      workerRuntime: { prompts: composition.runConfiguration, observer: composition.workflowObserver, tasks: new ConcurrentTasks() },
      nodeByAgent: NODE_BY_AGENT,
      flywheel: composition.apps.flywheel,
      evalRunner: composition.apps.evalRunner,
      evaluator: new TrustedProjectEvaluator(composition.artifacts),
      assetRoot,
      contracts: new JsonSchemaAgentContractValidator(join(process.cwd(), 'docs', 'specs', 'schemas')),
    });
    const infrastructure = await createDomainKnowledgeInfrastructure({
      executor,
      observer: composition.workflowObserver,
      prompts: { getPromptAddon: (agentId) => composition.agents.getPromptAddon(agentId) },
      checkpoint: { kind: 'memory' },
    });
    const workflow = new AutomatedProjectWorkflowService(
      composition.service,
      infrastructure.engine,
      composition.runConfiguration,
    );
    const observedPolicies: Parameters<typeof composition.service.recordEvaluation>[1][] = [];
    const recordEvaluation = composition.service.recordEvaluation.bind(composition.service);
    composition.service.recordEvaluation = async (evaluation, policy) => {
      observedPolicies.push(structuredClone(policy));
      return recordEvaluation(evaluation, policy);
    };
    const command = (args: string[]) => ({ tool: 'node' as const, purpose: 'test' as const, args });
    const scenario: FixtureProjectScenario = {
      schemaVersion: '1.0', name: 'automated-two-iteration', moduleId,
      repositoryRoot, expectedCommit: commit,
      sourcePaths: [`${layout}/module.js`, `${layout}/${testName}`],
      publicInterfacePaths: [`${layout}/contract.js`, 'package.json'],
      allowedGeneratedPaths: [`${layout}/module.js`], prepareCommands: [],
      referenceCommands: [command(['--test', `${layout}/${testName}`])],
      firstIterationCommands: [command(['--test', `${layout}/${testName}`])],
      finalCommands: [command(['--test', `${layout}/${testName}`])],
      assets: {
        knowledgeV1: 'knowledge-v1.md', knowledgeV2: 'knowledge-v2.md',
        codeV1: 'code-v1.js', codeV2: 'code-v2.js', correction: 'correction.json',
        generatedPath: `${layout}/module.js`, title: 'Automated module',
        description: 'LangGraph-driven knowledge verification fixture.',
      },
    };
    const policy = {
      policyId: 'custom-acceptance-v1', minimumStability: 0.73,
      requireAllTests: false, maxIterations: 3,
    };
    const handle = await workflow.start(scenario, { ...policy, workerCount: 1 });
    assert.equal(composition.runConfiguration.get(handle.runId)?.agents.length, 7);
    const result = await workflow.wait(handle.runId);

    assert.equal(result.executionStatus, 'COMPLETED', result.error ?? '');
    assert.deepEqual(await workflow.scenarioForRun(handle.runId), scenario);
    assert.equal(result.route, 'PASS');
    assert.equal(composition.repository.getRun(handle.runId)?.state, 'VERIFIED');
    assert.equal(composition.service.status().publications, 1);
    const published = composition.repository.listKnowledgeVersions(['VERIFIED']);
    assert.equal(published.length, 1);
    assert.equal(published[0]?.moduleId, moduleId);
    assert.equal(published[0]?.category, 'automated-project');
    assert.deepEqual(published[0]?.tags, ['langgraph']);
    const projections = composition.repository.listWorkflowNodeProjections(handle.runId);
    assert.deepEqual([...new Set(projections.map((projection) => projection.agentId).filter(Boolean))].sort(), [
      'check', 'code', 'doc-gen', 'doc-worker', 'orchestrator', 'review', 'test-gen',
    ]);
    assert.equal(projections.some((projection) => projection.nodeId === 'publication' && projection.status === 'COMPLETED'), true);
    assert.equal(composition.repository.listEvents(handle.runId).at(-1)?.eventType, 'WorkflowNodeStateChanged');
    const resultCheckpoints = [
      [`${handle.runId}:orchestrator:1:main:contract-v5`, 'orchestrator'],
      [`${handle.runId}:doc_gen:1:main:contract-v5`, 'doc-gen'],
      [`${handle.runId}:test_gen:stable-source:contract-v5`, 'test-gen'],
      [`${handle.runId}:code:1:main:contract-v5`, 'code'],
      [`${handle.runId}:check:1:main:contract-v5`, 'check'],
      [`${handle.runId}:review:1:main:contract-v5`, 'review'],
    ] as const;
    for (const [generationKey, agentType] of resultCheckpoints) {
      const resultRef = composition.repository.getCheckpoint(generationKey)?.outputRefs[0];
      assert.ok(resultRef, `AgentResult missing: ${generationKey}`);
      const envelope = JSON.parse(Buffer.from(
        await composition.artifacts.get(resultRef),
      ).toString('utf8')) as Record<string, unknown>;
      assert.equal(envelope.schemaVersion, '1.0');
      assert.equal(envelope.runId, handle.runId);
      assert.equal(envelope.agentType, agentType);
      assert.equal(envelope.status, 'SUCCEEDED');
    }
    const docRef = composition.repository.getCheckpoint(`${handle.runId}:doc_gen:1:main:contract-v5`)!.outputRefs[0]!;
    const docResult = JSON.parse(Buffer.from(await composition.artifacts.get(docRef)).toString('utf8'));
    assert.equal(docResult.payload.workerResultRefs.length, 1);
    const workerResult = JSON.parse(Buffer.from(await composition.artifacts.get(docResult.payload.workerResultRefs[0])).toString('utf8'));
    assert.equal(workerResult.agentType, 'doc-worker');
    const firstDocRef = composition.repository.getCheckpoint(`${handle.runId}:doc_gen:0:main:contract-v5`)!.outputRefs[0]!;
    const firstDocResult = JSON.parse(Buffer.from(await composition.artifacts.get(firstDocRef)).toString('utf8'));
    assert.deepEqual(docResult.payload.workerResultRefs, firstDocResult.payload.workerResultRefs, 'revision reuses committed source fragments');
    assert.ok(projections.some((projection) => projection.nodeId === 'doc_gen/doc_worker:worker-1'));
    const versions = composition.service.listKnowledgeVersions();
    const moduleVersions = versions.filter((version) => version.moduleId === scenario.moduleId);
    assert.equal(moduleVersions.length, 2);
    const candidate = moduleVersions.find((version) => version.status === 'CANDIDATE');
    const verified = moduleVersions.find((version) => version.status === 'VERIFIED');
    assert.equal(verified?.parentVersionId, candidate?.versionId);
    assert.equal(composition.repository.getEvaluationAndDecision(handle.runId, candidate?.versionId ?? '')?.decision.outcome, 'ITERATE');
    const finalGate = composition.repository.getEvaluationAndDecision(handle.runId, verified?.versionId ?? '');
    assert.equal(finalGate?.decision.outcome, 'PASS');
    assert.ok(observedPolicies.length >= 2);
    assert.deepEqual(observedPolicies, observedPolicies.map(() => policy));
    assert.equal(finalGate?.report.checkBlocking, false);
    assert.equal(finalGate?.report.reviewBlocking, false);
    const finalInputIds = new Set(finalGate?.report.inputRefs.map((ref) => ref.artifactId));
    for (const [generationKey, outputIndex] of [
      [`${handle.runId}:oracle_validation:1`, 0],
      [`${handle.runId}:check:1:main:contract-v5`, 0],
      [`${handle.runId}:review:1:main:contract-v5`, 0],
    ] as const) {
      const outputRef = composition.repository.getCheckpoint(generationKey)?.outputRefs[outputIndex];
      assert.ok(outputRef, `checkpoint output missing: ${generationKey}`);
      assert.equal(finalInputIds.has(outputRef.artifactId), true, `gate input missing: ${generationKey}`);
    }
  } finally {
    composition.close();
    rmSync(repositoryRoot, { recursive: true, force: true });
    rmSync(assetRoot, { recursive: true, force: true });
    rmSync(runtimeDir, { recursive: true, force: true });
  }
});

}
