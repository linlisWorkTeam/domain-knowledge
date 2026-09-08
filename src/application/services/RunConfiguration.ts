/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：协调运行配置用例及其依赖的领域规则与端口。
 */
import { ROLE_EXECUTION_VERSION } from '../../domain/agents/AgentExecution.ts';
import {
  assertInvariant, createEvent, sha256,
} from '../../domain/Domain.ts';
import type {
  AgentDefinition, AgentId, ArtifactStore, FlywheelRepository,
  RunConfigurationManager, RunConfigurationSnapshot,
} from '../ports/ApplicationPorts.ts';
import { AGENT_IDS } from '../ports/ApplicationPorts.ts';

/** 对外提供标识，作为调用方使用的统一约定。 */
export const AGENT_COMMAND_SCHEMA_ID = 'https://wpknowledge.local/schemas/agent-command/v1' as const;
/** 对外提供标识，作为调用方使用的统一约定。 */
export const AGENT_RESULT_SCHEMA_ID = 'https://wpknowledge.local/schemas/agent-result/v1' as const;

/** 封装注册表运行配置服务的对外操作与协作依赖。 */
export class RegistryRunConfigurationService implements RunConfigurationManager {
  /** 提供definitions信息，供调用方读取或传入。 */
  readonly definitions: readonly AgentDefinition[];
  /** 提供仓库信息，供调用方读取或传入。 */
  readonly repository: FlywheelRepository;
  /** 提供artifacts信息，供调用方读取或传入。 */
  readonly artifacts: ArtifactStore;
  /** 提供提供方信息，供调用方读取或传入。 */
  readonly provider: RunConfigurationSnapshot['provider'];
  /** 提供 提供方Resolver 对应的提供方Resolver操作。 */
  readonly providerResolver?: () => RunConfigurationSnapshot['provider'];
  /** 提供contracts信息，供调用方读取或传入。 */
  readonly contracts: RunConfigurationSnapshot['contracts'];
  /** 提供 时钟 对应的时钟操作。 */
  readonly clock: () => string;

  /** 注入协作依赖并初始化实例状态。 */
  constructor(input: {
    definitions: readonly AgentDefinition[];
    repository: FlywheelRepository;
    artifacts: ArtifactStore;
    provider: RunConfigurationSnapshot['provider'];
    providerResolver?: () => RunConfigurationSnapshot['provider'];
    contracts: RunConfigurationSnapshot['contracts'];
    clock?: () => string;
  }) {
    assertInvariant(input.definitions.length === AGENT_IDS.length, 'run configuration requires all fixed Agents');
    assertInvariant(/^[a-f0-9]{64}$/.test(input.provider.parametersSha256), 'provider parameters digest is invalid');
    assertInvariant(/^[a-f0-9]{64}$/.test(input.contracts.commandSchemaSha256), 'command schema digest is invalid');
    assertInvariant(/^[a-f0-9]{64}$/.test(input.contracts.resultSchemaSha256), 'result schema digest is invalid');
    this.definitions = input.definitions.map((definition) => structuredClone(definition));
    this.repository = input.repository;
    this.artifacts = input.artifacts;
    this.provider = structuredClone(input.provider);
    this.providerResolver = input.providerResolver;
    this.contracts = structuredClone(input.contracts);
    this.clock = input.clock ?? (() => new Date().toISOString());
  }

  // 冻结新 Run 的 Provider、提示词和执行版本，后续 Console 修改只影响新的 Run。
  async capture(runId: string, governanceTrigger?: {
    parentRunId: string;
    causedByActionItemId: string;
    reason: string;
    feedback: string;
  }): Promise<RunConfigurationSnapshot> {
    assertInvariant(this.repository.getRun(runId) !== null, `run not found: ${runId}`);
    const existing = this.repository.getRunConfiguration(runId);
    if (existing) return existing;
    const feedback = governanceTrigger?.feedback.trim() ?? '';
    if (governanceTrigger) {
      assertInvariant(feedback.length > 0, 'ARGUMENT_REQUIRED: feedback');
      assertInvariant(this.repository.getRun(governanceTrigger.parentRunId) !== null,
        `parent run not found: ${governanceTrigger.parentRunId}`);
    }
    const feedbackRef = governanceTrigger
      ? await this.artifacts.put(Buffer.from(feedback, 'utf8'), 'text/plain; charset=utf-8')
      : null;
    const configured = new Map(
      this.repository.listAgentPromptConfigurations().map((value) => [value.agentId, value]),
    );
    const agents = [];
    for (const definition of this.definitions) {
      const configuration = configured.get(definition.agentId);
      const promptAddon = configuration?.promptAddon ?? '';
      const governanceAddon = governanceTrigger && ['doc-gen', 'review'].includes(definition.agentId)
        ? `\n\nGovernance correction feedback:\n${feedback}`
        : '';
      const effectivePrompt = `${definition.basePrompt}${promptAddon ? `\n\nOperator prompt add-on:\n${promptAddon}` : ''}${governanceAddon}`;
      const effectivePromptRef = await this.artifacts.put(
        Buffer.from(effectivePrompt, 'utf8'),
        'text/plain; charset=utf-8',
      );
      agents.push({
        agentId: definition.agentId,
        promptRevision: configuration?.revision ?? 0,
        basePromptSha256: sha256(definition.basePrompt),
        promptAddonSha256: sha256(promptAddon),
        effectivePromptSha256: sha256(effectivePrompt),
        effectivePromptRef,
        tools: [...definition.tools],
      });
    }
    const capturedAt = this.clock();
    const snapshot: RunConfigurationSnapshot = {
      schemaVersion: '1.0',
      roleExecutionVersion: ROLE_EXECUTION_VERSION,
      runId,
      provider: structuredClone(this.currentProvider()),
      contracts: structuredClone(this.contracts),
      agents,
      governanceTrigger: governanceTrigger && feedbackRef ? {
        parentRunId: governanceTrigger.parentRunId,
        causedByActionItemId: governanceTrigger.causedByActionItemId,
        reasonSha256: sha256(governanceTrigger.reason.trim()),
        feedbackRef,
      } : null,
      capturedAt,
    };
    return this.repository.saveRunConfiguration(snapshot, createEvent(
      runId,
      'RunConfigurationCaptured',
      {
        provider: snapshot.provider,
        contracts: snapshot.contracts,
        agentRevisions: Object.fromEntries(snapshot.agents.map((agent) => [agent.agentId, agent.promptRevision])),
        governanceTrigger: snapshot.governanceTrigger ?? null,
      },
      capturedAt,
    ));
  }

