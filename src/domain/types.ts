export const AGENT_KINDS = [
  "orchestrator",
  "doc-gen",
  "doc-worker",
  "test-gen",
  "code",
  "check",
  "review",
] as const;

export type AgentKind = (typeof AGENT_KINDS)[number];

export type RunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "stopped"
  | "cancelled";

export type GateRoute = "pass" | "iterate" | "rollback" | "stopped" | "failed";

export interface ArtifactRef {
  id: string;
  runId: string;
  node: string;
  relativePath: string;
  absolutePath: string;
  mediaType: string;
  size: number;
  sha256: string;
  iteration: number;
  attempt: number;
  createdAt: string;
}

export interface ArtifactWrite {
  runId: string;
  node: string;
  relativePath: string;
  content: string | Uint8Array;
  mediaType?: string;
  iteration: number;
  attempt: number;
}

export interface AgentOutputFile {
  relativePath: string;
  content: string;
  mediaType?: string;
}

export interface WorkspaceHandle {
  root: string;
  readableRoots: string[];
  writableRoots: string[];
}

export interface AgentRunInput {
  runId: string;
  kind: AgentKind;
  node: string;
  iteration: number;
  attempt: number;
  prompt: string;
  workspace: WorkspaceHandle;
  artifacts: ArtifactRef[];
  scenario?: FakeScenario;
  existingThreadId?: string;
  workerId?: string;
  signal?: AbortSignal;
}

export interface AgentResumeInput extends AgentRunInput {
  existingThreadId: string;
}

export interface AgentRunResult {
  finalResponse: string;
  files: AgentOutputFile[];
  threadId?: string;
  metadata?: Record<string, unknown>;
}

export interface RunError {
  node: string;
  category: "business" | "infrastructure" | "permission" | "cancelled";
  message: string;
  iteration: number;
  attempt: number;
  occurredAt: string;
}

export interface RunEvent {
  node: string;
  phase: "started" | "completed" | "failed" | "routed";
  iteration: number;
  attempt: number;
  timestamp: string;
  agentKind?: AgentKind;
  workerId?: string;
  detail?: string;
}

export interface DocWorkerTask {
  id: string;
  index: number;
  topic: string;
}

export interface DocWorkerOutput {
  workerId: string;
  iteration: number;
  artifactIds: string[];
}

export interface CheckReport {
  blocking: boolean;
  findings: string[];
  artifactIds: string[];
}

export type EvaluationOutcome = "pass" | "fail" | "critical-regression" | "infra-error";

export interface EvaluationReport {
  outcome: EvaluationOutcome;
  summary: string;
  evidence: string[];
  infrastructureError: boolean;
  criticalRegression: boolean;
}

export interface ReviewReport {
  blocking: boolean;
  recommendation: "pass" | "iterate";
  findings: string[];
  corrections: string[];
}

export interface EvaluationInput {
  runId: string;
  iteration: number;
  artifacts: ArtifactRef[];
  scenario?: FakeScenario;
  signal?: AbortSignal;
}

export interface FakeScenario {
  evaluationSequence: EvaluationOutcome[];
  checkBlockingIterations: number[];
  reviewBlockingIterations: number[];
  failAgent?: AgentKind;
  agentDelayMs: Partial<Record<AgentKind, number>>;
}

export interface RunStartInput {
  runId?: string;
  workerCount?: number;
  maxIterations?: number;
  historicalBest?: boolean;
  scenario?: Partial<FakeScenario>;
}

export interface RunHandle {
  runId: string;
  status: RunStatus;
}

export interface RunStatusView extends RunHandle {
  currentNode?: string;
  iteration: number;
  route?: GateRoute;
  errors: RunError[];
}

export const defaultFakeScenario = (): FakeScenario => ({
  evaluationSequence: ["pass"],
  checkBlockingIterations: [],
  reviewBlockingIterations: [],
  agentDelayMs: {},
});

export function mergeFakeScenario(input?: Partial<FakeScenario>): FakeScenario {
  const defaults = defaultFakeScenario();
  return {
    evaluationSequence: input?.evaluationSequence ?? defaults.evaluationSequence,
    checkBlockingIterations:
      input?.checkBlockingIterations ?? defaults.checkBlockingIterations,
    reviewBlockingIterations:
      input?.reviewBlockingIterations ?? defaults.reviewBlockingIterations,
    agentDelayMs: input?.agentDelayMs ?? defaults.agentDelayMs,
    ...(input?.failAgent ? { failAgent: input.failAgent } : {}),
  };
}
