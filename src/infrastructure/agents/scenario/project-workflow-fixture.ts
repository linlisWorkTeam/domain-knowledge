import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import type { AgentId, ProjectEvaluation, WorkflowStageInput } from '../../../application/ports/index.ts';
import { ProjectWorkflowStages, type AutomatedProjectScenario } from '../../../application/services/automated-project-workflow.ts';
import type { ArtifactRef } from '../../../domain/index.ts';

export interface FixtureProjectScenario extends AutomatedProjectScenario {
  assets: {
    knowledgeV1: string;
    knowledgeV2: string;
    codeV1: string;
    codeV2: string;
    correction: string;
    generatedPath: string;
    title: string;
    description: string;
  };
}

/** Explicit deterministic test adapter. Never selected as a failed-provider fallback. */
export class FixtureProjectWorkflowStages extends ProjectWorkflowStages {
  readonly assetRoot: string;

  constructor(input: ConstructorParameters<typeof ProjectWorkflowStages>[0] & { assetRoot: string }) {
    super(input);
    this.assetRoot = realpathSync(resolve(input.assetRoot));
  }

  protected override async runRole(
    input: WorkflowStageInput,
    scenario: AutomatedProjectScenario,
    agentId: AgentId,
  ): Promise<ArtifactRef> {
    if (this.agentForRun(input.runId)) return super.runRole(input, scenario, agentId);
    const assets = (scenario as FixtureProjectScenario).assets;
    if (!assets) throw new Error('WORKFLOW_FIXTURE_ASSETS_REQUIRED');
    let output: Record<string, unknown>;
    if (agentId === 'doc-gen') {
      output = {
        body: this.asset(input.iteration === 0 ? assets.knowledgeV1 : assets.knowledgeV2),
        title: assets.title, description: assets.description,
      };
    } else if (agentId === 'code') {
      output = { files: [{
        path: assets.generatedPath,
        content: this.asset(input.iteration === 0 ? assets.codeV1 : assets.codeV2),
      }] };
    } else if (agentId === 'review') {
      const ref = input.context[`evaluationEvidenceRef:${input.iteration}`] as ArtifactRef | undefined;
      if (!ref) throw new Error('WORKFLOW_REVIEW_EVALUATION_MISSING');
      const evaluation = JSON.parse(Buffer.from(await this.flywheel.getArtifact(ref)).toString('utf8')) as ProjectEvaluation;
      output = {
        blocking: false, recommendation: evaluation.passed ? 'PASS' : 'ITERATE',
        correction: evaluation.passed ? null : JSON.parse(this.asset(assets.correction)),
      };
    } else if (agentId === 'test-gen') {
      output = { candidateCommands: scenario.finalCommands, oracleRequired: true };
    } else if (agentId === 'check') {
      output = { blocking: false, findings: [], scope: scenario.allowedGeneratedPaths };
    } else if (agentId === 'doc-worker') {
      output = {
        workerId: input.workerId,
        fragment: `Source partition ${input.workerId ?? 'default'} prepared for DocGen.`,
        provenance: scenario.sourcePaths,
      };
    } else {
      output = {
        iteration: input.iteration, strategy: 'fixed-knowledge-flywheel-v1',
        parallel: ['documentation', 'test-generation'],
      };
    }
    return this.commitAgentOutput(input, scenario, agentId, output);
  }

  private asset(path: string): string {
    const target = realpathSync(resolve(this.assetRoot, path));
    const rel = relative(this.assetRoot, target);
    if (rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel)) {
      throw new Error(`WORKFLOW_ASSET_DENIED: ${path}`);
    }
    return readFileSync(target, 'utf8');
  }
}
