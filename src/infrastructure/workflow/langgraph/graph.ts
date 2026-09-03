import {
  Command, END, NodeError, Send, START, StateGraph, type BaseCheckpointSaver,
} from '@langchain/langgraph';
import type {
  AgentId, AgentPromptResolver, WorkflowNodeProjection, WorkflowObserver,
  WorkflowStageExecutor,
} from '../../../application/ports/index.ts';
import { agentDefinition } from './agent-definitions.ts';
import {
  InfrastructureStateAnnotation, type InfrastructureState, type InfrastructureStateUpdate,
} from './state.ts';

const AGENT_BY_NODE: Readonly<Record<string, AgentId>> = {
  orchestrator: 'orchestrator',
  doc_worker: 'doc-worker',
  doc_gen: 'doc-gen',
  test_gen: 'test-gen',
  code: 'code',
  check: 'check',
  review: 'review',
};

export const INFRASTRUCTURE_GRAPH_NODES = [
  'orchestrator', 'doc_worker', 'doc_gen', 'test_gen', 'candidate_knowledge',
  'oracle_validation', 'code', 'check', 'evaluation', 'review', 'workflow_router',
  'publication', 'failed', 'stopped',
] as const;

interface GraphDependencies {
  executor: WorkflowStageExecutor;
  observer: WorkflowObserver;
  prompts: AgentPromptResolver;
  signalFor(runId: string): AbortSignal | undefined;
  clock(): string;
}

function projection(
  state: InfrastructureState,
  nodeId: string,
  agentId: AgentId | null,
  attempt: number,
  status: WorkflowNodeProjection['status'],
  now: string,
  detail = '',
  error: string | null = null,
): WorkflowNodeProjection {
  return {
    runId: state.runId, nodeId, agentId, status, iteration: state.iteration, attempt,
    detail, error,
    startedAt: status === 'RUNNING' ? now : null,
    completedAt: status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED' ? now : null,
    updatedAt: now,
  };
}

function executionNodeId(state: InfrastructureState, nodeId: string): string {
  return state.workerTask && nodeId === 'doc_worker' ? `${nodeId}:${state.workerTask.workerId}` : nodeId;
}

function createNode(deps: GraphDependencies, nodeId: string) {
  return async (state: InfrastructureState): Promise<InfrastructureStateUpdate> => {
    const renderedNodeId = executionNodeId(state, nodeId);
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
    deps.observer.record(projection(state, renderedNodeId, agentId, attempt, 'RUNNING', startedAt));
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
        ...(state.workerTask ? { workerId: state.workerTask.workerId } : {}),
        ...(state.workerTask ? { workerIndex: state.workerTask.index } : {}),
        ...(deps.signalFor(state.runId) ? { signal: deps.signalFor(state.runId) } : {}),
      });
      const completedAt = deps.clock();
      deps.observer.record(projection(
        state, renderedNodeId, agentId, attempt, 'COMPLETED', completedAt, result.detail,
      ));
      return {
        executionStatus: 'RUNNING',
        currentNode: renderedNodeId,
        activeAgent: agentId,
        attempts: { [attemptKey]: attempt },
        ...(result.context ? { context: result.context } : {}),
        ...(result.route ? { route: result.route } : {}),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      deps.observer.record(projection(state, renderedNodeId, agentId, attempt, 'FAILED', deps.clock(), '', message));
      throw error;
    }
  };
}

export function buildInfrastructureGraph(deps: GraphDependencies, checkpointer: BaseCheckpointSaver) {
  const node = (nodeId: string) => createNode(deps, nodeId);
  const graph = new StateGraph(InfrastructureStateAnnotation)
    .addNode('orchestrator', async (state: InfrastructureState): Promise<InfrastructureStateUpdate> => ({
      ...await node('orchestrator')(state), route: null,
    }))
    .addNode('doc_worker', node('doc_worker'))
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
      return update.route === 'ITERATE'
        ? { ...update, iteration: state.iteration + 1 }
        : update;
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
    .addEdge(START, 'orchestrator')
    .addConditionalEdges('orchestrator', (state: InfrastructureState) => {
      const base = { ...state, workerTask: undefined };
      const sends: Send[] = [new Send('test_gen', base)];
      if (state.workerCount > 0) {
        for (let index = 0; index < state.workerCount; index += 1) {
          sends.push(new Send('doc_worker', {
            ...state, workerTask: { workerId: `worker-${index + 1}`, index },
          }));
        }
      } else {
        sends.push(new Send('doc_gen', base));
      }
      return sends;
    }, ['test_gen', 'doc_worker', 'doc_gen'])
    .addEdge('doc_worker', 'doc_gen')
    .addEdge('doc_gen', 'candidate_knowledge')
    .addConditionalEdges('candidate_knowledge', (state: InfrastructureState) =>
      state.route === 'ITERATE' || state.route === 'STOPPED' ? 'workflow_router' : 'code',
    ['workflow_router', 'code'])
    .addEdge('code', 'check')
    .addEdge('test_gen', 'oracle_validation')
    .addEdge(['check', 'oracle_validation'], 'evaluation')
    .addConditionalEdges('evaluation', (state: InfrastructureState) => {
      if (state.route === 'FAILED') return 'failed';
      if (state.route === 'STOPPED') return 'workflow_router';
      return 'review';
    }, ['failed', 'workflow_router', 'review'])
    .addEdge('review', 'workflow_router')
    .addConditionalEdges('workflow_router', (state: InfrastructureState) => {
      if (state.route === 'PASS') return 'publication';
      if (state.route === 'ITERATE') return 'orchestrator';
      if (state.route === 'FAILED') return 'failed';
      return 'stopped';
    }, ['publication', 'orchestrator', 'failed', 'stopped'])
    .addEdge('publication', END)
    .addEdge('failed', END)
    .addEdge('stopped', END)
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
  return graph.compile({ checkpointer, name: 'embedded-domain-knowledge' });
}
