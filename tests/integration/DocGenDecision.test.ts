/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证 DocGen 拆分提案在生产交接处停止，并对外保留用户待决事项。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createTestComposition, GENERIC_SCENARIO } from '../helpers/Fixture.ts';
import { roleExample } from '../helpers/RoleExample.ts';
import { ProjectWorkflowStages } from '../../src/application/services/AutomatedProjectWorkflow.ts';
import { NODE_BY_AGENT } from '../../src/domain/workflow/AgentDefinitions.ts';
import { candidateDestination, workflowDestination } from '../../src/domain/workflow/Workflow.ts';
import { TrustedProjectEvaluator } from '../../src/infrastructure/evaluation/project/TrustedProjectEvaluator.ts';
import { JsonSchemaAgentContractValidator } from '../../src/infrastructure/agentAdapters/contracts/JsonSchemaAgentContractValidator.ts';
import { assertModelOutput } from '../../src/infrastructure/agentAdapters/ModelExecution.ts';
import type { WorkflowStageInput } from '../../src/application/ports/ApplicationPorts.ts';

const proposal = { splitProposal: { reason: 'Public API and implementation exceed the useful document scope',
  suggestedDocuments: ['Public API', 'Implementation details'] } };

test('DocGen proposal stops before candidate creation and exposes its saved reason and suggestions', async () => {
  const c = createTestComposition();
  try {
    const calls: string[] = [];
    const stages = new ProjectWorkflowStages({ flywheel: c.service, evalRunner: c.apps.evalRunner,
      evaluator: new TrustedProjectEvaluator(c.artifacts), nodeByAgent: NODE_BY_AGENT,
      contracts: new JsonSchemaAgentContractValidator('docs/specs/schemas'),
      modelFactory: ({ command }) => ({ assertOutput: assertModelOutput, execute: async () => {
        calls.push(command.agentType);
        return command.agentType === 'orchestrator' ? roleExample('orchestrator').output : proposal;
      } }),
    });
    const run = c.service.createRun(GENERIC_SCENARIO.moduleId, 'decision-test');
    const stage: WorkflowStageInput = { runId: run.runId, nodeId: 'orchestrator', agentId: 'orchestrator',
      iteration: 0, attempt: 1, maxIterations: 1, workerCount: 0, prompt: 'Generate one document',
      context: { scenario: GENERIC_SCENARIO, gatePolicy: { policyId: 'decision-test', minimumStability: 1, requireAllTests: true, maxIterations: 1 } } };
    const planned = await stages.execute(stage);
    Object.assign(stage.context, planned.context);
    const generated = await stages.execute({ ...stage, nodeId: 'doc_gen', agentId: 'doc-gen' });
    Object.assign(stage.context, generated.context);
    const candidate = await stages.execute({ ...stage, nodeId: 'candidate_knowledge' });
    assert.equal(candidate.route, 'STOPPED');
    assert.equal(candidateDestination(candidate.route!), 'workflow_router');
    Object.assign(stage.context, candidate.context);
    const decision = stage.context.docGenDecisionRequired as Record<string, unknown>;
    assert.equal(decision.reason, proposal.splitProposal.reason);
    assert.deepEqual(decision.suggestedDocuments, proposal.splitProposal.suggestedDocuments);
    assert.ok(await c.artifacts.verify(decision.proposalRef as never));
    const routed = await stages.execute({ ...stage, nodeId: 'workflow_router' });
    assert.equal(workflowDestination(routed.route!), 'stopped');
    assert.equal(c.service.getRun(run.runId)!.state, 'LOW_CONFIDENCE');
    assert.equal(c.service.listKnowledgeVersions().length, 0);
    assert.deepEqual(calls, ['orchestrator', 'doc-gen']);
  } finally { c.dispose(); }
});

test('standalone DocGen reports the user decision and never creates a body artifact', async () => {
  const c = createTestComposition();
  try {
    const sample = JSON.parse(readFileSync('src/domain/agents/docGenAgent/examples/DocGenAgentSample.json', 'utf8'));
    sample.modelOutput = proposal;
    const result = await c.apps.agentExample.run('doc-gen', sample);
    assert.equal(result.decisionRequired?.reason, proposal.splitProposal.reason);
    assert.equal(result.result.payload.bodyRef, undefined);
    assert.equal(result.outputs.some((item) => item.ref.mediaType === 'text/markdown'), false);
  } finally { c.dispose(); }
});
