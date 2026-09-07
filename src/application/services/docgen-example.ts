import type { ArtifactRef } from '../../domain/index.ts';
import type { AgentResult, ProjectEvaluator, RunConfigurationManager, WorkflowStageInput, WorkflowStageResult } from '../ports/index.ts';
import type { KnowledgeFlywheelService } from './index.ts';
import type { AutomatedProjectScenario } from './automated-project-workflow.ts';

/** A role development exercise; does not run the publication workflow. */
export class DocgenExampleService {
  readonly dependencies: {
    flywheel: KnowledgeFlywheelService;
    runConfiguration: RunConfigurationManager;
    evaluator: ProjectEvaluator;
    execute: (input: WorkflowStageInput) => Promise<WorkflowStageResult>;
  };
  constructor(dependencies: DocgenExampleService['dependencies']) { this.dependencies = dependencies; }

  async run(scenario: AutomatedProjectScenario, signal?: AbortSignal) {
    const { flywheel, runConfiguration, evaluator, execute } = this.dependencies;
    if (signal?.aborted) throw new Error('AGENT_CANCELLED');
    const snapshot = await evaluator.inspect(scenario);
    const run = flywheel.createRun(scenario.moduleId, 'docgen-example-v1');
    try {
      const configuration = await runConfiguration.capture(run.runId);
      if (configuration.provider.kind !== 'deepseek-harness') throw new Error('DOCGEN_EXAMPLE_DSH_REQUIRED');
      const scenarioRef = await flywheel.putArtifact(Buffer.from(JSON.stringify(scenario)), 'application/json');
      const prompt = await runConfiguration.resolvePrompt(run.runId, 'doc-gen');
      const output = await execute({
        runId: run.runId, nodeId: 'doc_gen', agentId: 'doc-gen', iteration: 0,
        attempt: 1, maxIterations: 1, workerCount: 0, prompt,
        context: { scenario, snapshot, scenarioRef }, signal,
      });
      if (signal?.aborted) throw new Error('AGENT_CANCELLED');
      const resultRef = output.context?.['doc_gen:0'] as ArtifactRef | undefined;
      if (!resultRef) throw new Error('DOCGEN_EXAMPLE_RESULT_MISSING');
      const result = JSON.parse(Buffer.from(await flywheel.getArtifact(resultRef)).toString('utf8')) as AgentResult;
      const bodyRef = result.payload['bodyRef'] as ArtifactRef;
      const body = Buffer.from(await flywheel.getArtifact(bodyRef)).toString('utf8');
      return { schemaVersion: '1.0', kind: 'docgen-development-example', runId: run.runId,
        publication: 'NOT_EVALUATED', provider: configuration.provider,
        sourceCommit: snapshot.commit, manifestRef: snapshot.manifestRef, resultRef, bodyRef, body };
    } catch (error) {
      flywheel.transition(run.runId, signal?.aborted ? 'CANCELLED' : 'FAILED');
      throw error;
    }
  }
}
