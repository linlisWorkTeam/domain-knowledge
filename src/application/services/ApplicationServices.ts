/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：协调ApplicationServices用例及其依赖的领域规则与端口。
 */
import { randomUUID } from 'node:crypto';
import {
  assertArtifactRef, assertInvariant, createEvent, sha256,
} from '../../domain/Domain.ts';
import type {
  ArtifactRef, EvaluationReport, FlywheelRun, GateDecision, GatePolicy,
  KnowledgeVersion, ProvenanceRef, RunState,
} from '../../domain/Domain.ts';
import { EvalRunnerDomainService } from '../../domain/evaluation/EvalRunnerDomainService.ts';
import { FlywheelDomainService } from '../../domain/workflow/FlywheelDomainService.ts';
import type {
  ArtifactStore, EvaluationSubmission, FlywheelRepository, NodeCheckpoint, QualityPolicy,
  RunProjectionReader,
} from '../ports/ApplicationPorts.ts';

/** 定义候选请求的数据结构与类型约束。 */
export interface CandidateRequest {
  /** 提供模块标识信息，供调用方读取或传入。 */
  moduleId: string;
  /** 提供正文信息，供调用方读取或传入。 */
  body: string;
  /** 提供标题信息，供调用方读取或传入。 */
  title?: string;
  /** 提供说明信息，供调用方读取或传入。 */
  description?: string;
  /** 提供分类信息，供调用方读取或传入。 */
  category?: string;
  /** 提供标签信息，供调用方读取或传入。 */
  tags?: string[];
  /** 提供来源证据信息，供调用方读取或传入。 */
  provenance: ProvenanceRef[];
  /** 提供元数据信息，供调用方读取或传入。 */
  metadata?: Record<string, unknown>;
}

/** 定义评测输入的数据结构与类型约束。 */
export type EvaluationInput = EvaluationSubmission;

/** 封装知识Flywheel服务的对外操作与协作依赖。 */
export class KnowledgeFlywheelService {
  /** 提供artifacts信息，供调用方读取或传入。 */
  readonly artifacts: ArtifactStore;
  /** 提供仓库信息，供调用方读取或传入。 */
  readonly repository: FlywheelRepository;
  /** 提供质量策略信息，供调用方读取或传入。 */
  readonly qualityPolicy: QualityPolicy;
  /** 提供flywheelDomain信息，供调用方读取或传入。 */
  readonly flywheelDomain: FlywheelDomainService;
  /** 提供evalRunnerDomain信息，供调用方读取或传入。 */
  readonly evalRunnerDomain: EvalRunnerDomainService;
  /** 提供运行Projections信息，供调用方读取或传入。 */
  readonly runProjections?: RunProjectionReader;
  /** 提供 时钟 对应的时钟操作。 */
  readonly clock: () => string;

  /** 注入协作依赖并初始化实例状态。 */
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

  /** 创建运行。 */
  createRun(moduleId: string, policyId: string): FlywheelRun {
    const now = this.clock();
    const run = this.flywheelDomain.createRun(moduleId, policyId, now);
    this.repository.saveRun(run, createEvent(run.runId, 'RunCreated', { moduleId, policyId }, now));
    return run;
  }

  recordReviewHandoff(runId: string, payload: Record<string, unknown>): void {
    const event = createEvent(runId, 'ReviewHandoffPrepared', payload, this.clock());
    event.eventId = `review-handoff:${sha256(`${runId}:${String(payload.handoffKey ?? payload.decisionId)}`)}`;
    this.repository.recordOperationalEvent(event);
  }

  /** 固定 Orchestrator 已校验计划选中的模块。 */
  selectRunModule(runId: string, moduleId: string): void {
    const run = this.requireRun(runId);
    if (run.moduleId === moduleId) return;
    const now = this.clock();
    const updated = this.flywheelDomain.selectModule(run, moduleId, now);
    this.repository.updateRun(updated, createEvent(runId, 'RunModuleSelected', { previousModuleId: run.moduleId, moduleId }, now));
  }

  /** 迁移请求。 */
  transition(runId: string, next: RunState): FlywheelRun {
    const current = this.requireRun(runId);
    const now = this.clock();
    const updated = this.flywheelDomain.transition(current, next, now);
    this.repository.updateRun(updated, createEvent(runId, 'RunStateChanged', {
      from: current.state, to: next, iteration: updated.iteration,
    }, now));
    return updated;
  }

  /** 写入知识候选正文及其来源信息。 */
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

  /** 记录评测。 */
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
    assertInvariant(input.testsTotal >= 0 && (input.testsTotal > 0 || input.criticalFailures > 0 || input.infrastructureFailure === true) && input.testsPassed >= 0 && input.testsTotal >= input.testsPassed, 'behavioral evaluation must execute at least one test');
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
    const effectivePolicy = this.repository.resolveEvaluationPolicy?.(policy) ?? policy;
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
    const decision = this.evalRunnerDomain.decide(run, report, effectivePolicy, now);
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

