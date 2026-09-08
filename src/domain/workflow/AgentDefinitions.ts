/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义业务工作流角色与节点的绑定，复用各角色拥有的职责及提示词。
 */
import type { AgentId } from '../agents/AgentContracts.ts';

/** 领域工作流使用的角色说明与节点绑定信息。 */
export interface AgentDefinition {
  /** 提供角色标识信息，供调用方读取或传入。 */
  agentId: AgentId;
  /** 提供节点标识信息，供调用方读取或传入。 */
  nodeId: string;
  /** 角色在 Console 展示的名称。 */
  displayName: string;
  /** 角色职责说明。 */
  responsibility: string;
  /** 提供基础提示词信息，供调用方读取或传入。 */
  basePrompt: string;
  /** 提供输入契约信息，供调用方读取或传入。 */
  inputContract: string[];
  /** 提供输出契约信息，供调用方读取或传入。 */
  outputContract: string[];
  /** 提供工具信息，供调用方读取或传入。 */
  tools: string[];
  /** 允许 Console 调整的字段，仅限提示词追加内容。 */
  customizableFields: readonly ['promptAddon'];
}


import { roleDefinitions } from '../agents/AgentRegistry.ts';
/** 固定角色到业务节点的显式绑定。 */
export const NODE_BY_AGENT: Record<AgentId, string> = { orchestrator: 'orchestrator', 'doc-worker': 'doc_worker', 'doc-gen': 'doc_gen', 'test-gen': 'test_gen', code: 'code', check: 'check', review: 'review' };
/** 供运行配置和 Console 使用的七角色目录。 */
export const DOMAIN_KNOWLEDGE_AGENT_DEFINITIONS: AgentDefinition[] = roleDefinitions.map((definition) => ({ ...definition, tools: [...definition.tools], inputContract: [...definition.inputContract], outputContract: [...definition.outputContract], nodeId: NODE_BY_AGENT[definition.agentId] }));
/** 按固定角色标识读取业务定义，未知角色立即报错。 */
export function agentDefinition(agentId: AgentId): AgentDefinition {
 const definition = DOMAIN_KNOWLEDGE_AGENT_DEFINITIONS.find((entry) => entry.agentId === agentId);
 if (!definition) throw new Error(`Unknown fixed Agent: ${agentId}`);
 return definition;
}
