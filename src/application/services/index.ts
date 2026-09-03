import { randomUUID } from 'node:crypto';
import {
  assertArtifactRef, assertInvariant, createEvent, sha256,
} from '../../domain/index.ts';
import type {
  ArtifactRef, EvaluationReport, FlywheelRun, GateDecision, GatePolicy,
  KnowledgeVersion, ProvenanceRef, RunState,
} from '../../domain/index.ts';
import {
  EvalRunnerDomainService, FlywheelDomainService,
} from '../../domain/services/index.ts';
import type {
  ArtifactStore, EvaluationSubmission, FlywheelRepository, NodeCheckpoint, QualityPolicy,
  RunProjectionReader,
} from '../ports/index.ts';

export interface CandidateRequest {
  moduleId: string;
  body: string;
  title?: string;
  description?: string;
  category?: string;
  tags?: string[];
  provenance: ProvenanceRef[];
  metadata?: Record<string, unknown>;
}

export type EvaluationInput = EvaluationSubmission;

export class KnowledgeFlywheelService {
  readonly artifacts: ArtifactStore;
  readonly repository: FlywheelRepository;
  readonly qualityPolicy: QualityPolicy;
  readonly flywheelDomain: FlywheelDomainService;
  readonly evalRunnerDomain: EvalRunnerDomainService;
  readonly runProjections?: RunProjectionReader;
  readonly clock: () => string;

  constructor(input: {
    artifacts: ArtifactStore;
    repository: FlywheelRepository;
    qualityPolicy: QualityPolicy;
    flywheelDomain?: FlywheelDomainService;
    evalRunnerDomain?: EvalRunnerDomainService;
    runProjections?: RunProjectionReader;
    clock?: () => string;
  }) {
    this.artifacts = input.artifacts;
    this.repository = input.repository;
    this.qualityPolicy = input.qualityPolicy;
    this.flywheelDomain = input.flywheelDomain ?? new FlywheelDomainService();
    this.evalRunnerDomain = input.evalRunnerDomain ?? new EvalRunnerDomainService();
    this.runProjections = input.runProjections;
    this.clock = input.clock ?? (() => new Date().toISOString());
    this.repository.initialize();
  }

  createRun(moduleId: string, policyId: string): FlywheelRun {
    const now = this.clock();
    const run = this.flywheelDomain.createRun(moduleId, policyId, now);
    this.repository.saveRun(run, createEvent(run.runId, 'RunCreated', { moduleId, policyId }, now));
    return run;
  }

  transition(runId: string, next: RunState): FlywheelRun {
    const current = this.requireRun(runId);
    const now = this.clock();
    const updated = this.flywheelDomain.transition(current, next, now);
    this.repository.updateRun(updated, createEvent(runId, 'RunStateChanged', {
      from: current.state, to: next, iteration: updated.iteration,
    }, now));
    return updated;
  }

  async ingestCandidate(request: CandidateRequest): Promise<{
    version: KnowledgeVersion;
    quality: ReturnType<QualityPolicy['evaluate']>;
    replayed: boolean;
  }> {
    assertInvariant(/^[a-z0-9][a-z0-9_-]{0,127}$/.test(request.moduleId), 'moduleId must be a stable slug');
    assertInvariant(request.body.trim().length > 0, 'candidate body is required');
    assertInvariant(request.provenance.length > 0, 'candidate provenance is required');
    for (const source of request.provenance) {
      assertInvariant(source !== null && typeof source === 'object', 'candidate provenance entry must be an object');
      assertInvariant(typeof source.path === 'string' && source.path.trim().length > 0, 'candidate provenance path is required');
    }
    const bodyRef = await this.artifacts.put(Buffer.from(request.body, 'utf8'), 'text/markdown; charset=utf-8');
    const existing = this.repository.findKnowledgeVersionByBody(request.moduleId, bodyRef.artifactId);
    if (existing) {
      return {
        version: existing,
        quality: this.qualityPolicy.evaluate(request.body, {
          title: existing.title, description: existing.description, provenance: existing.provenance,
        }),
        replayed: true,
      };
    }
    const latest = this.repository.latestKnowledgeVersion(request.moduleId);
    const title = request.title?.trim() || request.moduleId;
    const description = request.description?.trim() || '';
    const quality = this.qualityPolicy.evaluate(request.body, { title, description, provenance: request.provenance });
    const now = this.clock();
    const versionId = `kv_${sha256(`${request.moduleId}\0${bodyRef.sha256}`).slice(0, 24)}`;
    const event = createEvent(`catalog:${request.moduleId}`, 'ArtifactCommitted', {
      artifactId: bodyRef.artifactId, versionId, moduleId: request.moduleId,
    }, now);
    const version = this.repository.saveCandidate({
      versionId,
      moduleId: request.moduleId,
      parentVersionId: latest?.versionId ?? null,
      bodyRef,
      provenance: request.provenance,
      qualityOutcome: quality.outcome,
      qualityScore: quality.score,
      title,
      description,
      category: request.category?.trim() || '',
      tags: [...new Set(request.tags ?? [])],
      metadata: request.metadata ?? {},
      createdAt: now,
    }, event);
    return { version, quality, replayed: false };
  }

