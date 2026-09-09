/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验收独立模块真实隔离评测、可信候选晋升、H2 修订和自动本地发布。
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { ArtifactRef } from '../../src/domain/Domain.ts';
import type { ModelRequest } from '../../src/domain/agents/AgentExecution.ts';
import type { ModuleBehaviorSuite } from '../../src/domain/agents/testGenAgent/ModuleBehaviorSuite.ts';
import { NODE_BY_AGENT } from '../../src/domain/workflow/AgentDefinitions.ts';
import { AutomatedProjectWorkflowService, ProjectWorkflowStages } from '../../src/application/services/AutomatedProjectWorkflow.ts';
import { FixtureProjectWorkflowStages, type FixtureProjectScenario } from '../../src/infrastructure/agentAdapters/scenario/ProjectWorkflowFixture.ts';
import { JsonSchemaAgentContractValidator } from '../../src/infrastructure/agentAdapters/contracts/JsonSchemaAgentContractValidator.ts';
import { TrustedProjectEvaluator } from '../../src/infrastructure/evaluation/project/TrustedProjectEvaluator.ts';
import { createDomainKnowledgeInfrastructure } from '../../src/infrastructure/langgraph/LangGraph.ts';
import { createComposition } from '../../src/interfaces/runner/Composition.ts';
import { GOOD_BODY } from '../helpers/Fixture.ts';

const sourcePath = 'src/module.ts';
const sourceSecret = 'REFERENCE_SOURCE_ONLY_SENTINEL';
const knowledgeSecret = 'CANDIDATE_KNOWLEDGE_ONLY_SENTINEL';
const fixedSecret = 'FROZEN_GATE_ONLY_SENTINEL';
const baseKnowledge = `${GOOD_BODY}\n\n知识材料标识：${knowledgeSecret}\n\n## 行为契约\n\n公开函数 calculate 不接受参数，每次调用返回一个数值。`;
const revisedKnowledge = `${GOOD_BODY}\n\n知识材料标识：${knowledgeSecret}\n\n## 行为契约\n\n公开函数 calculate 不接受参数，每次调用必须返回固定数值 4；重复调用保持相同行为。`;

