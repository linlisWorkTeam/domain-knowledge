/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义角色执行的领域数据与确定性业务规则。
 */
import type { ArtifactRef } from '../Domain.ts';
import type { AgentCommand, AgentId } from './AgentContracts.ts';

// 执行语义改变时更新版本，阻止旧 checkpoint 在不同角色实现下继续运行。
export const ROLE_EXECUTION_VERSION = 'seven-role-mvp-v3';
/** 受信材料。 */
export interface Material { ref: ArtifactRef; content: unknown }
/** Application 已加载并校验的角色材料；不包含通用工作流状态或存储实现。 */
export interface RoleInput<P> {
  /** 提供业务载荷信息，供调用方读取或传入。 */
  payload: P;
  /** 提供materials信息，供调用方读取或传入。 */
  materials: Material[];
  /** 提供源码路径列表信息，供调用方读取或传入。 */
  sourcePaths: string[];
  /** 提供publicInterface路径列表信息，供调用方读取或传入。 */
  publicInterfacePaths: string[];
  /** 提供来源证据信息，供调用方读取或传入。 */
  provenance: ArtifactRef[];
  /** 提供模块标识信息，供调用方读取或传入。 */
  moduleId: string;
}
/** 模型请求。 */
export interface ModelRequest {
  /** 当前阶段的输出上限；只能收紧 Provider 的配置上限。 */
  maxTokens?: number;
  /** 业务阶段参与会话和幂等键，概要与正文不得共用模型会话。 */
  stage?: string;
  /** 提供role信息，供调用方读取或传入。 */
  role: AgentId;
  /** 提供提示词信息，供调用方读取或传入。 */
  prompt: string;
  /** 提供输出Schema信息，供调用方读取或传入。 */
  outputSchema: Record<string, unknown>;
  /** 提供工具信息，供调用方读取或传入。 */
  tools: readonly string[];
  /** 提供确定本角色允许读取的文件路径信息，供调用方读取或传入。 */
  readablePaths: string[];
}
/** 模型运行 Port：Adapter 负责格式重试；角色只对显式可修正的语义问题反馈，二者共享阶段信号和截止时间。 */
export interface ModelExecutionPort {
  /** 执行当前角色或业务阶段并返回结构化结果。 */
  execute(request: ModelRequest, signal?: AbortSignal): Promise<Record<string, unknown>>;
  /** 校验角色输出。 */
  assertOutput(output: unknown, schema: Record<string, unknown>): void;
}
/** 执行上下文。 */
export interface ExecutionContext {
  /** Application 保存阶段尝试，包括失败；同版本恢复使用同一记录。 */
  stageJournal?: {
    read(stage: string): Promise<StageAttempt[]>;
    record(attempt: StageAttempt): Promise<void>;
  };
  /** 提供模型信息，供调用方读取或传入。 */
  model: ModelExecutionPort;
  /** 提供命令信息，供调用方读取或传入。 */
  command: AgentCommand;
  /** 提供生效提示词信息，供调用方读取或传入。 */
  effectivePrompt: string;
  /** 提供轮次信息，供调用方读取或传入。 */
  iteration: number;
  /** 提供取消信号信息，供调用方读取或传入。 */
  signal?: AbortSignal;
}
/** 阶段审计原文只保存在本地工件中，失败记录不能晋升为角色成功结果。 */
export interface StageAttempt {
  schemaVersion: 'role-stage-v1';
  stage: string;
  attempt: number;
  startedAt: number;
  status: 'STARTED' | 'PASSED' | 'REJECTED' | 'FAILED';
  output?: Record<string, unknown>;
  issue?: { code: string; field: string; hint: string };
}
/** 待保存工件只有内容和逻辑名称，Domain 不创建 CAS 引用或操作文件系统。 */
export interface PendingArtifact { key: string; content: string; mediaType: string }
/** 角色输出。 */
export interface RoleResult<O> { output: O; payload: Record<string, unknown>; artifacts: PendingArtifact[] }
/** 声明等待 Application 绑定的工件引用。 */
export function pending(key: string) { return { pendingArtifact: key }; }
/** 检查取消信号并阻止继续执行。 */
export function assertActive(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('AGENT_CANCELLED');
}
/** 同时校验必需字段与实际加载的工件，只有引用但没有正文也应立即失败。 */
export function requireMaterials(payload: object, materials: Material[], required: string[]): void {
  for (const field of required) {
    const value = (payload as Record<string, unknown>)[field];
    if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) {
      throw new Error(`AGENT_COMMAND_INPUT_MISSING: ${field}`);
    }
  }
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if ('artifactId' in value) {
      if (!materials.some(({ ref }) => ref.artifactId === value.artifactId)) {
        throw new Error('AGENT_MATERIAL_MISSING');
      }
      return;
    }
    Object.values(value).forEach(visit);
  };
  visit(payload);
}

/** Prompt 只展示角色契约引用的工件，防止调用方附带的其他角色材料泄漏。 */
export function materialsFor(payload: object, materials: Material[]): Material[] {
  const ids = new Set<unknown>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if ('artifactId' in value) { ids.add(value.artifactId); return; }
    Object.values(value).forEach(visit);
  };
  visit(payload);
  return materials.filter(({ ref }) => ids.has(ref.artifactId));
}
