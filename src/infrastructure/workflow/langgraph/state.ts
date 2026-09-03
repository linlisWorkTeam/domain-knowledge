import { Annotation } from '@langchain/langgraph';
import type { AgentId } from '../../../application/ports/index.ts';

export type InfrastructureRoute = 'PASS' | 'ITERATE' | 'STOPPED' | 'FAILED';
export type InfrastructureExecutionStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'STOPPED' | 'CANCELLED';

export interface WorkerTask {
  workerId: string;
  index: number;
}

const replace = <T>(_left: T, right: T): T => right;

function latestTimestamp(left: string, right: string): string {
  if (!left) return right;
  if (!right) return left;
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return right;
  return rightTime >= leftTime ? right : left;
}

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
  /** Latest predecessor/barrier completion: the next super-step is eligible here. */
  readyAt: Annotation<string>({ reducer: latestTimestamp, default: () => '' }),
  activeAgent: Annotation<AgentId | null>({ reducer: replace, default: () => null }),
});

export type InfrastructureState = typeof InfrastructureStateAnnotation.State;
export type InfrastructureStateUpdate = typeof InfrastructureStateAnnotation.Update;
