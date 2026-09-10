/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：在固定工作台阶段内提交现有角色，保留模型用量和成功结果检查点。
 */
import { sha256, type ArtifactRef } from '../../domain/Domain.ts';
import type { AgentCommand, AgentId } from '../../domain/agents/AgentContracts.ts';
import type { RoleInput } from '../../domain/agents/AgentExecution.ts';
import { executeAgent } from '../../domain/services/workflow/AgentExecutionService.ts';
import type { ArtifactStore, AgentContractValidator } from '../ports/ApplicationPorts.ts';
import type { StageModelConfiguration, StageModelFactory } from '../ports/WorkbenchGenerationPorts.ts';
import type { StageExecutionContext } from './WorkbenchStages.ts';
import { commitRoleArtifacts } from './RoleArtifacts.ts';
export class WorkbenchRoleExecution {
  readonly dependencies: { artifacts: ArtifactStore; contracts: AgentContractValidator; model: StageModelFactory };
  constructor(dependencies: WorkbenchRoleExecution['dependencies']) { this.dependencies = dependencies; }
  async execute(context: StageExecutionContext, configuration: StageModelConfiguration, role: AgentId,
    key: string, input: RoleInput<Record<string, unknown>>) {
    const { artifacts, contracts, model } = this.dependencies;
    const result = await context.step(`role:${role}:${key}`, async (idempotencyKey) => {
      // 已成功子步骤直接复用；实际重试使用新会话，消耗仍累计在原任务。
      const generationKey = `${idempotencyKey}:attempt:${context.task.attempt}`;
      const command: AgentCommand = { schemaVersion: '1.0', runId: context.task.taskId, commandId: `cmd-${sha256(generationKey)}`,
        agentType: role, generationKey, payload: input.payload };
      contracts.assertCommand(command);
      const prompt = configuration.agents.find((agent) => agent.agentId === role);
      if (!prompt || !await artifacts.verify(prompt.effectivePromptRef)) throw new Error('RUN_CONFIGURATION_INCOMPATIBLE');
      const effectivePrompt = Buffer.from(await artifacts.get(prompt.effectivePromptRef)).toString('utf8');
      if (sha256(effectivePrompt) !== prompt.effectivePromptSha256) throw new Error('STAGE_ARTIFACT_CORRUPT');
      const commandRef = await artifacts.put(Buffer.from(JSON.stringify(command)), 'application/json');
      context.progress({ phase: 'role-command', role, key, attempt: context.task.attempt, commandRef: JSON.parse(JSON.stringify(commandRef)) });
      const underlying = model(command, configuration, (operationId, tokens) => {
        if (tokens !== null) context.account(`provider:${operationId}`, { tokens });
        context.progress({ phase: 'usage', role, tokensReported: tokens !== null });
      });
      const started = performance.now();
      const output = await executeAgent(input, { command, effectivePrompt, iteration: 0, signal: context.signal,
        now: () => context.task.usage.elapsedMs + Math.floor(performance.now() - started),
        model: { assertOutput: (value, schema) => underlying.assertOutput(value, schema), execute: async (request, signal) => {
          context.account(`${role}:${key}:${request.stage}`, { modelCalls: 1, reservedTokens: Buffer.byteLength(request.prompt) + (request.maxTokens ?? 32768) + 4096 });
          return underlying.execute(request, signal);
        } } });
      const committed = await commitRoleArtifacts(artifacts, contracts, command, commandRef, output, (agent) => agent,
        () => { throw new Error('WORKBENCH_AGENT_GENERATION_UNBOUND'); }, context.signal);
      return { artifactRefs: [committed.resultRef, committed.rawRef], summary: { role, resultRef: JSON.parse(JSON.stringify(committed.resultRef)) } };
    });
    const rawRef = result.artifactRefs[1] as ArtifactRef;
    if (!rawRef || !await artifacts.verify(rawRef)) throw new Error('STAGE_ARTIFACT_CORRUPT');
    return { output: JSON.parse(Buffer.from(await artifacts.get(rawRef)).toString('utf8')) as Record<string, unknown>,
      resultRef: result.artifactRefs[0]!, rawRef };
  }
}
