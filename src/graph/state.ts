import { Annotation } from "@langchain/langgraph";
import {
  defaultFakeScenario,
  type ArtifactRef,
  type CheckReport,
  type DocWorkerOutput,
  type DocWorkerTask,
  type EvaluationReport,
  type FakeScenario,
  type GateRoute,
  type ReviewReport,
  type RunError,
  type RunEvent,
  type RunStatus,
} from "../domain/types.js";

const replace = <T>(_left: T, right: T): T => right;

export const GraphStateAnnotation = Annotation.Root({
  runId: Annotation<string>({ reducer: replace, default: () => "" }),
  status: Annotation<RunStatus>({ reducer: replace, default: () => "pending" }),
  currentNode: Annotation<string | undefined>({
    reducer: replace,
    default: () => undefined,
  }),
  iteration: Annotation<number>({ reducer: replace, default: () => 1 }),
  maxIterations: Annotation<number>({ reducer: replace, default: () => 5 }),
  workerCount: Annotation<number>({ reducer: replace, default: () => 0 }),
  route: Annotation<GateRoute | undefined>({
    reducer: replace,
    default: () => undefined,
  }),
  agentThreadIds: Annotation<Partial<Record<string, string>>>({
    reducer: (left, right) => ({ ...left, ...right }),
    default: () => ({}),
  }),
  artifacts: Annotation<ArtifactRef[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),
  errors: Annotation<RunError[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),
  events: Annotation<RunEvent[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),
  workerTask: Annotation<DocWorkerTask | undefined>({
    reducer: replace,
    default: () => undefined,
  }),
  workerOutputs: Annotation<DocWorkerOutput[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),
  checkReport: Annotation<CheckReport | undefined>({
    reducer: replace,
    default: () => undefined,
  }),
  evaluation: Annotation<EvaluationReport | undefined>({
    reducer: replace,
    default: () => undefined,
  }),
  reviewReport: Annotation<ReviewReport | undefined>({
    reducer: replace,
    default: () => undefined,
  }),
  historicalBest: Annotation<boolean>({ reducer: replace, default: () => false }),
  scenario: Annotation<FakeScenario>({
    reducer: replace,
    default: defaultFakeScenario,
  }),
});

export type GraphState = typeof GraphStateAnnotation.State;
export type GraphStateUpdate = typeof GraphStateAnnotation.Update;
