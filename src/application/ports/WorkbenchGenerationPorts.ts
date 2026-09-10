/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义阶段冻结的模型配置与只使用内联工件的角色模型端口。
 */
import type { RunConfigurationSnapshot } from './ApplicationPorts.ts';
import type { AgentCommand } from '../../domain/agents/AgentContracts.ts';
import type { ModelExecutionPort } from '../../domain/agents/AgentExecution.ts';
export interface StageModelConfiguration extends Pick<RunConfigurationSnapshot, 'provider' | 'contracts' | 'agents'> {
  schemaVersion: 'workbench-model-v1'; roleExecutionVersion: string;
  policy: { maxProviderRequests: 1; maxSchemaAttempts: 1; clock: 'stage-active-v1'; resumeOperationalFailures: true };
}
export interface StageConfigurationProvider {
  captureStage(): Promise<StageModelConfiguration>;
  assertStageCompatible(configuration: StageModelConfiguration): Promise<void>;
}
export type StageModelFactory = (command: AgentCommand, configuration: StageModelConfiguration,
  onUsage: (operationId: string, tokens: number | null) => void) => ModelExecutionPort;
