/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：协调角色样例用例及其依赖的领域规则与端口。
 */
import { sha256, type ArtifactRef } from '../../domain/Domain.ts';
import type { AgentId, AgentCommand, AgentResult } from '../../domain/agents/AgentContracts.ts';
import type { ModelExecutionPort, Material } from '../../domain/agents/AgentExecution.ts';
import type { AgentContractValidator, ProjectEvaluator, RunConfigurationManager, WorkflowObserver, WorkflowStageInput } from '../ports/ApplicationPorts.ts';
import type { KnowledgeFlywheelService } from './ApplicationServices.ts';
import type { AutomatedProjectScenario, ProjectWorkflowStages } from './AutomatedProjectWorkflow.ts';
import { RoleExecutionService } from './RoleExecution.ts';
import { executeDevelopmentStage } from './AgentDevelopmentObserver.ts';

/** 定义角色样例输入的数据结构与类型约束。 */
export interface AgentExampleInput {
  /** 提供提供方信息，供调用方读取或传入。 */
  provider: 'fixture' | 'dsh';
  /** 提供scenario信息，供调用方读取或传入。 */
  scenario: AutomatedProjectScenario;
  /** 提供轮次信息，供调用方读取或传入。 */
  iteration?: number;
  /** 提供提示词追加信息，供调用方读取或传入。 */
  promptAddon?: string;
  /** References in payload use { material: name }; bytes are explicitly supplied. */
  /** 提供业务载荷信息，供调用方读取或传入。 */
  payload: Record<string, unknown>;
  /** 提供materials信息，供调用方读取或传入。 */
  materials: Record<string, { content: unknown; mediaType: string }>;
  /** 提供模型输出信息，供调用方读取或传入。 */
  modelOutput?: Record<string, unknown>;
  /** 分阶段样例逐阶段提供显式模型响应，禁止在业务代码中跳过概要。 */
  modelStages?: Record<string, Record<string, unknown>>;
}
/** 单角色开发用例：显式装载样例材料，复用生产角色与提交服务，不启动上游角色或发布图。 */
export class AgentExampleService {
  /** 提供dependencies信息，供调用方读取或传入。 */
  readonly dependencies: {
    flywheel: KnowledgeFlywheelService; runConfiguration: RunConfigurationManager;
    evaluator: ProjectEvaluator; contracts: AgentContractValidator; observer: WorkflowObserver;
    nodeByAgent: Record<AgentId, string>;
    configurePrompt: (role: AgentId, addon: string) => void;
    model: ProjectWorkflowStages['modelFactory'];
    fixtureModel: (output: Record<string, unknown>, stages?: Record<string, Record<string, unknown>>) => ModelExecutionPort;
  };
  /** 注入协作依赖并初始化实例状态。 */
  constructor(dependencies: AgentExampleService['dependencies']) { this.dependencies = dependencies; }
  /** 运行请求。 */
  async run(role: AgentId, sample: AgentExampleInput, signal?: AbortSignal) {
    const { flywheel, runConfiguration, evaluator, contracts, observer, nodeByAgent } = this.dependencies;
    if (signal?.aborted) throw new Error('AGENT_CANCELLED');
    const run = flywheel.createRun(sample.scenario.moduleId, 'agent-development-v1');
    try {
      if (sample.promptAddon !== undefined) this.dependencies.configurePrompt(role, sample.promptAddon);
      const configuration = await runConfiguration.capture(run.runId);
      if (sample.provider === 'dsh' && configuration.provider.kind !== 'deepseek-harness') throw new Error('AGENT_EXAMPLE_DSH_REQUIRED');
      if (sample.provider === 'fixture' && configuration.provider.kind !== 'fixture') throw new Error('AGENT_EXAMPLE_FIXTURE_CONFIGURATION_REQUIRED');
      if (sample.provider !== 'dsh' && sample.provider !== 'fixture') throw new Error('AGENT_EXAMPLE_PROVIDER_INVALID');
      const materials: Material[] = [];
      const named = new Map<string, ArtifactRef>();
      for (const [name, material] of Object.entries(sample.materials)) {
        const content = material.mediaType.includes('json') ? JSON.stringify(material.content) : String(material.content);
        const ref = await flywheel.putArtifact(Buffer.from(content), material.mediaType);
        named.set(name, ref); materials.push({ ref, content: material.content });
      }
      // 样例用材料名称引用内联内容，先写 CAS 再构造与生产相同的受信命令。
      const bind = (value: unknown): unknown => {
        if (!value || typeof value !== 'object') return value;
        if ('material' in value) {
          const ref = named.get(String(value.material));
          if (!ref) throw new Error(`AGENT_MATERIAL_MISSING: ${value.material}`);
          return ref;
        }
        if (Array.isArray(value)) return value.map(bind);
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, bind(item)]));
      };
      const payload = bind(sample.payload) as Record<string, unknown>;
      const nodeId = nodeByAgent[role];
      const iteration = sample.iteration ?? 0;
      const generationKey = `${run.runId}:${nodeId}:${iteration}:development-v1`;
      const command: AgentCommand = { schemaVersion: '1.0', runId: run.runId, agentType: role,
        commandId: `cmd:${sha256(`${generationKey}:${JSON.stringify(payload)}`)}`, generationKey, payload };
      const snapshot = sample.provider === 'dsh' ? await evaluator.inspect(sample.scenario) : undefined;
      const prompt = await runConfiguration.resolvePrompt(run.runId, role);
      const stage: WorkflowStageInput = { runId: run.runId, nodeId, agentId: role, iteration,
        attempt: 1, maxIterations: 1, workerCount: 0, prompt, context: { snapshot, scenario: sample.scenario }, signal };
      // Fixture 只替换模型输出来源，仍执行真实角色入口、Schema 校验和结果提交。
      const model = sample.provider === 'fixture'
        ? this.dependencies.fixtureModel(sample.modelOutput ?? {}, sample.modelStages)
        : this.dependencies.model({ command, stage, scenario: sample.scenario });
      const service = new RoleExecutionService(flywheel, contracts, nodeByAgent);
      let resultRef: ArtifactRef | undefined;
      await executeDevelopmentStage(stage, { execute: async () => {
        resultRef = await service.execute({ command, nodeId, inputRefs: materials.map(({ ref }) => ref),
          input: { payload, materials, sourcePaths: sample.scenario.sourcePaths,
            publicInterfacePaths: sample.scenario.publicInterfacePaths,
            provenance: materials.map(({ ref }) => ref), moduleId: sample.scenario.moduleId },
          context: { model, command, effectivePrompt: prompt, iteration, signal },
        });
        return { detail: `${role} development output committed` };
      } }, observer);
      const result = JSON.parse(Buffer.from(await flywheel.getArtifact(resultRef!)).toString('utf8')) as AgentResult;
      const outputs = await Promise.all(result.outputRefs.map(async (ref) => ({ ref, content: Buffer.from(await flywheel.getArtifact(ref)).toString('utf8') })));
      return { schemaVersion: '1.0', kind: 'agent-development-example', runId: run.runId, role,
        provider: sample.provider, publication: 'NOT_EVALUATED', configuration, resultRef: resultRef!, result, outputs };
    } catch (error) {
      flywheel.transition(run.runId, signal?.aborted ? 'CANCELLED' : 'FAILED');
      throw error;
    }
  }
}
