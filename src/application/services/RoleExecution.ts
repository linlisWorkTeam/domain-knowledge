/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：为生产与独立开发统一执行角色、保存工件并提交结果信封。
 */
import { roleExecutors } from '../../domain/agents/AgentRegistry.ts';
import type { AgentCommand, AgentResult, AgentId } from '../../domain/agents/AgentContracts.ts';
import type { ExecutionContext, RoleInput, RoleResult } from '../../domain/agents/AgentExecution.ts';
import { assertActive } from '../../domain/agents/AgentExecution.ts';
import type { TestGenContext } from '../../domain/agents/testGenAgent/TestGenAgentContract.ts';
import type { DocGenContext } from '../../domain/agents/docGenAgent/DocGenAgentContract.ts';
import type { ArtifactRef } from '../../domain/Domain.ts';
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
    input: RoleInput<Record<string, unknown>>; context: DocGenContext & TestGenContext;
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
      // 版本化命令已验证角色与 payload 的对应关系，在唯一调度边界收窄为具体角色入口。
      const execute = roleExecutors[command.agentType].execute as unknown as (
        input: RoleInput<Record<string, unknown>>, context: ExecutionContext,
      ) => Promise<RoleResult<unknown>>;
      const roleResult = await execute(input, context);
      const rawRef = await this.flywheel.putArtifact(Buffer.from(JSON.stringify(roleResult.output, null, 2)), 'application/json');
      // 先保存原始输出与角色声明的工件，再将逻辑引用替换成不可变 CAS 引用。
      const refs = new Map<string, ArtifactRef>([['raw', rawRef]]);
      for (const artifact of roleResult.artifacts) {
        if (refs.has(artifact.key)) throw new Error('AGENT_PENDING_ARTIFACT_DUPLICATED');
        refs.set(artifact.key, await this.flywheel.putArtifact(Buffer.from(artifact.content), artifact.mediaType));
      }
      // 只做通用引用绑定，不在这里维护七角色的业务分支或决定图连接。
      const bind = (value: unknown): unknown => {
        if (!value || typeof value !== 'object') return value;
        if ('agentNode' in value) return this.nodeByAgent[value.agentNode as AgentId];
        if ('agentGeneration' in value) return `${command.runId}:${this.nodeByAgent[value.agentGeneration as AgentId]}:${context.iteration}:contract-v5`;
        if ('pendingArtifact' in value) {
          const ref = refs.get(String(value.pendingArtifact));
          if (!ref) throw new Error('AGENT_PENDING_ARTIFACT_MISSING');
          return ref;
        }
        if (Array.isArray(value)) return value.map(bind);
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, bind(item)]));
      };
      const result: AgentResult = {
        schemaVersion: '1.0', commandId: command.commandId, commandRef, rawOutputRef: rawRef,
        runId: command.runId, agentType: command.agentType, status: 'SUCCEEDED',
        outputRefs: uniqueRefs([...refs.values()]), payload: bind(roleResult.payload) as Record<string, unknown>,
      };
      // 保存结果信封前再次校验对外契约，取消或失败时不能提交成功 checkpoint。
      this.contracts.assertResult(result);
      const resultRef = await this.flywheel.putArtifact(Buffer.from(JSON.stringify(result, null, 2)), 'application/json');
      assertActive(context.signal);
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
