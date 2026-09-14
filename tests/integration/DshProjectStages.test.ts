/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证Dsh项目Stages的行为、约束及失败场景。
 */
import { NODE_BY_AGENT } from '../../src/domain/workflow/AgentDefinitions.ts';
import { modelExecutionFactory } from '../../src/infrastructure/agentAdapters/ModelExecution.ts';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { ProjectWorkflowStages, type AutomatedProjectScenario } from '../../src/application/services/AutomatedProjectWorkflow.ts';
import type { WorkflowStageInput } from '../../src/application/ports/ApplicationPorts.ts';
import { DeepSeekHarnessSdkAgent, type DeepSeekHarnessAuditRecord } from '../../src/infrastructure/agentAdapters/deepSeekHarness/DeepSeekHarnessSdkAgent.ts';
import { LocalAgentWorkspace } from '../../src/domain/workspace/LocalAgentWorkspace.ts';
import { TrustedProjectEvaluator } from '../../src/infrastructure/evaluation/project/TrustedProjectEvaluator.ts';
import { JsonSchemaAgentContractValidator } from '../../src/infrastructure/agentAdapters/contracts/JsonSchemaAgentContractValidator.ts';
import { createComposition } from '../../src/interfaces/runner/Composition.ts';
import { orchestratorOutput } from '../helpers/CppScenario.ts';
import { GOOD_BODY } from '../helpers/Fixture.ts';

function git(root: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

// This exercises the real business stages, workspace and DSH adapter with a
// controlled SDK runtime. It does not claim external-model or full-loop quality.
for (const [moduleId, sourcePath] of [['formatter', 'lib/format.mjs'], ['normalizer', 'components/normalize.ts']]) {
  test(`generic DSH stages accept ${moduleId} without fixed project assets`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-generic-stage-'));
    const sourceRoot = join(root, 'source');
    mkdirSync(dirname(join(sourceRoot, sourcePath)), { recursive: true });
    writeFileSync(join(sourceRoot, sourcePath), `export const moduleName = '${moduleId}';\n`);
    writeFileSync(join(sourceRoot, 'contract.d.ts'), 'export declare const moduleName: string;\n');
    git(sourceRoot, ['init']);
    git(sourceRoot, ['-c', 'user.name=Reference Fixture', '-c', 'user.email=fixture@example.invalid', 'add', '.']);
    git(sourceRoot, ['-c', 'user.name=Reference Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'reference']);
    const commit = git(sourceRoot, ['rev-parse', 'HEAD']);
    // The role must read the pinned commit, not this mutable worktree value.
    writeFileSync(join(sourceRoot, sourcePath), 'uncommitted content must not be used');
    const composition = createComposition({ runtimeDir: join(root, 'runtime') });
    const calls: string[] = [];
    const audits: DeepSeekHarnessAuditRecord[] = [];
    const scenario: AutomatedProjectScenario = {
      schemaVersion: '1.0', name: moduleId, moduleId, repositoryRoot: sourceRoot,
      expectedCommit: commit, sourcePaths: [sourcePath], publicInterfacePaths: ['contract.d.ts'],
      allowedGeneratedPaths: [sourcePath], prepareCommands: [],
      referenceCommands: [], firstIterationCommands: [], finalCommands: [],
    };
    try {
      const stages = new ProjectWorkflowStages({
    nodeByAgent: NODE_BY_AGENT,
        flywheel: composition.service, evalRunner: composition.apps.evalRunner,
        evaluator: new TrustedProjectEvaluator(composition.artifacts),
        contracts: new JsonSchemaAgentContractValidator(join(process.cwd(), 'docs/specs/schemas')),
        modelFactory: modelExecutionFactory(new LocalAgentWorkspace({ workspaceRoot: join(root, 'roles'), allowedSourceRoots: [sourceRoot] })),

        agent: new DeepSeekHarnessSdkAgent({
          allowedWorkspaceRoots: [root], maxSchemaAttempts: 1,
          onAudit: (record) => { audits.push(record); },
          harnessFactory: (options) => ({
            run: async (prompt, runOptions) => {
              assert.equal(typeof prompt, 'string');
              const planning = String(prompt).includes('你是知识飞轮中的 orchestrator 节点。');
              calls.push(planning ? 'orchestrator' : 'doc-gen');
              if (!planning) assert.match(readFileSync(join(options.cwd!, sourcePath), 'utf8'), new RegExp(moduleId));
              assert.equal(String(prompt).includes('knowledge-v1.md'), false);
              return {
                sessionId: runOptions!.sessionId!, events: [], notifications: [],
                finalResponse: JSON.stringify(planning
                  ? orchestratorOutput(moduleId)
                  : { title: moduleId, description: 'Pinned source documentation.', keywords: [moduleId], body: GOOD_BODY }),
              };
            },
            close: async () => undefined,
          }),
        }),
      });
      const run = composition.service.createRun(moduleId, 'stage-check');
      const input: WorkflowStageInput = {
        runId: run.runId, nodeId: 'orchestrator', agentId: 'orchestrator',
        iteration: 0, attempt: 1, maxIterations: 1, workerCount: 0,
        prompt: 'Document the selected source.', context: {
          scenario, gatePolicy: { policyId: 'stage-check', minimumStability: 1, requireAllTests: true, maxIterations: 1 },
        },
      };
      const planned = await stages.execute(input);
      const generated = await stages.execute({
        ...input, nodeId: 'doc_gen', agentId: 'doc-gen', context: { ...input.context, ...planned.context },
      });
      const ref = generated.context?.['doc_gen:0'];
      assert.ok(ref && typeof ref === 'object' && 'artifactId' in ref);
      const result = JSON.parse(Buffer.from(await composition.artifacts.get(ref as never)).toString('utf8'));
      assert.equal(result.agentType, 'doc-gen');
      assert.equal(result.runId, run.runId);
      assert.equal(result.status, 'SUCCEEDED');
      assert.deepEqual(calls, ['orchestrator', 'doc-gen']);
      assert.equal(new Set(audits.map((record) => record.sessionId)).size, 2);
      assert.ok(audits.every((record) => record.sessionId && record.metadata.runId === run.runId && record.status === 'SUCCEEDED'));
      assert.equal(composition.service.status().publications, 0);
    } finally {
      composition.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
}