function git(root: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

interface Options { defectiveFirst?: boolean; wrongOracle?: boolean; unresolvedSource?: boolean; maxIterations?: number; }

/** 只有参考仓库、模型夹具与门禁数据被构造；编译、进程隔离和宿主比较全部使用生产实现。 */
async function runModule(options: Options, verify: (context: {
  composition: ReturnType<typeof createComposition>;
  runId: string;
  result: Awaited<ReturnType<AutomatedProjectWorkflowService['wait']>>;
  requests: Array<{ iteration: number; request: ModelRequest }>;
  scenario: FixtureProjectScenario;
}) => Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), 'wp-module-flywheel-'));
  const repositoryRoot = join(root, 'source');
  const assetRoot = join(root, 'assets');
  mkdirSync(join(repositoryRoot, 'src'), { recursive: true });
  mkdirSync(assetRoot);
  writeFileSync(join(repositoryRoot, sourcePath), `// ${sourceSecret}\nexport const calculate = () => ${options.unresolvedSource ? '4 + 0' : '4'};\n`);
  git(repositoryRoot, ['init']);
  git(repositoryRoot, ['add', '.']);
  git(repositoryRoot, ['-c', 'user.name=Module Acceptance', '-c', 'user.email=acceptance@example.invalid', 'commit', '-m', 'pin reference']);
  const commit = git(repositoryRoot, ['rev-parse', 'HEAD']);
  const original = readFileSync(join(repositoryRoot, sourcePath), 'utf8');
  assert.equal(git(repositoryRoot, ['status', '--porcelain']), '');
  writeFileSync(join(assetRoot, 'KnowledgeV1.md'), options.defectiveFirst ? baseKnowledge : revisedKnowledge);
  writeFileSync(join(assetRoot, 'KnowledgeV2.md'), revisedKnowledge);
  writeFileSync(join(assetRoot, 'CodeV1.ts'), `export const calculate = () => ${options.defectiveFirst ? '3' : '4'};\n`);
  writeFileSync(join(assetRoot, 'CodeV2.ts'), 'export const calculate = () => 4;\n');
  writeFileSync(join(assetRoot, 'Correction.json'), JSON.stringify({
    correctionId: 'COR-0001', knowledgePath: 'knowledge/module-acceptance.md#行为契约',
    criterion: '说明 calculate 返回固定数值 4，重复调用保持一致。', risk: '返回值不符合独立评测结果。',
  }));
  // 候选案例独立保存在模型夹具中，绝不通过 fixedSuite 派生或传入 TestGen。
  const candidateSuite: ModuleBehaviorSuite = {
    schemaVersion: 'module-cases-v1', modulePath: sourcePath, exportName: 'calculate',
    cases: [{ caseId: 'candidate-return', description: '独立候选验证参数为空的返回值', args: [], expected: options.wrongOracle ? 5 : 4 }],
  };
  writeFileSync(join(assetRoot, 'CandidateSuite.json'), JSON.stringify(candidateSuite));
  const scenario: FixtureProjectScenario = {
    schemaVersion: '1.0', name: 'isolated-module-flywheel', moduleId: 'module-acceptance', repositoryRoot,
    expectedCommit: commit, sourcePaths: [sourcePath], publicInterfacePaths: [], allowedGeneratedPaths: [sourcePath],
    moduleContract: { modulePath: sourcePath, exportName: 'calculate', signature: 'export function calculate(): number;' },
    fixedSuite: { schemaVersion: 'module-cases-v1', modulePath: sourcePath, exportName: 'calculate',
      cases: [{ caseId: 'fixed-return', description: fixedSecret, args: [], expected: 4 }] },
    prepareCommands: [], referenceCommands: [], firstIterationCommands: [], finalCommands: [],
    assets: { knowledgeV1: 'KnowledgeV1.md', knowledgeV2: 'KnowledgeV2.md', codeV1: 'CodeV1.ts', codeV2: 'CodeV2.ts',
      correction: 'Correction.json', testSuite: 'CandidateSuite.json', generatedPath: sourcePath,
      title: '独立模块契约', description: '验证固定来源、独立候选、修订范围与本地知识发布。' },
  };
  const composition = createComposition({ runtimeDir: join(root, 'runtime'), repositoryRoot });
  try {
    const dependencies = {
      nodeByAgent: NODE_BY_AGENT, flywheel: composition.apps.flywheel, evalRunner: composition.apps.evalRunner,
      evaluator: new TrustedProjectEvaluator(composition.artifacts),
      contracts: new JsonSchemaAgentContractValidator(join(process.cwd(), 'docs/specs/schemas')),
      localPublication: composition.apps.publicationOperations,
    };
    const fixture = new FixtureProjectWorkflowStages({ ...dependencies, assetRoot });
    const requests: Array<{ iteration: number; request: ModelRequest }> = [];
    const executor = new ProjectWorkflowStages({ ...dependencies, modelFactory: (stage) => {
      const model = fixture.executor.modelFactory(stage);
      return { assertOutput: model.assertOutput, execute: async (request, signal) => {
        requests.push({ iteration: stage.stage.iteration, request: structuredClone(request) });
        return model.execute(request, signal);
      } };
    } });
    const infrastructure = await createDomainKnowledgeInfrastructure({ executor, observer: composition.workflowObserver,
      prompts: composition.runConfiguration, checkpoint: { kind: 'memory' } });
    const workflow = new AutomatedProjectWorkflowService(composition.service, infrastructure.engine, composition.runConfiguration);
    const handle = await workflow.start(scenario, { policyId: 'module-acceptance-v1', minimumStability: 1,
      requireAllTests: true, maxIterations: options.maxIterations ?? 2, workerCount: 1 });
    const result = await workflow.wait(handle.runId);
    // 授权角色视野与固定测试冻结必须在真实 Application 材料交接后仍成立。
    for (const { request } of requests) {
      if (request.role === 'code') {
        assert.match(request.prompt, new RegExp(knowledgeSecret));
        assert.doesNotMatch(request.prompt, new RegExp(`${sourceSecret}|${fixedSecret}|fixed-return|"expected":4`));
        assert.deepEqual(request.readablePaths, []);
      }
      if (request.role === 'test-gen') {
        assert.match(request.prompt, new RegExp(sourceSecret));
        assert.doesNotMatch(request.prompt, new RegExp(`${knowledgeSecret}|${fixedSecret}|fixed-return`));
      }
    }
    assert.equal(git(repositoryRoot, ['status', '--porcelain']), '', 'the reference repository must remain clean');
    assert.equal(readFileSync(join(repositoryRoot, sourcePath), 'utf8'), original);
    assert.equal(git(repositoryRoot, ['rev-parse', 'HEAD']), commit);
    await verify({ composition, runId: handle.runId, result, requests, scenario });
  } finally { composition.close(); rmSync(root, { recursive: true, force: true }); }
}

