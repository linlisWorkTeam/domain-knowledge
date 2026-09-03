import { Annotation } from '@langchain/langgraph';
import type { AgentId } from '../../../application/ports/index.ts';

export type InfrastructureRoute = 'PASS' | 'ITERATE' | 'STOPPED' | 'FAILED';
export type InfrastructureExecutionStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'STOPPED' | 'CANCELLED';

export interface WorkerTask {
  workerId: string;
  index: number;
}

const replace = <T>(_left: T, right: T): T => right;

export const InfrastructureStateAnnotation = Annotation.Root({
  runId: Annotation<string>({ reducer: replace, default: () => '' }),
  executionStatus: Annotation<InfrastructureExecutionStatus>({ reducer: replace, default: () => 'PENDING' }),
  currentNode: Annotation<string | null>({ reducer: replace, default: () => null }),
  iteration: Annotation<number>({ reducer: replace, default: () => 0 }),
  maxIterations: Annotation<number>({ reducer: replace, default: () => 3 }),
  workerCount: Annotation<number>({ reducer: replace, default: () => 0 }),
  route: Annotation<InfrastructureRoute | null>({ reducer: replace, default: () => null }),
  error: Annotation<string | null>({ reducer: replace, default: () => null }),
  workerTask: Annotation<WorkerTask | undefined>({ reducer: replace, default: () => undefined }),
  context: Annotation<Record<string, unknown>>({
    reducer: (left, right) => ({ ...left, ...right }), default: () => ({}),
  }),
  attempts: Annotation<Record<string, number>>({
    reducer: (left, right) => ({ ...left, ...right }), default: () => ({}),
  }),
  activeAgent: Annotation<AgentId | null>({ reducer: replace, default: () => null }),
});

export type InfrastructureState = typeof InfrastructureStateAnnotation.State;
export type InfrastructureStateUpdate = typeof InfrastructureStateAnnotation.Update;
