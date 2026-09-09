/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：协调Orchestrator用例及其依赖的领域规则与端口。
 */
import { presentRunExecution } from '../services/RunExecutionPresentation.ts';
import type { AgentId, DemoReportBuilder, RunConfigurationManager } from '../ports/ApplicationPorts.ts';
import type {
  AgentCatalogService, AutomatedProjectWorkflowService,
} from '../services/ApplicationServices.ts';

/**
 * Application facade for workflow coordination and operator-facing Agent control.
 * Infrastructure is resolved lazily so read-only Agent catalog calls do not start LangGraph.
 */
/** 封装Orchestrator的对外操作与协作依赖。 */
export class Orchestrator {
  /** 提供 workflow 对应的workflow操作。 */
  readonly workflow: () => Promise<AutomatedProjectWorkflowService>;
  /** 提供agents信息，供调用方读取或传入。 */
  readonly agents: AgentCatalogService;
  /** 提供reports信息，供调用方读取或传入。 */
  readonly reports: DemoReportBuilder;
  /** 提供运行配置信息，供调用方读取或传入。 */
  readonly runConfiguration: RunConfigurationManager;

  /** 注入协作依赖并初始化实例状态。 */
  constructor(input: {
    workflow: () => Promise<AutomatedProjectWorkflowService>;
    agents: AgentCatalogService;
    reports: DemoReportBuilder;
    runConfiguration: RunConfigurationManager;
  }) {
    this.workflow = input.workflow;
    this.agents = input.agents;
    this.reports = input.reports;
    this.runConfiguration = input.runConfiguration;
  }

  /** 启动请求。 */
  async start(...args: Parameters<AutomatedProjectWorkflowService['start']>) {
    return (await this.workflow()).start(...args);
  }

  /** 提供 scenarioFor运行 对应的scenarioFor运行操作。 */
  async scenarioForRun(runId: string) {
    return (await this.workflow()).scenarioForRun(runId);
  }

  /** 等待请求。 */
  async wait(...args: Parameters<AutomatedProjectWorkflowService['wait']>) {
    return (await this.workflow()).wait(...args);
  }

  /** 提供 状态 对应的状态操作。 */
  async status(...args: Parameters<AutomatedProjectWorkflowService['status']>) {
    return (await this.workflow()).status(...args);
  }

  /** 读取执行状态及恢复约束，保持业务阶段和失败证据原样。 */
  async executionForRun(run: { runId: string; state: string }) {
    let view;
    try {
      view = await this.status(run.runId);
    } catch (error) {
      const notTracked = error instanceof Error && error.message.startsWith('WORKFLOW_NOT_FOUND:');
      return presentRunExecution(run.state, notTracked ? 'NOT_TRACKED' : 'UNAVAILABLE');
    }
    let compatible = false;
    if (view.executionStatus === 'FAILED' && view.budget && view.budget.remainingMs > 0 && view.currentNode) {
      try { await this.runConfiguration.assertCompatible(run.runId); compatible = true; }
      catch { /* 旧执行版本或已变更配置仍可阅读，但不可声明可恢复。 */ }
    }
    return presentRunExecution(run.state, view, compatible);
  }

  /** 恢复请求。 */
  async resume(...args: Parameters<AutomatedProjectWorkflowService['resume']>) {
    return (await this.workflow()).resume(...args);
  }

  /** 取消请求。 */
  async cancel(...args: Parameters<AutomatedProjectWorkflowService['cancel']>) {
    return (await this.workflow()).cancel(...args);
  }

  /** 列出Agents。 */
  listAgents() {
    return this.agents.list();
  }

  /** 更新提示词Addon。 */
  updatePromptAddon(agentId: AgentId, promptAddon: string) {
    return this.agents.updatePromptAddon(agentId, promptAddon);
  }

  /** 构造Demo报告。 */
  buildDemoReport(runId: string): Promise<Record<string, unknown>> {
    return this.reports.build(runId);
  }

}
