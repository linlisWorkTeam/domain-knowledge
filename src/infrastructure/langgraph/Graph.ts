/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：提供图的基础设施实现与外部系统接入。
 */
import {
  Command, END, NodeError, Send, START, StateGraph, type BaseCheckpointSaver,
} from '@langchain/langgraph';
import type {
  AgentId, AgentPromptResolver, WorkflowNodeProjection, WorkflowObserver,
  WorkflowStageExecutor,
} from '../../application/ports/ApplicationPorts.ts';
import { agentDefinition } from '../../domain/services/workflow/AgentDefinitions.ts';
import {
  InfrastructureStateAnnotation, type InfrastructureState, type InfrastructureStateUpdate,
} from './State.ts';

import {
  AGENT_BY_NODE, WORKFLOW_NODES, WORKFLOW_EDGES, orchestratorTasks,
  candidateDestination, evaluationDestination, workflowDestination, nextIteration,
} from '../../domain/services/workflow/Workflow.ts';

/** 保留既有运行时节点清单接口，节点集合由领域工作流定义。 */
export const INFRASTRUCTURE_GRAPH_NODES = WORKFLOW_NODES;

interface GraphDependencies {
  /** 提供executor信息，供调用方读取或传入。 */
  executor: WorkflowStageExecutor;
  /** 提供observer信息，供调用方读取或传入。 */
  observer: WorkflowObserver;
  /** 提供prompts信息，供调用方读取或传入。 */
  prompts: AgentPromptResolver;
  /** 提供 取消信号For 对应的取消信号For操作。 */
  signalFor(runId: string): AbortSignal | undefined;
  /** 提供 就绪时间For 对应的就绪时间For操作。 */
  readyAtFor(runId: string, nodeId: string, iteration: number, fallback: string): string;
  /** 提供 时钟 对应的时钟操作。 */
  clock(): string;
}

function projection(
  state: InfrastructureState,
  nodeId: string,
  agentId: AgentId | null,
  attempt: number,
  status: WorkflowNodeProjection['status'],
  now: string,
  readyAt: string,
  detail = '',
  error: string | null = null,
): WorkflowNodeProjection {
  return {
    runId: state.runId, nodeId, agentId, status, iteration: state.iteration, attempt,
    detail, error,
    readyAt,
    startedAt: status === 'RUNNING' ? now : null,
    completedAt: status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED' ? now : null,
    updatedAt: now,
  };
}

