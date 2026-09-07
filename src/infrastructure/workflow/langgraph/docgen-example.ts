import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import type { WorkflowObserver, WorkflowStageExecutor, WorkflowStageInput, WorkflowStageResult } from '../../../application/ports/index.ts';

/** Fixed one-node development graph; the seven-role production graph is unchanged. */
export async function executeDocgenExample(
  input: WorkflowStageInput, executor: WorkflowStageExecutor, observer: WorkflowObserver,
): Promise<WorkflowStageResult> {
  const state = Annotation.Root({ result: Annotation<WorkflowStageResult>() });
  const graph = new StateGraph(state).addNode('doc_gen', async () => {
    const startedAt = new Date().toISOString();
    const record = (status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED', error: string | null = null) => {
      const now = new Date().toISOString();
      observer.record({ runId: input.runId, nodeId: 'doc_gen', agentId: 'doc-gen',
        iteration: 0, attempt: 1, status, readyAt: startedAt, startedAt,
        completedAt: status === 'RUNNING' ? null : now, updatedAt: now,
        detail: 'DocGen development example; publication not evaluated', error });
    };
    record('RUNNING');
    try {
      if (input.signal?.aborted) throw new Error('AGENT_CANCELLED');
      const result = await executor.execute(input);
      if (input.signal?.aborted) throw new Error('AGENT_CANCELLED');
      record('COMPLETED');
      return { result };
    } catch (error) {
      record(input.signal?.aborted ? 'CANCELLED' : 'FAILED', error instanceof Error ? error.message : 'DOCGEN_EXAMPLE_FAILED');
      throw error;
    }
  }).addEdge(START, 'doc_gen').addEdge('doc_gen', END).compile();
  return (await graph.invoke({}, { signal: input.signal })).result;
}