  async recordEvaluation(input: EvaluationInput, policy: GatePolicy): Promise<{ report: EvaluationReport; decision: GateDecision }> {
    const run = this.requireRun(input.runId);
    const version = this.requireVersion(input.versionId);
    assertInvariant(run.moduleId === version.moduleId, 'run and knowledge version module must match');
    assertInvariant(policy.policyId === run.policyId, 'evaluation policy must match the run policy');
    assertInvariant(policy.minimumStability >= 0 && policy.minimumStability <= 1, 'policy minimumStability must be between 0 and 1');
    assertInvariant(Number.isSafeInteger(policy.maxIterations) && policy.maxIterations >= 0, 'policy maxIterations must be a non-negative integer');
    assertInvariant(version.qualityOutcome === 'ACCEPTED', 'quality-rejected candidate cannot enter behavioral gate');
    assertInvariant(input.evidenceRefs.length > 0, 'behavioral evaluation requires immutable evidence');
    assertInvariant(input.toolchainFingerprint.trim().length > 0, 'toolchain fingerprint is required');
    assertInvariant(Number.isSafeInteger(input.criticalFailures) && input.criticalFailures >= 0, 'criticalFailures must be a non-negative integer');
    assertInvariant(Number.isSafeInteger(input.testsPassed) && Number.isSafeInteger(input.testsTotal), 'test totals must be integers');
    assertInvariant(input.testsTotal > 0 && input.testsPassed >= 0 && input.testsTotal >= input.testsPassed, 'behavioral evaluation must execute at least one test');
    assertInvariant(input.stability >= 0 && input.stability <= 1, 'stability must be between 0 and 1');
    const inputRefs = input.inputRefs ?? [version.bodyRef];
    for (const ref of inputRefs) {
      assertArtifactRef(ref);
      assertInvariant(await this.artifacts.verify(ref), `evaluation input failed integrity verification: ${ref.artifactId}`);
    }
    for (const ref of input.evidenceRefs) {
      assertArtifactRef(ref);
      assertInvariant(await this.artifacts.verify(ref), `evaluation evidence failed integrity verification: ${ref.artifactId}`);
    }
    if (run.state === 'REVIEWING') {
      const existing = this.repository.getEvaluationAndDecision(run.runId, version.versionId);
      assertInvariant(existing !== null, 'reviewing run is missing its evaluation decision');
      const sameRefs = (left: ArtifactRef[], right: ArtifactRef[]) =>
        left.map((ref) => ref.artifactId).join('\0') === right.map((ref) => ref.artifactId).join('\0');
      assertInvariant(
        sameRefs(existing.report.inputRefs, inputRefs)
        && sameRefs(existing.report.evidenceRefs, input.evidenceRefs)
        && existing.report.toolchainFingerprint === input.toolchainFingerprint
        && existing.report.criticalFailures === input.criticalFailures
        && existing.report.testsPassed === input.testsPassed
        && existing.report.testsTotal === input.testsTotal
        && existing.report.stability === input.stability
        && existing.report.infrastructureFailure === (input.infrastructureFailure ?? false)
        && (existing.report.checkBlocking ?? false) === (input.checkBlocking ?? false)
        && (existing.report.reviewBlocking ?? false) === (input.reviewBlocking ?? false),
        'evaluation replay input collision',
      );
      return existing;
    }
    assertInvariant(run.state === 'EVALUATING', 'run must be EVALUATING before recording a behavioral evaluation');
    const now = this.clock();
    const report: EvaluationReport = {
      reportId: randomUUID(), runId: run.runId, versionId: version.versionId,
      inputRefs, evidenceRefs: input.evidenceRefs,
      toolchainFingerprint: input.toolchainFingerprint,
      criticalFailures: input.criticalFailures,
      testsPassed: input.testsPassed,
      testsTotal: input.testsTotal,
      stability: input.stability,
      infrastructureFailure: input.infrastructureFailure ?? false,
      checkBlocking: input.checkBlocking ?? false,
      reviewBlocking: input.reviewBlocking ?? false,
      createdAt: now,
    };
    const decision = this.evalRunnerDomain.decide(run, report, policy, now);
    const reviewing = this.flywheelDomain.transition(run, 'REVIEWING', now);
    this.repository.saveEvaluationAndDecision(report, decision, reviewing, createEvent(run.runId, 'GateDecided', {
      reportId: report.reportId, decisionId: decision.decisionId,
      versionId: version.versionId, outcome: decision.outcome,
      reasonCodes: decision.reasonCodes,
    }, now), createEvent(run.runId, 'RunStateChanged', {
      from: run.state, to: reviewing.state, iteration: reviewing.iteration,
    }, now));
    return { report, decision };
  }

