/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：提供项目工作流夹具的基础设施实现与外部系统接入。
 */
import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import type { AgentId, ProjectEvaluation, WorkflowStageInput } from '../../../application/ports/ApplicationPorts.ts';
import { ProjectWorkflowStages, type AutomatedProjectScenario } from '../../../application/services/AutomatedProjectWorkflow.ts';
import { assertModelOutput } from '../ModelExecution.ts';
import type { ArtifactRef } from '../../../domain/Domain.ts';

/** 定义夹具项目Scenario的数据结构与类型约束。 */
export interface FixtureProjectScenario extends AutomatedProjectScenario {
  /** 提供assets信息，供调用方读取或传入。 */
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
/** 封装夹具项目工作流Stages的对外操作与协作依赖。 */
export class FixtureProjectWorkflowStages {
  /** 提供asset根目录信息，供调用方读取或传入。 */
  readonly assetRoot: string;
  /** 提供executor信息，供调用方读取或传入。 */
  readonly executor: ProjectWorkflowStages;
  /** 提供flywheel信息，供调用方读取或传入。 */
  readonly flywheel: ConstructorParameters<typeof ProjectWorkflowStages>[0]['flywheel'];

  /** 注入协作依赖并初始化实例状态。 */
  constructor(input: Omit<ConstructorParameters<typeof ProjectWorkflowStages>[0], 'modelFactory'> & {
    assetRoot: string; modelFactory?: ProjectWorkflowStages['modelFactory'];
  }) {
    this.assetRoot = realpathSync(resolve(input.assetRoot));
    this.flywheel = input.flywheel;
    this.executor = new ProjectWorkflowStages({ ...input,
      modelFactory: (request) => {
        if (request.provider) {
          if (!input.modelFactory) throw new Error('WORKFLOW_MODEL_FACTORY_MISSING');
          return input.modelFactory(request);
        }
        return { assertOutput: assertModelOutput,
          execute: async () => this.output(request.stage, request.scenario, request.command.agentType) };
      },
    });
  }

  /** 执行当前角色或业务阶段并返回结构化结果。 */
  execute(input: WorkflowStageInput) { return this.executor.execute(input); }

  private async output(input: WorkflowStageInput, scenario: AutomatedProjectScenario, agentId: AgentId): Promise<Record<string, unknown>> {
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
    return output;
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
