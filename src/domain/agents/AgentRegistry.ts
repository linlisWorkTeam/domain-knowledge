/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义角色注册表的领域数据与确定性业务规则。
 */
import * as Orchestrator from './OrchestratorAgent/OrchestratorAgent.ts';
import { definition as OrchestratorDefinition } from './OrchestratorAgent/OrchestratorAgentPrompt.ts';
import * as DocWorker from './DocWorkerAgent/DocWorkerAgent.ts';
import { definition as DocWorkerDefinition } from './DocWorkerAgent/DocWorkerAgentPrompt.ts';
import * as DocGen from './DocGenAgent/DocGenAgent.ts';
import { definition as DocGenDefinition } from './DocGenAgent/DocGenAgentPrompt.ts';
import * as TestGen from './TestGenAgent/TestGenAgent.ts';
import { definition as TestGenDefinition } from './TestGenAgent/TestGenAgentPrompt.ts';
import * as Code from './CodeAgent/CodeAgent.ts';
import { definition as CodeDefinition } from './CodeAgent/CodeAgentPrompt.ts';
import * as Check from './CheckAgent/CheckAgent.ts';
import { definition as CheckDefinition } from './CheckAgent/CheckAgentPrompt.ts';
import * as Review from './ReviewAgent/ReviewAgent.ts';
import { definition as ReviewDefinition } from './ReviewAgent/ReviewAgentPrompt.ts';

// 显式注册便于审查角色接线；角色内部步骤变化不需要修改这里。
export const agents = {
  'orchestrator': Orchestrator,
  'doc-worker': DocWorker,
  'doc-gen': DocGen,
  'test-gen': TestGen,
  'code': Code,
  'check': Check,
  'review': Review
};
/** 对外提供roleDefinitions，作为调用方使用的统一约定。 */
export const roleDefinitions = [OrchestratorDefinition, DocGenDefinition, DocWorkerDefinition, TestGenDefinition, CodeDefinition, CheckDefinition, ReviewDefinition];
