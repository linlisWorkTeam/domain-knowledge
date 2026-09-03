import { createHash, randomUUID } from 'node:crypto';

export const RUN_STATES = [
  'CREATED', 'PLANNED', 'GENERATING', 'EVALUATING', 'REVIEWING',
  'ITERATING', 'ROLLING_BACK', 'PUBLISHING', 'VERIFIED',
  'LOW_CONFIDENCE', 'FAILED', 'CANCELLED',
] as const;

export type RunState = typeof RUN_STATES[number];
export const GATE_OUTCOMES = ['PASS', 'ITERATE', 'STOPPED'] as const;
export type GateOutcome = typeof GATE_OUTCOMES[number];
export type KnowledgeStatus = 'CANDIDATE' | 'VERIFIED' | 'LOW_CONFIDENCE' | 'SUPERSEDED';
export type QualityOutcome = 'ACCEPTED' | 'REJECTED';
export const DOMAIN_EVENT_TYPES = [
  'RunCreated', 'RunStateChanged', 'ArtifactCommitted', 'GateDecided',
  'KnowledgePublished', 'NodeCompleted', 'NodeFailed', 'AgentPromptConfigured',
  'WorkflowNodeStateChanged', 'RunConfigurationCaptured',
] as const;
export type DomainEventType = typeof DOMAIN_EVENT_TYPES[number];

export interface ArtifactRef {
  artifactId: string;
  mediaType: string;
  sha256: string;
  size: number;
}

export interface ProvenanceRef {
  path: string;
  lines?: string;
  commit?: string;
  symbol?: string;
  url?: string;
  pinned?: boolean;
}

export interface FlywheelRun {
  runId: string;
  moduleId: string;
  policyId: string;
  state: RunState;
  iteration: number;
  bestVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeVersion {
  versionId: string;
  moduleId: string;
  parentVersionId: string | null;
  bodyRef: ArtifactRef;
  provenance: ProvenanceRef[];
  status: KnowledgeStatus;
  qualityOutcome: QualityOutcome;
  qualityScore: number;
  gateDecisionId: string | null;
  title: string;
  description: string;
  category: string;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface EvaluationReport {
  reportId: string;
  runId: string;
  versionId: string;
  inputRefs: ArtifactRef[];
  evidenceRefs: ArtifactRef[];
  toolchainFingerprint: string;
  criticalFailures: number;
  testsPassed: number;
  testsTotal: number;
  stability: number;
  infrastructureFailure: boolean;
  checkBlocking?: boolean;
  reviewBlocking?: boolean;
  createdAt: string;
}

export interface GatePolicy {
  policyId: string;
  minimumStability: number;
  requireAllTests: boolean;
  maxIterations: number;
}

export interface GateDecision {
  decisionId: string;
  runId: string;
  versionId: string;
  outcome: GateOutcome;
  reasonCodes: string[];
  evidenceRefs: ArtifactRef[];
  createdAt: string;
}

export interface DomainEvent {
  eventId: string;
  eventType: DomainEventType;
  schemaVersion: '1.0';
  runId: string;
  occurredAt: string;
  causationId: string | null;
  payload: Record<string, unknown>;
}

const TRANSITIONS: Record<RunState, ReadonlySet<RunState>> = {
  CREATED: new Set(['PLANNED', 'CANCELLED', 'FAILED']),
  PLANNED: new Set(['GENERATING', 'CANCELLED', 'FAILED']),
  GENERATING: new Set(['EVALUATING', 'ITERATING', 'LOW_CONFIDENCE', 'CANCELLED', 'FAILED']),
  EVALUATING: new Set(['REVIEWING', 'CANCELLED', 'FAILED']),
  REVIEWING: new Set(['PUBLISHING', 'ITERATING', 'ROLLING_BACK', 'LOW_CONFIDENCE', 'FAILED', 'CANCELLED']),
  ITERATING: new Set(['GENERATING', 'LOW_CONFIDENCE', 'CANCELLED', 'FAILED']),
  ROLLING_BACK: new Set(['GENERATING', 'LOW_CONFIDENCE', 'CANCELLED', 'FAILED']),
  PUBLISHING: new Set(['VERIFIED', 'FAILED', 'CANCELLED']),
  VERIFIED: new Set(),
  LOW_CONFIDENCE: new Set(),
  FAILED: new Set(),
  CANCELLED: new Set(),
};

export function assertInvariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`DOMAIN_INVARIANT: ${message}`);
}