  async publish(runId: string, versionId: string, decisionId: string): Promise<{
    publicationKey: string;
    versionId: string;
    publishedAt: string;
    replayed: boolean;
  }> {
    const run = this.requireRun(runId);
    const version = this.requireVersion(versionId);
    const decision = this.repository.getGateDecision(decisionId);
    assertInvariant(decision !== null, 'gate decision not found');
    assertInvariant(decision.runId === runId && decision.versionId === versionId, 'gate decision scope mismatch');
    assertInvariant(decision.outcome === 'PASS', 'only PASS decisions may publish knowledge');
    assertInvariant(version.provenance.length > 0, 'published knowledge requires provenance');
    assertInvariant(await this.artifacts.verify(version.bodyRef), 'knowledge body artifact failed integrity verification');
    for (const ref of decision.evidenceRefs) {
      assertInvariant(await this.artifacts.verify(ref), `publication evidence failed integrity verification: ${ref.artifactId}`);
    }
    const publicationKey = `${version.moduleId}:${version.versionId}:${run.policyId}`;
    const existing = this.repository.getPublication(publicationKey);
    if (existing) return { ...existing, replayed: true };
    const now = this.clock();
    const publishing = run.state === 'PUBLISHING'
      ? run
      : this.flywheelDomain.transition(run, 'PUBLISHING', now);
    const verified = this.flywheelDomain.transition(publishing, 'VERIFIED', now);
    return this.repository.publish(publicationKey, verified, version, decision, createEvent(runId, 'KnowledgePublished', {
      publicationKey, versionId, decisionId,
    }, now));
  }

  async executeNode(
    input: Omit<NodeCheckpoint, 'status' | 'outputRefs' | 'retryCount' | 'updatedAt'>,
    operation: () => Promise<ArtifactRef[]>,
  ): Promise<NodeCheckpoint> {
    this.requireRun(input.runId);
    assertInvariant(input.nodeId.trim().length > 0, 'checkpoint nodeId is required');
    assertInvariant(input.generationKey.trim().length > 0, 'checkpoint generationKey is required');
    for (const ref of input.inputRefs) {
      assertArtifactRef(ref);
      assertInvariant(await this.artifacts.verify(ref), `node input artifact failed integrity verification: ${ref.artifactId}`);
    }
    const existing = this.repository.getCheckpoint(input.generationKey);
    if (existing) this.assertCheckpointScope(existing, input);
    if (existing?.status === 'COMMITTED') return existing;
    const now = this.clock();
    const claimed = this.repository.claimCheckpoint({
      ...input,
      status: 'RUNNING',
      outputRefs: [],
      retryCount: existing ? existing.retryCount + 1 : 0,
      updatedAt: now,
    });
    if (claimed.status === 'COMMITTED') return claimed;
    try {
      const outputRefs = await operation();
      for (const ref of outputRefs) {
        assertArtifactRef(ref);
        assertInvariant(await this.artifacts.verify(ref), `node output artifact failed integrity verification: ${ref.artifactId}`);
      }
      return this.repository.commitCheckpoint(claimed.generationKey, claimed.retryCount, outputRefs, createEvent(
        claimed.runId,
        'NodeCompleted',
        { nodeId: claimed.nodeId, generationKey: claimed.generationKey, outputRefs },
        this.clock(),
      ), this.clock());
    } catch (error) {
      const failedAt = this.clock();
      this.repository.failCheckpoint(claimed.generationKey, claimed.retryCount, createEvent(
        claimed.runId,
        'NodeFailed',
        {
          nodeId: claimed.nodeId,
          generationKey: claimed.generationKey,
          error: error instanceof Error ? error.message : String(error),
        },
        failedAt,
      ), failedAt);
      throw error;
    }
  }