async function checkpointArtifact(composition: ReturnType<typeof createComposition>, key: string, index = 0) {
  const ref = composition.repository.getCheckpoint(key)?.outputRefs[index];
  assert.ok(ref, `checkpoint artifact missing: ${key}:${index}`);
  return { ref, value: JSON.parse(Buffer.from(await composition.artifacts.get(ref)).toString('utf8')) };
}

function noPublication(composition: ReturnType<typeof createComposition>) {
  assert.equal(composition.service.status().publications, 0);
  assert.deepEqual(composition.apps.publicationOperations.list(), []);
}

test('module flywheel: seven roles pass frozen and promoted suites and publish local Markdown', async () => {
  await runModule({}, async ({ composition, runId, result, requests, scenario }) => {
    assert.equal(result.executionStatus, 'COMPLETED', result.error ?? '');
    assert.equal(result.route, 'PASS');
    assert.deepEqual([...new Set(requests.map(({ request }) => request.role))].sort(),
      ['check', 'code', 'doc-gen', 'doc-worker', 'orchestrator', 'review', 'test-gen']);
    assert.deepEqual(requests.filter(({ request }) => request.role === 'doc-gen').map(({ request }) => request.stage), ['outline', 'body']);
    const oracle = await checkpointArtifact(composition, `${runId}:oracle_validation:0`);
    const candidateOracle = await checkpointArtifact(composition, `${runId}:oracle_validation:0`, 1);
    assert.equal(oracle.value.mode, 'reference');
    assert.equal(candidateOracle.value.mode, 'reference');
    assert.equal(candidateOracle.value.passed, true);
    assert.notEqual(candidateOracle.value.suiteSha256, oracle.value.suiteSha256);
    assert.equal(oracle.value.toolchain.isolation, 'linux-bwrap-unshare-all-node-permission-vm-v1');
    const evaluation = await checkpointArtifact(composition, `${runId}:evaluation:0`);
    assert.equal(evaluation.value.passed, true);
    assert.equal(evaluation.value.testsPassed, 10);
    assert.equal(evaluation.value.testsTotal, 10);
    assert.equal(evaluation.value.evidenceRefs.some((ref: ArtifactRef) => ref.artifactId === candidateOracle.ref.artifactId), true);
    const receipt = composition.apps.publicationOperations.list()[0];
    assert.ok(receipt);
    assert.equal(receipt.status, 'PUBLISHED');
    assert.equal(receipt.runId, runId);
    assert.equal(composition.service.status().publications, 1);
    const published = composition.apps.publicationOperations.get(receipt.publicationKey);
    assert.match(published.markdown, /固定数值 4/);
    assert.equal(published.metadata.sourceCommit, scenario.expectedCommit);
    assert.equal(published.metadata.evidenceRefs.length, 2);
    assert.equal(readFileSync(receipt.path, 'utf8'), published.markdown);
  });
});

