/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：协调Docgen样例用例及其依赖的领域规则与端口。
 */
import type { ArtifactRef } from '../../domain/Domain.ts';
import type { AgentResult, ProjectEvaluator, RunConfigurationManager, WorkflowStageInput, WorkflowStageResult } from '../ports/ApplicationPorts.ts';
import type { KnowledgeFlywheelService } from './ApplicationServices.ts';
import type { AutomatedProjectScenario } from './AutomatedProjectWorkflow.ts';

/** A role development exercise; does not run the publication workflow. */
/** 封装Docgen样例服务的对外操作与协作依赖。 */
export class DocgenExampleService {
  /** 提供dependencies信息，供调用方读取或传入。 */
  readonly dependencies: {
    flywheel: KnowledgeFlywheelService;
    runConfiguration: RunConfigurationManager;
    evaluator: ProjectEvaluator;
    execute: (input: WorkflowStageInput) => Promise<WorkflowStageResult>;
  };
  /** 注入协作依赖并初始化实例状态。 */
  constructor(dependencies: DocgenExampleService['dependencies']) { this.dependencies = dependencies; }

  /** 运行请求。 */
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