function createNode(deps: GraphDependencies, nodeId: string) {
  return async (state: InfrastructureState): Promise<InfrastructureStateUpdate> => {
    const renderedNodeId = nodeId;
    const attemptKey = `${renderedNodeId}:${state.iteration}`;
    const stateAttempt = (state.attempts[attemptKey] ?? 0) + 1;
    const attempt = Math.max(
      stateAttempt,
      deps.observer.nextAttempt?.(state.runId, renderedNodeId, state.iteration) ?? stateAttempt,
    );
    const agentId = AGENT_BY_NODE[nodeId] ?? null;
    const definition = agentId ? agentDefinition(agentId) : null;
    const promptAddon = agentId && deps.prompts.getPromptAddon
      ? deps.prompts.getPromptAddon(agentId).trim()
      : '';
    const prompt = definition
      ? deps.prompts.resolvePrompt
        ? await deps.prompts.resolvePrompt(state.runId, agentId as AgentId)
        : `${definition.basePrompt}${promptAddon ? `\n\nOperator prompt add-on:\n${promptAddon}` : ''}`
      : '';
    const startedAt = deps.clock();
    const readyAt = deps.readyAtFor(
      state.runId, renderedNodeId, state.iteration, state.readyAt || startedAt,
    );
    deps.observer.record(projection(
      state, renderedNodeId, agentId, attempt, 'RUNNING', startedAt, readyAt,
    ));
    try {
      const result = await deps.executor.execute({
        runId: state.runId,
        nodeId,
        agentId,
        iteration: state.iteration,
        maxIterations: state.maxIterations,
        attempt,
        prompt,
        context: state.context,
        workerCount: state.workerCount,
        ...(deps.signalFor(state.runId) ? { signal: deps.signalFor(state.runId) } : {}),
      });
      const completedAt = deps.clock();
      deps.observer.record(projection(
        state, renderedNodeId, agentId, attempt, 'COMPLETED', completedAt, readyAt, result.detail,
      ));
      return {
        executionStatus: 'RUNNING',
        currentNode: renderedNodeId,
        activeAgent: agentId,
        attempts: { [attemptKey]: attempt },
        readyAt: completedAt,
        ...(result.context ? { context: result.context } : {}),
        ...(result.route ? { route: result.route } : {}),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      deps.observer.record(projection(
        state, renderedNodeId, agentId, attempt, 'FAILED', deps.clock(), readyAt, '', message,
      ));
      throw error;
    }
  };
}

/** 将领域工作流连接和分支规则映射为 LangGraph 节点、消息及检查点。 */
export function buildInfrastructureGraph(deps: GraphDependencies, checkpointer: BaseCheckpointSaver) {
  const node = (nodeId: string) => createNode(deps, nodeId);
  const graph = new StateGraph(InfrastructureStateAnnotation)
    .addNode('orchestrator', async (state: InfrastructureState): Promise<InfrastructureStateUpdate> => ({
      ...await node('orchestrator')(state), route: null,
    }))
    .addNode('doc_gen', node('doc_gen'))
    .addNode('test_gen', node('test_gen'))
    .addNode('candidate_knowledge', node('candidate_knowledge'))
    .addNode('oracle_validation', node('oracle_validation'))
    .addNode('code', node('code'))
    .addNode('check', node('check'))
    .addNode('evaluation', node('evaluation'))
    .addNode('review', node('review'))
    .addNode('workflow_router', async (state: InfrastructureState): Promise<InfrastructureStateUpdate> => {
      const update = await node('workflow_router')(state);
      return { ...update, iteration: nextIteration(state.iteration, typeof update.route === 'string' ? update.route : null) };
    })
    .addNode('publication', async (state: InfrastructureState): Promise<InfrastructureStateUpdate> => ({
      ...await node('publication')(state), executionStatus: 'COMPLETED',
    }))
    .addNode('failed', async (state: InfrastructureState): Promise<InfrastructureStateUpdate> => ({
      executionStatus: 'FAILED', route: 'FAILED', error: state.error ?? 'workflow failed',
    }))
    .addNode('stopped', async (): Promise<InfrastructureStateUpdate> => ({
      executionStatus: 'STOPPED', currentNode: 'stopped', route: 'STOPPED',
    }))
    .addConditionalEdges('orchestrator', (state: InfrastructureState) =>
      orchestratorTasks().map(({ nodeId }) =>
        new Send(nodeId, state)), ['test_gen', 'doc_gen'])
    .addConditionalEdges('candidate_knowledge', (state: InfrastructureState) =>
      candidateDestination(state.route), ['workflow_router', 'code'])
    .addConditionalEdges('evaluation', (state: InfrastructureState) =>
      evaluationDestination(state.route), ['failed', 'workflow_router', 'review'])
    .addConditionalEdges('workflow_router', (state: InfrastructureState) =>
      workflowDestination(state.route), ['publication', 'orchestrator', 'failed', 'stopped'])
    .setNodeDefaults({
      timeout: 600_000,
      errorHandler: (rawState: unknown, nodeError: NodeError) => {
        const state = rawState as InfrastructureState;
        return new Command({
          update: {
            executionStatus: 'FAILED', currentNode: nodeError.node, route: 'FAILED',
            error: nodeError.error.message,
          },
          goto: 'failed',
        });
      },
    });
  // START/END 是执行引擎标记；领域连接使用独立名称，避免依赖 SDK。
  for (const [from, to] of WORKFLOW_EDGES) {
    graph.addEdge(from === 'start' ? START : typeof from === 'string' ? from : [...from], to === 'end' ? END : to);
  }
  return graph.compile({ checkpointer, name: 'embedded-domain-knowledge' });
}