  /** 依据确定性门禁结果发布知识。 */
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

  /** 读取Committed节点Outputs。 */
  getCommittedNodeOutputs(input: { runId: string; nodeId: string; generationKey: string }): ArtifactRef[] | null {
    this.requireRun(input.runId);
    const checkpoint = this.repository.getCheckpoint(input.generationKey);
    if (!checkpoint) return null;
    assertInvariant(checkpoint.runId === input.runId && checkpoint.nodeId === input.nodeId,
      'checkpoint scope mismatch');
    return checkpoint.status === 'COMMITTED' ? structuredClone(checkpoint.outputRefs) : null;
  }

  /** 按生成键执行节点并幂等提交结果。 */
  /** 读取已校验源码测试集的不可变引用。 */
  getValidatedTestSuite(sourceKey: string): ArtifactRef | null { return this.repository.getValidatedTestSuite(sourceKey); }
  /** 仅接受已保存且身份一致的测试集工件，再以首次成功值固定索引。 */
  async saveValidatedTestSuite(sourceKey: string, suiteRef: ArtifactRef): Promise<ArtifactRef> {
    assertInvariant(await this.artifacts.verify(suiteRef), 'validated test suite integrity mismatch');
    const suite = JSON.parse(Buffer.from(await this.artifacts.get(suiteRef)).toString('utf8'));
    assertInvariant(suite.sourceKey === sourceKey && suite.validationEvidenceRef, 'validated test suite source mismatch');
    assertInvariant(await this.artifacts.verify(suite.validationEvidenceRef), 'validated test evidence integrity mismatch');
    const evidence = JSON.parse(Buffer.from(await this.artifacts.get(suite.validationEvidenceRef)).toString('utf8'));
    assertInvariant(evidence.passed === true && evidence.infrastructureFailure === false && evidence.testsTotal > 0, 'test suite must pass reference validation');
    return this.repository.saveValidatedTestSuite(sourceKey, suiteRef);
  }

