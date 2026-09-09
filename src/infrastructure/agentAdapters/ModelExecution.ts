/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：将领域模型请求映射到 Provider、隔离工作区和授权工具。
 */
import Ajv2020Import from 'ajv/dist/2020.js';
import { modelProcessLane } from './ModelProcessLane.ts';
import type { ModelExecutionPort, ModelRequest } from '../../domain/agents/AgentExecution.ts';
import type { AgentWorkspaceProvider, ProjectSnapshot } from '../../application/ports/ApplicationPorts.ts';
import type { ProjectWorkflowStages } from '../../application/services/AutomatedProjectWorkflow.ts';

const Ajv2020 = Ajv2020Import as unknown as new (options: Record<string, unknown>) => {
  compile(schema: Record<string, unknown>): { (value: unknown): boolean; errors?: unknown };
  errorsText(errors: unknown): string;
};
/** 按输出 Schema 校验模型返回值。 */
export function assertModelOutput(output: unknown, schema: Record<string, unknown>): void {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  if (!validate(output)) throw new Error(`AGENT_OUTPUT_INVALID: ${ajv.errorsText(validate.errors)}`);
}

/** 把领域请求映射到现有 Provider；重试、会话隔离、超时、取消和审计仍由 Provider 负责。 */
export function modelExecutionFactory(workspaces: AgentWorkspaceProvider): ProjectWorkflowStages['modelFactory'] {
  return ({ provider, command, stage, scenario }): ModelExecutionPort => ({
    assertOutput: assertModelOutput,
    async execute(request: ModelRequest, signal?: AbortSignal) {
      if (!provider) throw new Error('WORKFLOW_LIVE_AGENT_UNAVAILABLE');
      if (request.role !== command.agentType) throw new Error('AGENT_RESULT_ROLE_MISMATCH');
      if (request.role === 'code' && request.readablePaths.some((path) => scenario.sourcePaths.includes(path))) {
        throw new Error('AGENT_SOURCE_ACCESS_DENIED');
      }
      if (request.tools.some((tool) => tool !== 'read_material')) throw new Error('AGENT_CAPABILITY_DENIED');
      const snapshot = stage.context.snapshot as ProjectSnapshot | undefined;
      if (!snapshot) throw new Error('WORKFLOW_PROJECT_SNAPSHOT_MISSING');
      // 工作区来自受信源码提交和角色声明的可读路径，模型输出不能扩大可见范围。
      const workspace = await workspaces.materialize({
        isolationKey: `${stage.runId}:${stage.nodeId}:${stage.iteration}:${stage.workerId ?? 'main'}:${request.stage ?? 'execute'}`,
        role: request.role, sourceRoot: scenario.repositoryRoot, sourceCommit: snapshot.commit,
        readablePaths: request.readablePaths,
      });
      // 保持原命令、幂等键和关联信息，便于把 Adapter 轨迹追溯到同一次角色执行。
      return modelProcessLane.execute(() => provider.run({ maxTokens: request.maxTokens, authorizedTools: request.tools, role: request.role, prompt: request.prompt, outputSchema: request.outputSchema,
        idempotencyKey: `${command.generationKey}:${request.stage ?? 'execute'}`, command,
        inputRefs: artifactRefs(command.payload), workspaceRoot: workspace.workspaceRoot,
        metadata: { runId: stage.runId, nodeId: stage.nodeId, iteration: stage.iteration,
          attempt: stage.attempt, workerId: stage.workerId ?? null, commandId: command.commandId,
          stage: request.stage ?? 'execute' },
      }, signal), signal);
    },
  });
}
function artifactRefs(value: unknown): import('../../domain/Domain.ts').ArtifactRef[] {
  if (!value || typeof value !== 'object') return [];
  if ('artifactId' in value && 'sha256' in value && 'mediaType' in value && 'size' in value) return [value as import('../../domain/Domain.ts').ArtifactRef];
  return Object.values(value).flatMap(artifactRefs);
}