test('module flywheel: evidence-bound H2 correction repairs a failed implementation on the second round', async () => {
  await runModule({ defectiveFirst: true }, async ({ composition, runId, result, requests }) => {
    assert.equal(result.executionStatus, 'COMPLETED', result.error ?? '');
    assert.equal(result.route, 'PASS');
    assert.equal(result.iteration, 1);
    assert.deepEqual(requests.filter(({ request }) => request.role === 'code').map(({ iteration }) => iteration), [0, 1]);
    assert.deepEqual(requests.filter(({ request }) => request.role === 'doc-gen').map(({ request }) => request.stage), ['outline', 'body', 'revision']);
    const first = await checkpointArtifact(composition, `${runId}:evaluation:0`);
    assert.equal(first.value.passed, false);
    const review = await checkpointArtifact(composition, `${runId}:review:0:main:contract-v5`);
    assert.equal(review.value.payload.corrections[0].knowledgePath, 'knowledge/module-acceptance.md#行为契约');
    assert.equal(review.value.payload.corrections[0].evidenceRefs.some((ref: ArtifactRef) => ref.artifactId === first.ref.artifactId), true);
    const versions = composition.service.listKnowledgeVersions().filter((version) => version.moduleId === 'module-acceptance');
    assert.equal(versions.length, 2);
    const verified = versions.find((version) => version.status === 'VERIFIED');
    const candidate = versions.find((version) => version.status === 'CANDIDATE');
    assert.ok(verified && candidate);
    assert.equal(verified.parentVersionId, candidate.versionId);
    const before = Buffer.from(await composition.artifacts.get(candidate.bodyRef)).toString('utf8');
    const after = Buffer.from(await composition.artifacts.get(verified.bodyRef)).toString('utf8');
    assert.equal(before.split('## 行为契约')[0], after.split('## 行为契约')[0]);
    assert.notEqual(before, after);
    assert.equal(composition.apps.publicationOperations.list().length, 1);
  });
});

test('module flywheel: wrong candidate expectations fail reference promotion without publishing', async () => {
  await runModule({ wrongOracle: true }, async ({ composition, result }) => {
    assert.equal(result.executionStatus, 'FAILED');
    assert.match(result.error ?? '', /TEST_ORACLE_REJECTED/);
    noPublication(composition);
  });
});

test('module flywheel: a one-round budget stops the first failed gate without starting a repair', async () => {
  await runModule({ defectiveFirst: true, maxIterations: 1 }, async ({ composition, runId, result, requests }) => {
    assert.equal(result.executionStatus, 'STOPPED', result.error ?? '');
    assert.equal(result.iteration, 0);
    assert.deepEqual(requests.filter(({ request }) => request.role === 'code').map(({ iteration }) => iteration), [0]);
    assert.equal(requests.some(({ request }) => request.stage === 'revision'), false);
    const version = composition.service.listKnowledgeVersions()[0];
    assert.ok(version);
    assert.equal(composition.repository.getEvaluationAndDecision(runId, version.versionId)?.decision.outcome, 'STOPPED');
    noPublication(composition);
  });
});

test('module flywheel: unresolved source evidence blocks publication even when all behavior cases pass', async () => {
  await runModule({ unresolvedSource: true, maxIterations: 1 }, async ({ composition, runId, result, requests }) => {
    assert.equal(result.executionStatus, 'STOPPED', result.error ?? '');
    const evaluation = await checkpointArtifact(composition, `${runId}:evaluation:0`);
    assert.equal(evaluation.value.passed, true);
    const version = composition.service.listKnowledgeVersions()[0];
    assert.ok(version);
    assert.ok(Array.isArray(version.metadata.unresolvedRisks) && version.metadata.unresolvedRisks.length > 0);
    const gate = composition.repository.getEvaluationAndDecision(runId, version.versionId);
    assert.equal(gate?.decision.outcome, 'STOPPED');
    assert.equal(gate?.report.checkBlocking, true);
    const review = requests.find(({ request }) => request.role === 'review');
    assert.ok(review);
    assert.match(review.request.prompt, /no semantic assertions/);
    noPublication(composition);
  });
});
