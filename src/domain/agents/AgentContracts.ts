/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义domain的输入输出契约、输出 Schema 与材料校验。
 */
import type { ArtifactRef } from '../Domain.ts';

// 业务角色标识用于版本化信封和历史记录；文件改名不改变这些对外标识。
export const AGENT_IDS = [
  'orchestrator', 'doc-gen', 'doc-worker', 'test-gen', 'code', 'check', 'review',
] as const;

/** 角色标识。 */
export type AgentId = typeof AGENT_IDS[number];

/** 角色命令。 */
export interface AgentCommand {
  /** 提供Schema版本信息，供调用方读取或传入。 */
  schemaVersion: '1.0';
  /** 提供命令标识信息，供调用方读取或传入。 */
  commandId: string;
  /** 提供运行标识信息，供调用方读取或传入。 */
  runId: string;
  /** 提供角色类型信息，供调用方读取或传入。 */
  agentType: AgentId;
  /** 提供生成键信息，供调用方读取或传入。 */
  generationKey: string;
  /** 提供业务载荷信息，供调用方读取或传入。 */
  payload: Record<string, unknown>;
}

/** 角色结果。 */
export interface AgentResult {
  /** 提供Schema版本信息，供调用方读取或传入。 */
  schemaVersion: '1.0';
  /** 提供命令标识信息，供调用方读取或传入。 */
  commandId: string;
  /** 提供命令引用信息，供调用方读取或传入。 */
  commandRef: ArtifactRef;
  /** 提供运行标识信息，供调用方读取或传入。 */
  runId: string;
  /** 提供角色类型信息，供调用方读取或传入。 */
  agentType: AgentId;
  /** 提供状态信息，供调用方读取或传入。 */
  status: 'SUCCEEDED' | 'FAILED';
  /** 提供输出引用列表信息，供调用方读取或传入。 */
  outputRefs: ArtifactRef[];
  /** 提供业务载荷信息，供调用方读取或传入。 */
  payload: Record<string, unknown>;
}
