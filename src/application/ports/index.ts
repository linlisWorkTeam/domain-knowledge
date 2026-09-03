import type {
  ArtifactRef, DomainEvent, EvaluationReport, FlywheelRun, GateDecision, GatePolicy,
  KnowledgeVersion, ProvenanceRef,
} from '../../domain/index.ts';

export interface ArtifactStore {
  put(bytes: Uint8Array, mediaType: string): Promise<ArtifactRef>;
  get(ref: ArtifactRef): Promise<Uint8Array>;
  verify(ref: ArtifactRef): Promise<boolean>;
}

export interface CandidateInput {
  versionId: string;
  moduleId: string;
  parentVersionId: string | null;
  bodyRef: ArtifactRef;
  provenance: ProvenanceRef[];
  qualityOutcome: 'ACCEPTED' | 'REJECTED';
  qualityScore: number;
  title: string;
  description: string;
  category: string;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface FlywheelRepository {
  initialize(): void;
  saveRun(run: FlywheelRun, event: DomainEvent): void;
  getRun(runId: string): FlywheelRun | null;
  updateRun(run: FlywheelRun, event: DomainEvent): void;
  saveCandidate(input: CandidateInput, event: DomainEvent): KnowledgeVersion;
  getKnowledgeVersion(versionId: string): KnowledgeVersion | null;
  findKnowledgeVersionByBody(moduleId: string, artifactId: string): KnowledgeVersion | null;
  latestKnowledgeVersion(moduleId: string): KnowledgeVersion | null;
  listKnowledgeVersions(statuses?: string[]): KnowledgeVersion[];
  saveEvaluationAndDecision(
    report: EvaluationReport,
    decision: GateDecision,
    reviewingRun: FlywheelRun,
    gateEvent: DomainEvent,
    transitionEvent: DomainEvent,
  ): void;
  getEvaluationAndDecision(runId: string, versionId: string): {
    report: EvaluationReport;
    decision: GateDecision;
  } | null;
  getGateDecision(decisionId: string): GateDecision | null;
  publish(
    publicationKey: string,
    run: FlywheelRun,
    version: KnowledgeVersion,
    decision: GateDecision,
    event: DomainEvent,
  ): { publicationKey: string; versionId: string; publishedAt: string; replayed: boolean };
  getPublication(publicationKey: string): { publicationKey: string; versionId: string; publishedAt: string } | null;
  recordFeedback(versionId: string, action: string, rating: number | null, note: string, now: string): void;
  listEvents(runId: string): DomainEvent[];
  getCheckpoint(generationKey: string): NodeCheckpoint | null;
  claimCheckpoint(checkpoint: NodeCheckpoint): NodeCheckpoint;
  commitCheckpoint(generationKey: string, retryCount: number, outputRefs: ArtifactRef[], event: DomainEvent, now: string): NodeCheckpoint;
  failCheckpoint(generationKey: string, retryCount: number, event: DomainEvent, now: string): NodeCheckpoint;
  listAgentPromptConfigurations(): AgentPromptConfiguration[];
  saveAgentPromptConfiguration(configuration: AgentPromptConfiguration, event: DomainEvent): AgentPromptConfiguration;
  saveRunConfiguration(snapshot: RunConfigurationSnapshot, event: DomainEvent): RunConfigurationSnapshot;
  getRunConfiguration(runId: string): RunConfigurationSnapshot | null;
  recordWorkflowNodeProjection(projection: WorkflowNodeProjection, event: DomainEvent): void;
  listWorkflowNodeProjections(runId: string): WorkflowNodeProjection[];
  status(): Record<string, unknown>;
}

export interface NodeCheckpoint {
  runId: string;
  nodeId: string;
  generationKey: string;
  status: 'RUNNING' | 'COMMITTED' | 'FAILED';
  inputRefs: ArtifactRef[];
  outputRefs: ArtifactRef[];
  retryCount: number;
  updatedAt: string;
}

export interface QualityReport {
  score: number;
  outcome: 'ACCEPTED' | 'REJECTED';
  signals: Record<string, number>;
  weakPoints: string[];
}

export interface QualityPolicy {
  evaluate(body: string, input: {
    title: string;
    description: string;
    provenance: ProvenanceRef[];
  }): QualityReport;
}

/** Read-only projection consumed by Application use cases, implemented by an adapter. */
export interface RunProjectionReader {
  listRunSummaries(states?: string[]): Record<string, unknown>[];
  getRunSnapshot(runId: string, versions: KnowledgeVersion[]): Record<string, unknown> | null;
}

export interface DemoReportBuilder {
  build(runId: string): Promise<Record<string, unknown>>;
}

export interface EvaluationSubmission {
  runId: string;
  versionId: string;
  inputRefs?: ArtifactRef[];
  evidenceRefs: ArtifactRef[];
  toolchainFingerprint: string;
  criticalFailures: number;
  testsPassed: number;
  testsTotal: number;
  stability: number;
  infrastructureFailure?: boolean;
  checkBlocking?: boolean;
  reviewBlocking?: boolean;
}

export interface EvalRunnerUseCase {
  evaluate(input: EvaluationSubmission, policy: GatePolicy): Promise<{
    report: EvaluationReport;
    decision: GateDecision;
  }>;
}

export interface KnowledgeDiscoveryCandidate {
  path: string;
  sha256: string;
  size: number;
  modifiedAt: string;
}

export interface KnowledgeDiscoveryPort {
  scan(configuredRoots: string[], maximum?: number): {
    candidates: KnowledgeDiscoveryCandidate[];
    total: number;
    truncated: boolean;
  };
}

export interface LegacyKnowledgeMigrationPort {
  migrate(legacyKnowledgeRoot: string): Promise<{
    imported: number;
    replayed: number;
    rejected: number;
    errors: { file: string; error: string }[];
  }>;
}

export interface AgentContextSnapshot {
  iteration: number;
  attempt: number;
  inputRefs: ArtifactRef[];
  outputRefs: ArtifactRef[];
  route: 'PASS' | 'ITERATE' | 'STOPPED' | 'FAILED' | null;
}

export interface AgentContextStore {
  get(runId: string, nodeId: string): Promise<AgentContextSnapshot | null>;
  set(runId: string, nodeId: string, context: AgentContextSnapshot, ttlMs: number): Promise<void>;
  delete(runId: string, nodeId: string): Promise<void>;
}

export interface RunningStateLease {
  runId: string;
  ownerId: string;
  leaseId: string;
  expiresAt: string;
}

export interface RunningStateStore {
  acquire(runId: string, ownerId: string, ttlMs: number): Promise<RunningStateLease | null>;
  get(runId: string): Promise<RunningStateLease | null>;
  release(runId: string, ownerId: string, leaseId: string): Promise<boolean>;
}

export interface AgentRequest {
  role: string;
  prompt: string;
  outputSchema: Record<string, unknown>;
  idempotencyKey: string;
  /** Validated workflow command. Providers may transport it but cannot redefine it. */
  command?: AgentCommand;
  inputRefs?: ArtifactRef[];
  /** Trusted workspace selected by the workflow, never by model output. */
  workspaceRoot?: string;
  /** Non-secret correlation fields copied into provider audit records. */
  metadata?: Record<string, string | number | boolean | null>;
}

export interface AgentProvider {
  run(request: AgentRequest, signal?: AbortSignal): Promise<Record<string, unknown>>;
}

export interface AgentCommand {
  schemaVersion: '1.0';
  commandId: string;
  runId: string;
  agentType: AgentId;
  generationKey: string;
  payload: Record<string, unknown>;
}

export interface AgentResult {
  schemaVersion: '1.0';
  commandId: string;
  runId: string;
  agentType: AgentId;
  status: 'SUCCEEDED' | 'FAILED';
  outputRefs: ArtifactRef[];
  payload: Record<string, unknown>;
}

/** Runtime boundary for the versioned schemas under specs/schemas. */
export interface AgentContractValidator {
  assertCommand(command: AgentCommand): void;
  assertResult(result: AgentResult): void;
}

export interface AgentWorkspaceView {
  workspaceRoot: string;
  readablePaths: string[];
}

export interface AgentWorkspaceProvider {
  materialize(input: {
    isolationKey: string;
    role: string;
    sourceRoot: string;
    readablePaths: string[];
  }): Promise<AgentWorkspaceView>;
}

export interface SandboxResult {
  exitCode: number;
  stdoutRef: ArtifactRef;
  stderrRef: ArtifactRef;
  timedOut: boolean;
  resourceUsage: Record<string, number>;
}

export interface Sandbox {
  execute(command: string, args: string[], inputRefs: ArtifactRef[], signal?: AbortSignal): Promise<SandboxResult>;
}

export interface LanguagePlugin {
  readonly languageId: string;
  compile(sourceRefs: ArtifactRef[], sandbox: Sandbox, signal?: AbortSignal): Promise<SandboxResult>;
  test(binaryRef: ArtifactRef, testRefs: ArtifactRef[], sandbox: Sandbox, signal?: AbortSignal): Promise<SandboxResult>;
}

export type ProjectTool = 'node' | 'pnpm' | 'cargo';

export interface ProjectCommand {
  tool: ProjectTool;
  purpose: 'setup' | 'test' | 'check';
  args: string[];
  cwd?: string;
  repetitions?: number;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface GeneratedProjectFile {
  path: string;
  content: string;
}

export interface ProjectSnapshot {
  repositoryRoot: string;
  remote: string;
  checkoutHead: string;
  commit: string;
  dirty: boolean;
  sourcePaths: string[];
  publicInterfacePaths: string[];
  manifestRef: ArtifactRef;
}

export interface ProjectCommandResult {
  phase: 'prepare' | 'gate';
  tool: ProjectTool;
  purpose: ProjectCommand['purpose'];
  args: string[];
  cwd: string;
  attempt: number;
  exitCode: number | null;
  timedOut: boolean;
  outputLimitExceeded: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
  testsPassed: number;
  testsTotal: number;
  testCountsParsed: boolean;
}

export interface ProjectEvaluation {
  label: string;
  commit: string;
  passed: boolean;
  testsPassed: number;
  testsTotal: number;
  stability: number;
  infrastructureFailure: boolean;
  toolchainFingerprint: string;
  generatedFileDigests: Record<string, string>;
  results: ProjectCommandResult[];
  evidenceRef: ArtifactRef;
}

export interface ProjectEvaluator {
  inspect(input: {
    repositoryRoot: string;
    expectedCommit?: string;
    sourcePaths: string[];
    publicInterfacePaths: string[];
  }): Promise<ProjectSnapshot>;
  evaluate(input: {
    label: string;
    snapshot: ProjectSnapshot;
    generatedFiles: GeneratedProjectFile[];
    prepareCommands: ProjectCommand[];
    commands: ProjectCommand[];
  }, signal?: AbortSignal): Promise<ProjectEvaluation>;
}

export const AGENT_IDS = [
  'orchestrator', 'doc-gen', 'doc-worker', 'test-gen', 'code', 'check', 'review',
] as const;

export type AgentId = typeof AGENT_IDS[number];

export interface AgentDefinition {
  agentId: AgentId;
  nodeId: string;
  displayName: string;
  responsibility: string;
  basePrompt: string;
  inputContract: string[];
  outputContract: string[];
  tools: string[];
  customizableFields: readonly ['promptAddon'];
}

export interface AgentPromptConfiguration {
  agentId: AgentId;
  promptAddon: string;
  revision: number;
  updatedAt: string | null;
}

export interface AgentRunConfiguration {
  agentId: AgentId;
  promptRevision: number;
  basePromptSha256: string;
  promptAddonSha256: string;
  effectivePromptSha256: string;
  effectivePromptRef: ArtifactRef;
  tools: string[];
}

export interface RunConfigurationSnapshot {
  schemaVersion: '1.0';
  runId: string;
  provider: {
    kind: string;
    model: string;
    parametersSha256: string;
  };
  contracts: {
    commandSchema: 'https://wpknowledge.local/schemas/agent-command/v1';
    resultSchema: 'https://wpknowledge.local/schemas/agent-result/v1';
  };
  agents: AgentRunConfiguration[];
  capturedAt: string;
}

export interface RunConfigurationManager {
  capture(runId: string): Promise<RunConfigurationSnapshot>;
  get(runId: string): RunConfigurationSnapshot | null;
  resolvePrompt(runId: string, agentId: AgentId): Promise<string>;
}

export type WorkflowNodeStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface WorkflowNodeProjection {
  runId: string;
  nodeId: string;
  agentId: AgentId | null;
  status: WorkflowNodeStatus;
  iteration: number;
  attempt: number;
  detail: string;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export interface StartWorkflowCommand {
  runId: string;
  maxIterations: number;
  workerCount: number;
  context?: Record<string, unknown>;
}

export interface WorkflowHandle {
  runId: string;
  executionStatus: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'STOPPED' | 'CANCELLED';
}

export interface WorkflowExecutionView extends WorkflowHandle {
  currentNode: string | null;
  iteration: number;
  maxIterations: number;
  route: 'PASS' | 'ITERATE' | 'STOPPED' | 'FAILED' | null;
  error: string | null;
}

export interface WorkflowEngine {
  start(command: StartWorkflowCommand): Promise<WorkflowHandle>;
  resume(runId: string): Promise<WorkflowHandle>;
  cancel(runId: string): Promise<void>;
  wait(runId: string): Promise<WorkflowExecutionView>;
  status(runId: string): Promise<WorkflowExecutionView>;
}

export interface WorkflowStageInput {
  runId: string;
  nodeId: string;
  agentId: AgentId | null;
  iteration: number;
  maxIterations: number;
  attempt: number;
  prompt: string;
  context: Record<string, unknown>;
  workerId?: string;
  workerIndex?: number;
  workerCount: number;
  signal?: AbortSignal;
}

export interface WorkflowStageResult {
  detail: string;
  context?: Record<string, unknown>;
  route?: 'PASS' | 'ITERATE' | 'STOPPED' | 'FAILED';
}

export interface WorkflowStageExecutor {
  execute(input: WorkflowStageInput): Promise<WorkflowStageResult>;
}

export interface WorkflowObserver {
  record(projection: WorkflowNodeProjection): void;
  nextAttempt?(runId: string, nodeId: string, iteration: number): number;
}

export interface AgentPromptResolver {
  resolvePrompt?(runId: string, agentId: AgentId): Promise<string>;
  /** Compatibility path for tests without a persisted RunConfigurationSnapshot. */
  getPromptAddon?(agentId: AgentId): string;
}
