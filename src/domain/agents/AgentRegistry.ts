/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义角色注册表的领域数据与确定性业务规则。
 */
import * as Orchestrator from './orchestratorAgent/OrchestratorAgent.ts';
import { definition as OrchestratorDefinition } from './orchestratorAgent/OrchestratorAgentPrompt.ts';
import * as DocWorker from './docGenAgent/subAgents/docWorkerAgent/DocWorkerAgent.ts';
import { definition as DocWorkerDefinition } from './docGenAgent/subAgents/docWorkerAgent/DocWorkerAgentPrompt.ts';
import * as DocGen from './docGenAgent/DocGenAgent.ts';
import { definition as DocGenDefinition } from './docGenAgent/DocGenAgentPrompt.ts';
import * as TestGen from './testGenAgent/TestGenAgent.ts';
import { definition as TestGenDefinition } from './testGenAgent/TestGenAgentPrompt.ts';
import * as Code from './codeAgent/CodeAgent.ts';
import { definition as CodeDefinition } from './codeAgent/CodeAgentPrompt.ts';
import * as Check from './checkAgent/CheckAgent.ts';
import { definition as CheckDefinition } from './checkAgent/CheckAgentPrompt.ts';
import * as Review from './reviewAgent/ReviewAgent.ts';
import { definition as ReviewDefinition } from './reviewAgent/ReviewAgentPrompt.ts';

// 显式注册便于审查角色接线；角色内部步骤变化不需要修改这里。
export const agents = {
  'orchestrator': Orchestrator,
  'doc-gen': DocGen,
  'test-gen': TestGen,
  'code': Code,
  'check': Check,
  'review': Review
};
// subAgent 保留执行身份与独立开发入口，但不注册为外层工作流角色。
export const subAgents = { 'doc-worker': { parentAgentId: 'doc-gen', ...DocWorker } } as const;
export const roleExecutors = { ...agents, ...subAgents };
/** 对外提供roleDefinitions，作为调用方使用的统一约定。 */
export const roleDefinitions = [OrchestratorDefinition, DocGenDefinition, DocWorkerDefinition, TestGenDefinition, CodeDefinition, CheckDefinition, ReviewDefinition];
