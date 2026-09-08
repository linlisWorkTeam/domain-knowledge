/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：协调工作流Control用例及其依赖的领域规则与端口。
 */
import { createEvent, assertInvariant } from '../../domain/Domain.ts';
import type {
  AgentDefinition,
  AgentId,
  AgentPromptConfiguration,
  FlywheelRepository,
  WorkflowNodeProjection,
  WorkflowObserver,
} from '../ports/ApplicationPorts.ts';
import { AGENT_IDS } from '../ports/ApplicationPorts.ts';

/** 对外提供LENGTH，作为调用方使用的统一约定。 */
export const MAX_PROMPT_ADDON_LENGTH = 4_000;

/** 封装角色Catalog服务的对外操作与协作依赖。 */
export class AgentCatalogService {
  /** 提供definitions信息，供调用方读取或传入。 */
  readonly definitions: readonly AgentDefinition[];
  /** 提供仓库信息，供调用方读取或传入。 */
  readonly repository: FlywheelRepository;
  /** 提供 时钟 对应的时钟操作。 */
  readonly clock: () => string;

  /** 注入协作依赖并初始化实例状态。 */
  constructor(input: {
    definitions: readonly AgentDefinition[];
    repository: FlywheelRepository;
    clock?: () => string;
  }) {
    assertInvariant(input.definitions.length === AGENT_IDS.length, 'all fixed Agent definitions are required');
    const ids = new Set(input.definitions.map((definition) => definition.agentId));
    for (const agentId of AGENT_IDS) assertInvariant(ids.has(agentId), `missing Agent definition: ${agentId}`);
    this.definitions = input.definitions.map((definition) => structuredClone(definition));
    this.repository = input.repository;
    this.clock = input.clock ?? (() => new Date().toISOString());
  }

  /** 列出请求。 */
  list(): Array<AgentDefinition & { configuration: AgentPromptConfiguration }> {
    const configurations = new Map(
      this.repository.listAgentPromptConfigurations().map((configuration) => [configuration.agentId, configuration]),
    );
    return this.definitions.map((definition) => ({
      ...structuredClone(definition),
      configuration: configurations.get(definition.agentId) ?? {
        agentId: definition.agentId,
        promptAddon: '',
        revision: 0,
        updatedAt: null,
      },
    }));
  }

  /** 读取提示词Addon。 */
  getPromptAddon(agentId: AgentId): string {
    this.requireDefinition(agentId);
    return this.repository.listAgentPromptConfigurations()
      .find((configuration) => configuration.agentId === agentId)?.promptAddon ?? '';
  }

  /** 更新提示词Addon。 */
  updatePromptAddon(agentId: AgentId, promptAddon: string): AgentPromptConfiguration {
    this.requireDefinition(agentId);
    assertInvariant(typeof promptAddon === 'string', 'promptAddon must be a string');
    assertInvariant(promptAddon.length <= MAX_PROMPT_ADDON_LENGTH, `promptAddon exceeds ${MAX_PROMPT_ADDON_LENGTH} characters`);
    assertInvariant(!promptAddon.includes('\0'), 'promptAddon contains a forbidden null character');
    const existing = this.repository.listAgentPromptConfigurations()
      .find((configuration) => configuration.agentId === agentId);
    const now = this.clock();
    const configuration: AgentPromptConfiguration = {
      agentId,
      promptAddon: promptAddon.trim(),
      revision: (existing?.revision ?? 0) + 1,
      updatedAt: now,
    };
    return this.repository.saveAgentPromptConfiguration(configuration, createEvent(
      `agent-config:${agentId}`,
      'AgentPromptConfigured',
      { agentId, revision: configuration.revision, promptLength: configuration.promptAddon.length },
      now,
    ));
  }

  private requireDefinition(agentId: string): AgentDefinition {
    const definition = this.definitions.find((candidate) => candidate.agentId === agentId);
    assertInvariant(definition !== undefined, `unknown Agent: ${agentId}`);
    return definition;
  }
}

/** 封装注册表工作流观察器的对外操作与协作依赖。 */
export class RegistryWorkflowObserver implements WorkflowObserver {
  /** 提供仓库信息，供调用方读取或传入。 */
  readonly repository: FlywheelRepository;
  /** 提供 时钟 对应的时钟操作。 */
  readonly clock: () => string;

  /** 注入协作依赖并初始化实例状态。 */
  constructor(repository: FlywheelRepository, clock: () => string = () => new Date().toISOString()) {
    this.repository = repository;
    this.clock = clock;
  }

  /** 记录请求。 */
  record(projection: WorkflowNodeProjection): void {
    const now = this.clock();
    this.repository.recordWorkflowNodeProjection({ ...projection, updatedAt: now }, createEvent(
      projection.runId,
      'WorkflowNodeStateChanged',
      {
        nodeId: projection.nodeId,
        agentId: projection.agentId,
        status: projection.status,
        iteration: projection.iteration,
        attempt: projection.attempt,
      },
      now,
    ));
  }

  /** 提供 next尝试次数 对应的next尝试次数操作。 */
  nextAttempt(runId: string, nodeId: string, iteration: number): number {
    const attempts = this.repository.listWorkflowNodeProjections(runId)
      .filter((projection) => projection.nodeId === nodeId && projection.iteration === iteration)
      .map((projection) => projection.attempt);
    return Math.max(0, ...attempts) + 1;
  }
}