  async executeNode(
    input: Omit<NodeCheckpoint, 'status' | 'outputRefs' | 'retryCount' | 'updatedAt'>,
    /** 提供 operation 对应的operation操作。 */
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

  /** 读取知识版本。 */
  getKnowledgeVersion(versionId: string): KnowledgeVersion | null {
    return this.repository.getKnowledgeVersion(versionId);
  }

  /** 读取指定运行的业务状态。 */
  getRun(runId: string): FlywheelRun | null {
    return this.repository.getRun(runId);
  }

  /** 查找知识版本By正文。 */
  findKnowledgeVersionByBody(moduleId: string, artifactId: string): KnowledgeVersion | null {
    return this.repository.findKnowledgeVersionByBody(moduleId, artifactId);
  }

  /** 评估质量。 */
  evaluateQuality(body: string, input: Parameters<QualityPolicy['evaluate']>[1]): ReturnType<QualityPolicy['evaluate']> {
    return this.qualityPolicy.evaluate(body, input);
  }

  /** 保存工件。 */
  putArtifact(bytes: Uint8Array, mediaType: string): Promise<ArtifactRef> {
    return this.artifacts.put(bytes, mediaType);
  }

  /** 读取工件。 */
  getArtifact(ref: ArtifactRef): Promise<Uint8Array> {
    return this.artifacts.get(ref);
  }

  /** 列出知识Versions。 */
  listKnowledgeVersions(statuses?: string[]): KnowledgeVersion[] {
    return this.repository.listKnowledgeVersions(statuses);
  }

  /** 列出运行Summaries。 */
  listRunSummaries(states?: string[]): Record<string, unknown>[] {
    assertInvariant(this.runProjections !== undefined, 'run projection reader is not configured');
    return this.runProjections.listRunSummaries(states);
  }

  /** 读取运行快照。 */
  getRunSnapshot(runId: string): Record<string, unknown> | null {
    assertInvariant(this.runProjections !== undefined, 'run projection reader is not configured');
    return this.runProjections.getRunSnapshot(runId, this.listKnowledgeVersions());
  }

  /** 列出ActionItems。 */
  listActionItems(filters?: Record<string, string>): Record<string, unknown>[] {
    assertInvariant(this.runProjections !== undefined, 'run projection reader is not configured');
    return this.runProjections.listActionItems(filters);
  }

  /** 读取ActionItem。 */
  getActionItem(actionItemId: string): Record<string, unknown> | null {
    assertInvariant(this.runProjections !== undefined, 'run projection reader is not configured');
    return this.runProjections.getActionItem(actionItemId);
  }

  /** 读取运行Progress。 */
  getRunProgress(runId: string): Record<string, unknown> | null {
    assertInvariant(this.runProjections !== undefined, 'run projection reader is not configured');
    return this.runProjections.getRunProgress(runId);
  }

  /** 列出Activities。 */
  listActivities(filters?: Record<string, string>): Record<string, unknown>[] {
    assertInvariant(this.runProjections !== undefined, 'run projection reader is not configured');
    return this.runProjections.listActivities(filters);
  }

  /** 应用ActionItemAction。 */
  applyActionItemAction(input: {
    actionItemId: string;
    action: 'ACKNOWLEDGE' | 'RESOLVE' | 'RETRY' | 'REGENERATE';
    expectedRevision: number;
    reason: string;
    feedback?: string;
    commandRunId?: string;
    actor?: string;
  }): Record<string, unknown> {
    assertInvariant(input.reason.trim().length > 0, 'ARGUMENT_REQUIRED: reason');
    assertInvariant(Number.isSafeInteger(input.expectedRevision) && input.expectedRevision > 0,
      'ARGUMENT_INVALID: expectedRevision must be a positive integer');
    return this.repository.applyActionItemAction({
      ...input,
      reason: input.reason.trim(),
      feedback: input.feedback?.trim(),
      auditId: `aia_${randomUUID()}`,
      occurredAt: this.clock(),
      actor: input.actor ?? 'local-admin',
    });
  }

  /** 提供 observeComponentUnavailable 对应的observeComponentUnavailable操作。 */
  observeComponentUnavailable(component: string, reasonCode: string, runIds: string[]): void {
    assertInvariant(component.trim().length > 0, 'ARGUMENT_REQUIRED: component');
    assertInvariant(reasonCode.trim().length > 0, 'ARGUMENT_REQUIRED: reasonCode');
    const now = this.clock();
    for (const runId of [...new Set(runIds)]) {
      const run = this.requireRun(runId);
      if (['VERIFIED', 'LOW_CONFIDENCE', 'FAILED', 'CANCELLED'].includes(run.state)) continue;
      const duplicate = this.listActionItems({ runId, type: 'COMPONENT_UNAVAILABLE' }).some((item) => (
        item.status !== 'RESOLVED' && item.reasonCode === reasonCode
      ));
      if (duplicate) continue;
      this.repository.recordOperationalEvent(createEvent(runId, 'ComponentStatusChanged', {
        component, status: 'UNAVAILABLE', reasonCode,
      }, now));
    }
  }

  /** 读取命令回执。 */
  getCommandReceipt(scope: string, idempotencyKey: string): {
    fingerprint: string; status: number; value: unknown;
  } | null {
    return this.repository.getCommandReceipt(scope, idempotencyKey);
  }

  /** 保存命令回执。 */
  saveCommandReceipt(input: {
    scope: string; idempotencyKey: string; fingerprint: string; status: number; value: unknown;
  }): void {
    this.repository.saveCommandReceipt({ ...input, createdAt: this.clock() });
  }

  /** 记录反馈。 */
  recordFeedback(versionId: string, action: string, rating: number | null, note = ''): void {
    this.requireVersion(versionId);
    assertInvariant(['hit', 'rate', 'correct'].includes(action), 'unsupported feedback action');
    if (action === 'rate') assertInvariant(rating !== null && rating >= 0 && rating <= 5, 'rating must be 0..5');
    this.repository.recordFeedback(versionId, action, rating, note, this.clock());
  }

  /** 提供 状态 对应的状态操作。 */
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

/** 统一导出本模块的公共符号，供其他层通过明确入口引用。 */
export { DeterministicQualityPolicy } from './QualityPolicy.ts';
/** 统一导出本模块的公共符号，供其他层通过明确入口引用。 */
export { KnowledgeQueryService } from './QueryService.ts';
/** 统一导出本模块的公共符号，供其他层通过明确入口引用。 */
export { runRealSourceFlow } from './ProjectFlow.ts';
/** 统一导出本模块的公共符号，供其他层通过明确入口引用。 */
export { AgentCatalogService, RegistryWorkflowObserver } from './WorkflowControl.ts';
/** 统一导出本模块的公共符号，供其他层通过明确入口引用。 */
export {
  AGENT_COMMAND_SCHEMA_ID, AGENT_RESULT_SCHEMA_ID, RegistryRunConfigurationService,
} from './RunConfiguration.ts';
/** 统一导出本模块的公共符号，供其他层通过明确入口引用。 */
export { AutomatedProjectWorkflowService, ProjectWorkflowStages } from './AutomatedProjectWorkflow.ts';
/** 统一导出本模块对外使用的类型契约。 */
/** 统一导出本模块的公共符号，供其他层通过明确入口引用。 */
export type { AutomatedProjectScenario } from './AutomatedProjectWorkflow.ts';
/** 统一导出本模块对外使用的类型契约。 */
/** 统一导出本模块的公共符号，供其他层通过明确入口引用。 */
export type { RealSourceFlowReport, RealSourceScenario } from './ProjectFlow.ts';
