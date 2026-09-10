/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：为生产与独立开发统一执行角色、保存工件并提交结果信封。
 */
import { commitRoleArtifacts } from './RoleArtifacts.ts';
import { executeAgent } from '../../domain/services/workflow/AgentExecutionService.ts';
import type { AgentCommand, AgentId } from '../../domain/agents/AgentContracts.ts';
import type { ExecutionContext, RoleInput, StageAttempt } from '../../domain/agents/AgentExecution.ts';
import { assertActive } from '../../domain/agents/AgentExecution.ts';
import { createEvent, type ArtifactRef } from '../../domain/Domain.ts';
import type { AgentContractValidator } from '../ports/ApplicationPorts.ts';
import type { KnowledgeFlywheelService } from './ApplicationServices.ts';

/** 生产、Fixture 和独立开发共用的提交边界：角色生成内容，Application 负责持久化及信封绑定。 */
export class RoleExecutionService {
  /** 提供flywheel信息，供调用方读取或传入。 */
  readonly flywheel: KnowledgeFlywheelService;
  /** 提供contracts信息，供调用方读取或传入。 */
  readonly contracts: AgentContractValidator;
  /** 提供节点By角色信息，供调用方读取或传入。 */
  readonly nodeByAgent: Record<AgentId, string>;
  /** 注入协作依赖并初始化实例状态。 */
  constructor(flywheel: KnowledgeFlywheelService, contracts: AgentContractValidator, nodeByAgent: Record<AgentId, string>) {
    this.flywheel = flywheel; this.contracts = contracts; this.nodeByAgent = nodeByAgent;
  }
  /** 执行当前角色或业务阶段并返回结构化结果。 */
  async execute(request: {
    command: AgentCommand; nodeId: string; inputRefs: ArtifactRef[];
    input: RoleInput<Record<string, unknown>>; context: ExecutionContext;
  }): Promise<ArtifactRef> {
    const { command, context, input } = request;
    assertActive(context.signal);
    // 先校验版本化命令，再确认领域输入未在加载材料时被替换。
    this.contracts.assertCommand(command);
    if (JSON.stringify(input.payload) !== JSON.stringify(command.payload)
      || JSON.stringify(context.command) !== JSON.stringify(command)) {
      throw new Error('AGENT_RESULT_COMMAND_MISMATCH: role input must match validated command');
    }
    const commandRef = await this.flywheel.putArtifact(Buffer.from(JSON.stringify(command, null, 2)), 'application/json');
    // generationKey 保护幂等提交：已提交节点直接返回工件，不重复执行模型。
    const checkpoint = await this.flywheel.executeNode({
      runId: command.runId, nodeId: request.nodeId, generationKey: command.generationKey,
      inputRefs: uniqueRefs([...request.inputRefs, ...input.materials.map(({ ref }) => ref), commandRef]),
    }, async () => {
      const stageJournal: NonNullable<ExecutionContext['stageJournal']> = {
        read: async (stage) => {
          const latest = new Map<number, StageAttempt>();
          for (const event of this.flywheel.repository.listEvents(command.runId)) {
            const payload = event.payload;
            if (payload.kind !== 'role-stage-attempt' || payload.generationKey !== command.generationKey || payload.stage !== stage) continue;
            const bytes = await this.flywheel.getArtifact(payload.artifactRef as ArtifactRef);
            const attempt = JSON.parse(Buffer.from(bytes).toString('utf8')) as StageAttempt;
            if (attempt.schemaVersion !== 'role-stage-v1' || attempt.stage !== stage) throw new Error('AGENT_STAGE_JOURNAL_INVALID');
            latest.set(attempt.attempt, attempt);
          }
          return [...latest.values()].sort((a, b) => a.attempt - b.attempt);
        },
        record: async (attempt) => {
          const artifactRef = await this.flywheel.putArtifact(Buffer.from(JSON.stringify(attempt)), 'application/json');
          this.flywheel.repository.recordOperationalEvent(createEvent(command.runId, 'ArtifactCommitted', {
            kind: 'role-stage-attempt', generationKey: command.generationKey, agentType: command.agentType,
            stage: attempt.stage, attempt: attempt.attempt, status: attempt.status, deadlineAt: attempt.deadlineAt, artifactRef,
          }, this.flywheel.clock()));
        },
      };
      const roleResult = await executeAgent(input, { ...context, stageJournal });
      const { resultRef, rawRef } = await commitRoleArtifacts(this.flywheel.artifacts, this.contracts, command, commandRef, roleResult,
        (role) => this.nodeByAgent[role], (role) => `${command.runId}:${this.nodeByAgent[role]}:${context.iteration}:contract-v5`, context.signal);
      return [resultRef, rawRef];
    });
    const ref = checkpoint.outputRefs[0];
    if (!ref) throw new Error(`WORKFLOW_AGENT_OUTPUT_MISSING: ${request.nodeId}`);
    return ref;
  }
}
function uniqueRefs(refs: ArtifactRef[]): ArtifactRef[] {
  return [...new Map(refs.map((ref) => [ref.artifactId, ref])).values()].sort((a, b) => a.artifactId.localeCompare(b.artifactId));
}
