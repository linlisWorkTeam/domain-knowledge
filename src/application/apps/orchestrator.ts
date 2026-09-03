import type { AgentId, DemoReportBuilder } from '../ports/index.ts';
import type {
  AgentCatalogService, AutomatedProjectWorkflowService,
} from '../services/index.ts';

/**
 * Application facade for workflow coordination and operator-facing Agent control.
 * Infrastructure is resolved lazily so read-only Agent catalog calls do not start LangGraph.
 */
export class Orchestrator {
  readonly workflow: () => Promise<AutomatedProjectWorkflowService>;
  readonly agents: AgentCatalogService;
  readonly reports: DemoReportBuilder;

  constructor(input: {
    workflow: () => Promise<AutomatedProjectWorkflowService>;
    agents: AgentCatalogService;
    reports: DemoReportBuilder;
  }) {
    this.workflow = input.workflow;
    this.agents = input.agents;
    this.reports = input.reports;
  }

  async start(...args: Parameters<AutomatedProjectWorkflowService['start']>) {
    return (await this.workflow()).start(...args);
  }

  async wait(...args: Parameters<AutomatedProjectWorkflowService['wait']>) {
    return (await this.workflow()).wait(...args);
  }

  async status(...args: Parameters<AutomatedProjectWorkflowService['status']>) {
    return (await this.workflow()).status(...args);
  }

  async resume(...args: Parameters<AutomatedProjectWorkflowService['resume']>) {
    return (await this.workflow()).resume(...args);
  }

  async cancel(...args: Parameters<AutomatedProjectWorkflowService['cancel']>) {
    return (await this.workflow()).cancel(...args);
  }

  listAgents() {
    return this.agents.list();
  }

  updatePromptAddon(agentId: AgentId, promptAddon: string) {
    return this.agents.updatePromptAddon(agentId, promptAddon);
  }

  buildDemoReport(runId: string): Promise<Record<string, unknown>> {
    return this.reports.build(runId);
  }
}