  /** 读取请求。 */
  get(runId: string): RunConfigurationSnapshot | null {
    return this.repository.getRunConfiguration(runId);
  }

  /** 检查冻结配置是否允许恢复执行。 */
  async assertCompatible(runId: string): Promise<RunConfigurationSnapshot> {
    return this.assertSnapshotCompatible(runId, true);
  }

  private async assertSnapshotCompatible(runId: string, checkProvider: boolean): Promise<RunConfigurationSnapshot> {
    const snapshot = this.repository.getRunConfiguration(runId);
    assertInvariant(snapshot !== null, `run configuration not found: ${runId}`);
    // 历史数据仍可读取；只有执行和恢复入口要求版本一致，不迁移旧 checkpoint。
    if (snapshot.roleExecutionVersion !== ROLE_EXECUTION_VERSION) throw new Error('RUN_CONFIGURATION_INCOMPATIBLE: role execution version changed; historical Run is read-only');
    if (snapshot.provider.kind === 'pi-agent') throw new Error('RUN_CONFIGURATION_INCOMPATIBLE: legacy Pi Run is read-only');
    if (checkProvider) assertInvariant(JSON.stringify(snapshot.provider) === JSON.stringify(this.currentProvider()),
      `run provider configuration changed: ${runId}`);
    assertInvariant(JSON.stringify(snapshot.contracts) === JSON.stringify(this.contracts),
      `run schema configuration changed: ${runId}`);
    assertInvariant(snapshot.agents.length === this.definitions.length,
      `run Agent configuration changed: ${runId}`);
    for (const definition of this.definitions) {
      const frozen = snapshot.agents.find((candidate) => candidate.agentId === definition.agentId);
      assertInvariant(frozen !== undefined, `run configuration missing Agent: ${definition.agentId}`);
      assertInvariant(frozen.basePromptSha256 === sha256(definition.basePrompt),
        `run base prompt changed: ${definition.agentId}`);
      assertInvariant(JSON.stringify(frozen.tools) === JSON.stringify(definition.tools),
        `run Agent tools changed: ${definition.agentId}`);
      assertInvariant(await this.artifacts.verify(frozen.effectivePromptRef),
        `frozen prompt artifact is corrupt: ${definition.agentId}`);
    }
    return snapshot;
  }

  /** 读取当前运行冻结的有效提示词。 */
  async resolvePrompt(runId: string, agentId: AgentId): Promise<string> {
    const snapshot = await this.assertSnapshotCompatible(runId, false);
    const agent = snapshot.agents.find((candidate) => candidate.agentId === agentId);
    assertInvariant(agent !== undefined, `run configuration missing Agent: ${agentId}`);
    assertInvariant(await this.artifacts.verify(agent.effectivePromptRef), `frozen prompt artifact is corrupt: ${agentId}`);
    const prompt = Buffer.from(await this.artifacts.get(agent.effectivePromptRef)).toString('utf8');
    assertInvariant(sha256(prompt) === agent.effectivePromptSha256, `frozen prompt digest mismatch: ${agentId}`);
    return prompt;
  }

  private currentProvider(): RunConfigurationSnapshot['provider'] {
    const provider = this.providerResolver?.() ?? this.provider;
    assertInvariant(/^[a-f0-9]{64}$/.test(provider.parametersSha256), 'provider parameters digest is invalid');
    return provider;
  }
}