export function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function artifactIdFor(hash: string): string {
  assertInvariant(/^[a-f0-9]{64}$/.test(hash), 'sha256 must be lowercase hex');
  return `sha256:${hash}`;
}

export function createArtifactRef(bytes: Uint8Array, mediaType: string): ArtifactRef {
  assertInvariant(mediaType.trim().length > 0, 'artifact mediaType is required');
  const digest = sha256(bytes);
  return { artifactId: artifactIdFor(digest), mediaType, sha256: digest, size: bytes.byteLength };
}

export function assertArtifactRef(ref: ArtifactRef): void {
  assertInvariant(ref.artifactId === artifactIdFor(ref.sha256), 'artifactId must bind to sha256');
  assertInvariant(Number.isSafeInteger(ref.size) && ref.size >= 0, 'artifact size must be non-negative');
  assertInvariant(ref.mediaType.trim().length > 0, 'artifact mediaType is required');
}

export function createRun(moduleId: string, policyId: string, now: string): FlywheelRun {
  assertInvariant(moduleId.trim().length > 0, 'moduleId is required');
  assertInvariant(policyId.trim().length > 0, 'policyId is required');
  return {
    runId: randomUUID(), moduleId, policyId, state: 'CREATED', iteration: 0,
    bestVersionId: null, createdAt: now, updatedAt: now,
  };
}

export function transitionRun(run: FlywheelRun, next: RunState, now: string): FlywheelRun {
  assertInvariant(TRANSITIONS[run.state].has(next), `illegal run transition ${run.state} -> ${next}`);
  const iteration = next === 'ITERATING' ? run.iteration + 1 : run.iteration;
  assertInvariant(iteration >= run.iteration, 'run iteration cannot decrease');
  return { ...run, state: next, iteration, updatedAt: now };
}

export function decideGate(
  run: FlywheelRun,
  report: EvaluationReport,
  policy: GatePolicy,
  now: string,
): GateDecision {
  assertInvariant(report.runId === run.runId, 'evaluation must belong to run');
  const reasons: string[] = [];
  let outcome: GateOutcome = 'PASS';
  if (report.infrastructureFailure) {
    outcome = 'STOPPED';
    reasons.push('INFRASTRUCTURE_FAILURE');
  }
  if (report.checkBlocking) {
    if (outcome !== 'STOPPED') outcome = run.iteration >= policy.maxIterations ? 'STOPPED' : 'ITERATE';
    reasons.push('CHECK_BLOCKING');
  }
  if (report.reviewBlocking) {
    if (outcome !== 'STOPPED') outcome = run.iteration >= policy.maxIterations ? 'STOPPED' : 'ITERATE';
    reasons.push('REVIEW_BLOCKING');
  }
  if (report.criticalFailures > 0) {
    if (outcome !== 'STOPPED') outcome = run.iteration >= policy.maxIterations ? 'STOPPED' : 'ITERATE';
    reasons.push('CRITICAL_TEST_FAILURE');
  }
  if (policy.requireAllTests && report.testsPassed !== report.testsTotal) {
    if (outcome !== 'STOPPED') outcome = run.iteration >= policy.maxIterations ? 'STOPPED' : 'ITERATE';
    reasons.push('TESTS_INCOMPLETE');
  }
  if (report.stability < policy.minimumStability) {
    if (outcome !== 'STOPPED') outcome = run.iteration >= policy.maxIterations ? 'STOPPED' : 'ITERATE';
    reasons.push('STABILITY_BELOW_THRESHOLD');
  }
  if (outcome === 'PASS') reasons.push('ALL_DETERMINISTIC_GATES_PASSED');
  return {
    decisionId: randomUUID(), runId: run.runId, versionId: report.versionId,
    outcome, reasonCodes: [...new Set(reasons)], evidenceRefs: report.evidenceRefs, createdAt: now,
  };
}

export function createEvent(
  runId: string,
  eventType: DomainEventType,
  payload: Record<string, unknown>,
  now: string,
  causationId: string | null = null,
): DomainEvent {
  assertInvariant(runId.trim().length > 0, 'event runId is required');
  assertInvariant(eventType.trim().length > 0, 'event type is required');
  return {
    eventId: randomUUID(), eventType, schemaVersion: '1.0', runId,
    occurredAt: now, causationId, payload,
  };
}
