import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  AutomatedProjectWorkflowService, OhMyWorkPanelWorkflowExecutor,
  type AutomatedProjectScenario,
} from '../../src/application/services/index.ts';
import { TrustedProjectEvaluator } from '../../src/infrastructure/evaluation/project/index.ts';
import { createDomainKnowledgeInfrastructure } from '../../src/infrastructure/workflow/langgraph/index.ts';
import { createComposition } from '../../src/interfaces/runner/composition.ts';
import { GOOD_BODY } from '../helpers/fixture.ts';

function git(root: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test('ohMyWorkPanel profile uses LangGraph nodes and deterministic publication authority', async () => {
  const repositoryRoot = mkdtempSync(join(tmpdir(), 'wp-automated-source-'));
  const assetRoot = mkdtempSync(join(tmpdir(), 'wp-automated-assets-'));
  const runtimeDir = mkdtempSync(join(tmpdir(), 'wp-automated-runtime-'));
  mkdirSync(join(repositoryRoot, 'src'));
  writeFileSync(join(repositoryRoot, 'package.json'), '{"name":"automated-source","type":"module"}\n');
  writeFileSync(join(repositoryRoot, 'src', 'contract.js'), 'export const expected = 4;\n');
  writeFileSync(join(repositoryRoot, 'src', 'module.js'), 'export const calculate = () => 4;\n');
  writeFileSync(join(repositoryRoot, 'src', 'module.test.js'), `
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
    const executor = new OhMyWorkPanelWorkflowExecutor({
      flywheel: composition.apps.flywheel,
      evalRunner: composition.apps.evalRunner,
      evaluator: new TrustedProjectEvaluator(composition.artifacts),
      assetRoot,
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
    const scenario: AutomatedProjectScenario = {
      schemaVersion: '1.0', name: 'automated-two-iteration', moduleId: 'automated-module',
      repositoryRoot, expectedCommit: commit,
      sourcePaths: ['src/module.js', 'src/module.test.js'],
      publicInterfacePaths: ['src/contract.js', 'package.json'],
      allowedGeneratedPaths: ['src/module.js'], prepareCommands: [],
      referenceCommands: [command(['--test', 'src/module.test.js'])],
      firstIterationCommands: [command(['--test', 'src/module.test.js'])],
      finalCommands: [command(['--test', 'src/module.test.js'])],
      assets: {
        knowledgeV1: 'knowledge-v1.md', knowledgeV2: 'knowledge-v2.md',
        codeV1: 'code-v1.js', codeV2: 'code-v2.js', correction: 'correction.json',
        generatedPath: 'src/module.js', title: 'Automated module',
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

    assert.equal(result.executionStatus, 'COMPLETED');
    assert.equal(result.route, 'PASS');
    assert.equal(composition.repository.getRun(handle.runId)?.state, 'VERIFIED');
    assert.equal(composition.service.status().publications, 1);
    const projections = composition.repository.listWorkflowNodeProjections(handle.runId);
    assert.deepEqual([...new Set(projections.map((projection) => projection.agentId).filter(Boolean))].sort(), [
      'check', 'code', 'doc-gen', 'doc-worker', 'orchestrator', 'review', 'test-gen',
    ]);
    assert.equal(projections.some((projection) => projection.nodeId === 'publication' && projection.status === 'COMPLETED'), true);
    assert.equal(composition.repository.listEvents(handle.runId).at(-1)?.eventType, 'WorkflowNodeStateChanged');
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
    for (const generationKey of [
      `${handle.runId}:oracle_validation:1`,
      `${handle.runId}:check:1:main:contract-v4`,
      `${handle.runId}:review:1:main:contract-v4`,
    ]) {
      const outputRef = composition.repository.getCheckpoint(generationKey)?.outputRefs[0];
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