  getKnowledgeVersion(versionId: string): KnowledgeVersion | null {
    return this.repository.getKnowledgeVersion(versionId);
  }

  getRun(runId: string): FlywheelRun | null {
    return this.repository.getRun(runId);
  }

  findKnowledgeVersionByBody(moduleId: string, artifactId: string): KnowledgeVersion | null {
    return this.repository.findKnowledgeVersionByBody(moduleId, artifactId);
  }

  evaluateQuality(body: string, input: Parameters<QualityPolicy['evaluate']>[1]): ReturnType<QualityPolicy['evaluate']> {
    return this.qualityPolicy.evaluate(body, input);
  }

  putArtifact(bytes: Uint8Array, mediaType: string): Promise<ArtifactRef> {
    return this.artifacts.put(bytes, mediaType);
  }

  getArtifact(ref: ArtifactRef): Promise<Uint8Array> {
    return this.artifacts.get(ref);
  }

  listKnowledgeVersions(statuses?: string[]): KnowledgeVersion[] {
    return this.repository.listKnowledgeVersions(statuses);
  }

  listRunSummaries(states?: string[]): Record<string, unknown>[] {
    assertInvariant(this.runProjections !== undefined, 'run projection reader is not configured');
    return this.runProjections.listRunSummaries(states);
  }

  getRunSnapshot(runId: string): Record<string, unknown> | null {
    assertInvariant(this.runProjections !== undefined, 'run projection reader is not configured');
    return this.runProjections.getRunSnapshot(runId, this.listKnowledgeVersions());
  }

  listActionItems(filters?: Record<string, string>): Record<string, unknown>[] {
    assertInvariant(this.runProjections !== undefined, 'run projection reader is not configured');
    return this.runProjections.listActionItems(filters);
  }

  getActionItem(actionItemId: string): Record<string, unknown> | null {
    assertInvariant(this.runProjections !== undefined, 'run projection reader is not configured');
    return this.runProjections.getActionItem(actionItemId);
  }

  getRunProgress(runId: string): Record<string, unknown> | null {
    assertInvariant(this.runProjections !== undefined, 'run projection reader is not configured');
    return this.runProjections.getRunProgress(runId);
  }

  listActivities(filters?: Record<string, string>): Record<string, unknown>[] {
    assertInvariant(this.runProjections !== undefined, 'run projection reader is not configured');
    return this.runProjections.listActivities(filters);
  }

  recordFeedback(versionId: string, action: string, rating: number | null, note = ''): void {
    this.requireVersion(versionId);
    assertInvariant(['hit', 'rate', 'correct'].includes(action), 'unsupported feedback action');
    if (action === 'rate') assertInvariant(rating !== null && rating >= 0 && rating <= 5, 'rating must be 0..5');
    this.repository.recordFeedback(versionId, action, rating, note, this.clock());
  }

  status(): Record<string, unknown> {
    return this.repository.status();
  }

  private requireRun(runId: string): FlywheelRun {
    const run = this.repository.getRun(runId);
    assertInvariant(run !== null, `run not found: ${runId}`);
    return run;
  }

  private requireVersion(versionId: string): KnowledgeVersion {
    const version = this.repository.getKnowledgeVersion(versionId);
    assertInvariant(version !== null, `knowledge version not found: ${versionId}`);
    return version;
  }

  private assertCheckpointScope(
    checkpoint: NodeCheckpoint,
    input: Omit<NodeCheckpoint, 'status' | 'outputRefs' | 'retryCount' | 'updatedAt'>,
  ): void {
    assertInvariant(checkpoint.runId === input.runId && checkpoint.nodeId === input.nodeId, 'generationKey scope collision');
    assertInvariant(
      checkpoint.inputRefs.map((ref) => ref.artifactId).join('\0') === input.inputRefs.map((ref) => ref.artifactId).join('\0'),
      'generationKey input collision',
    );
  }
}

export { DeterministicQualityPolicy } from './quality-policy.ts';
export { KnowledgeQueryService } from './query-service.ts';
export { runRealSourceFlow } from './project-flow.ts';
export { AgentCatalogService, RegistryWorkflowObserver } from './workflow-control.ts';
export {
  AGENT_COMMAND_SCHEMA_ID, AGENT_RESULT_SCHEMA_ID, RegistryRunConfigurationService,
} from './run-configuration.ts';
export { AutomatedProjectWorkflowService, OhMyWorkPanelWorkflowExecutor } from './automated-project-workflow.ts';
export type { AutomatedProjectScenario } from './automated-project-workflow.ts';
export type { RealSourceFlowReport, RealSourceScenario } from './project-flow.ts';
