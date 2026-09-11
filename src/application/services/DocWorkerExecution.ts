/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：提交 DocGen 内部子任务，保存独立命令、片段和执行记录。
 */
import { scopedWorkerSource } from '../../domain/agents/docGenAgent/subAgents/docWorkerAgent/WorkerMaterials.ts';
import { sha256, type ArtifactRef } from '../../domain/Domain.ts';
import type { AgentCommand, AgentId, AgentResult } from '../../domain/agents/AgentContracts.ts';
import { materialsFor, type ModelExecutionPort } from '../../domain/agents/AgentExecution.ts';
import type { Input, DocWorkerExecutionPort, DocWorkerTask, DocWorkerFragment } from '../../domain/agents/docGenAgent/DocGenAgentContract.ts';
import type { AgentContractValidator, RunConfigurationManager, TaskBatchRunner, WorkflowObserver, WorkflowStageInput } from '../ports/ApplicationPorts.ts';
import type { KnowledgeFlywheelService } from './ApplicationServices.ts';
import { RoleExecutionService } from './RoleExecution.ts';
import { executeDevelopmentStage } from './AgentDevelopmentObserver.ts';

/** Domain 提供拆分任务；Application 只绑定材料、执行身份与提交事务。 */
export class DocWorkerExecutionService implements DocWorkerExecutionPort {
  readonly dependencies: {
    parent: Input; stage: WorkflowStageInput; flywheel: KnowledgeFlywheelService;
    contracts: AgentContractValidator; nodeByAgent: Record<AgentId, string>;
    prompts: Pick<RunConfigurationManager, 'resolvePrompt'>; observer: WorkflowObserver; tasks: TaskBatchRunner;
    model: (command: AgentCommand, stage: WorkflowStageInput) => ModelExecutionPort;
  };
  constructor(dependencies: DocWorkerExecutionService['dependencies']) { this.dependencies = dependencies; }

  async run(tasks: DocWorkerTask[], signal?: AbortSignal): Promise<DocWorkerFragment[]> {
    const { parent, stage, flywheel, contracts, nodeByAgent, prompts, observer } = this.dependencies;
    if (stage.agentId !== 'doc-gen') throw new Error('SUBAGENT_PARENT_DENIED');
    const paths = new Set(parent.sourcePaths);
    if (tasks.length > 5 || new Set(tasks.map((task) => task.workerId)).size !== tasks.length
      || tasks.some((task) => !/^worker-[1-5]$/.test(task.workerId) || !task.sourcePaths.length
        || task.sourcePaths.some((path) => !paths.has(path)))) throw new Error('SUBAGENT_TASK_INVALID');
    const prompt = await prompts.resolvePrompt(stage.runId, 'doc-worker');
    return this.dependencies.tasks.run(tasks.map((task) => async (taskSignal) => {
      const parentSources = materialsFor({ sourceRefs: parent.payload.sourceRefs, publicInterfaceRefs: parent.payload.publicInterfaceRefs }, parent.materials);
      const scoped = await Promise.all([task.sourcePaths, parent.publicInterfacePaths].map(async (paths) => {
        const content = scopedWorkerSource(parentSources, paths);
        const ref = await flywheel.putArtifact(Buffer.from(JSON.stringify(content)), 'application/json');
        return { ref, content };
      }));
      const payload = { moduleId: parent.moduleId, sourceRefs: [scoped[0]!.ref],
        publicInterfaceRefs: [scoped[1]!.ref], assignedSourcePaths: task.sourcePaths };
      // 同一 Run 的固定源码任务跨正文修订复用；任务范围或冻结提示词变化产生不同提交键。
      const generationKey = `${stage.runId}:doc_gen/doc_worker:${task.workerId}:${sha256(JSON.stringify({ payload, prompt }))}:subagent-v3`;
      const command: AgentCommand = { schemaVersion: '1.0', runId: stage.runId, agentType: 'doc-worker',
        generationKey, commandId: `cmd:${sha256(`${generationKey}:${JSON.stringify(payload)}`)}`, payload };
      const nodeId = `${nodeByAgent['doc-worker']}:${task.workerId}`;
      const childStage: WorkflowStageInput = { ...stage, nodeId, agentId: 'doc-worker', workerId: task.workerId,
        attempt: observer.nextAttempt?.(stage.runId, nodeId, stage.iteration) ?? 1, prompt, signal: taskSignal };
      const materials = scoped;
      const service = new RoleExecutionService(flywheel, contracts, nodeByAgent);
      let resultRef!: ArtifactRef;
      await executeDevelopmentStage(childStage, { execute: async () => {
        resultRef = await service.execute({ command, nodeId, inputRefs: materials.map(({ ref }) => ref),
          input: { payload, materials, sourcePaths: task.sourcePaths, publicInterfacePaths: parent.publicInterfacePaths,
            provenance: scoped.map(({ref}) => ref), moduleId: parent.moduleId },
          context: { model: this.dependencies.model(command, childStage), command, effectivePrompt: prompt,
            iteration: stage.iteration, signal: taskSignal },
        });
        return { detail: `DocGen subAgent ${task.workerId} committed` };
      } }, observer, 'DocGen internal source analysis');
      const result = JSON.parse(Buffer.from(await flywheel.getArtifact(resultRef)).toString('utf8')) as AgentResult;
      contracts.assertResult(result);
      if (result.runId !== command.runId || result.agentType !== 'doc-worker' || result.commandId !== command.commandId
        || result.status !== 'SUCCEEDED') throw new Error('SUBAGENT_RESULT_MISMATCH');
      const ref = result.payload['chunkRef'] as ArtifactRef;
      if (!ref || !result.outputRefs.some((output) => output.artifactId === ref.artifactId)) throw new Error('SUBAGENT_CHUNK_MISSING');
      const content = Buffer.from(await flywheel.getArtifact(ref)).toString('utf8');
      return { workerId: task.workerId, resultRef, material: { ref, content },
        unresolvedRisks: result.payload['unresolvedRisks'] as string[] ?? [] };
    }), signal);
  }
}
