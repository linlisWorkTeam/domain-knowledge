/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：为受控传输测试提供符合阶段契约的知识角色输出。
 */
import { taskDependencies } from '../../src/domain/agents/orchestratorAgent/OrchestratorAgentContract.ts';
import { markdownSections } from '../../src/domain/agents/docGenAgent/DocGenRevision.ts';

/** 构造限定到测试源码的固定任务计划，不改变生产图连接。 */
export function knowledgePlan(sourcePaths: string[], iteration = 0) {
  return {
    strategy: 'fixed-knowledge-flywheel-v1', iteration, parallel: ['documentation', 'test-generation'],
    tasks: Object.entries(taskDependencies).map(([role, dependsOn]) => ({
      role, dependsOn, objective: `Complete controlled ${role} verification.`,
      sourcePaths: ['doc-worker', 'doc-gen', 'test-gen'].includes(role) ? sourcePaths : [],
    })),
  };
}

/** 根据受控正文显式准备概要，用于验证真实 Adapter 的两阶段调用而非模型质量。 */
export function knowledgeOutline(document: { title: string; description: string; body: string }) {
  return {
    title: document.title, description: document.description,
    sections: markdownSections(document.body).map(({ heading }) => ({ heading, purpose: `Explain ${heading}.` })),
  };
}
