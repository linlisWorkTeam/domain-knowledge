/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义Domain的领域数据与确定性业务规则。
 */
import { createHash, randomUUID } from 'node:crypto';

/** 对外提供STATES，作为调用方使用的统一约定。 */
export const RUN_STATES = [
  'CREATED', 'PLANNED', 'GENERATING', 'EVALUATING', 'REVIEWING',
  'ITERATING', 'ROLLING_BACK', 'PUBLISHING', 'VERIFIED',
  'LOW_CONFIDENCE', 'FAILED', 'CANCELLED',
] as const;

/** 定义运行状态的数据结构与类型约束。 */
export type RunState = typeof RUN_STATES[number];
/** 对外提供OUTCOMES，作为调用方使用的统一约定。 */
export const GATE_OUTCOMES = ['PASS', 'ITERATE', 'STOPPED'] as const;
/** 定义门禁结果的数据结构与类型约束。 */
export type GateOutcome = typeof GATE_OUTCOMES[number];
/** 定义知识状态的数据结构与类型约束。 */
export type KnowledgeStatus = 'CANDIDATE' | 'VERIFIED' | 'LOW_CONFIDENCE' | 'SUPERSEDED';
/** 定义质量结果的数据结构与类型约束。 */
export type QualityOutcome = 'ACCEPTED' | 'REJECTED';
/** 对外提供TYPES，作为调用方使用的统一约定。 */
export const DOMAIN_EVENT_TYPES = [
  'RunCreated', 'RunStateChanged', 'ArtifactCommitted', 'GateDecided',
  'KnowledgePublished', 'NodeCompleted', 'NodeFailed', 'AgentPromptConfigured',
  'WorkflowNodeStateChanged', 'RunConfigurationCaptured', 'ComponentStatusChanged',
] as const;
/** 定义Domain事件类型的数据结构与类型约束。 */
export type DomainEventType = typeof DOMAIN_EVENT_TYPES[number];

/** 工件引用。 */
export interface ArtifactRef {
  /** 提供工件标识信息，供调用方读取或传入。 */
  artifactId: string;
  /** 提供媒体类型信息，供调用方读取或传入。 */
  mediaType: string;
  /** 提供SHA256信息，供调用方读取或传入。 */
  sha256: string;
  /** 提供大小信息，供调用方读取或传入。 */
  size: number;
}

/** 定义来源证据引用的数据结构与类型约束。 */
export interface ProvenanceRef {
  /** 提供路径信息，供调用方读取或传入。 */
  path: string;
  /** 提供lines信息，供调用方读取或传入。 */
  lines?: string;
  /** 提供提交信息，供调用方读取或传入。 */
  commit?: string;
  /** 提供symbol信息，供调用方读取或传入。 */
  symbol?: string;
  /** 提供URL信息，供调用方读取或传入。 */
  url?: string;
  /** 提供pinned信息，供调用方读取或传入。 */
  pinned?: boolean;
}

/** 飞轮运行。 */
export interface FlywheelRun {
  /** 提供运行标识信息，供调用方读取或传入。 */
  runId: string;
  /** 提供模块标识信息，供调用方读取或传入。 */
  moduleId: string;
  /** 提供策略标识信息，供调用方读取或传入。 */
  policyId: string;
  /** 提供state信息，供调用方读取或传入。 */
  state: RunState;
  /** 提供轮次信息，供调用方读取或传入。 */
  iteration: number;
  /** 提供best版本标识信息，供调用方读取或传入。 */
  bestVersionId: string | null;
  /** 提供创建时间信息，供调用方读取或传入。 */
  createdAt: string;
  /** 提供更新时间信息，供调用方读取或传入。 */
  updatedAt: string;
}

/** 知识版本。 */
export interface KnowledgeVersion {
  /** 提供版本标识信息，供调用方读取或传入。 */
  versionId: string;
  /** 提供模块标识信息，供调用方读取或传入。 */
  moduleId: string;
  /** 提供父级版本标识信息，供调用方读取或传入。 */
  parentVersionId: string | null;
  /** 提供正文引用信息，供调用方读取或传入。 */
  bodyRef: ArtifactRef;
  /** 提供来源证据信息，供调用方读取或传入。 */
  provenance: ProvenanceRef[];
  /** 提供状态信息，供调用方读取或传入。 */
  status: KnowledgeStatus;
  /** 提供质量结果信息，供调用方读取或传入。 */
  qualityOutcome: QualityOutcome;
  /** 提供质量Score信息，供调用方读取或传入。 */
  qualityScore: number;
  /** 提供gate判定标识信息，供调用方读取或传入。 */
  gateDecisionId: string | null;
  /** 提供标题信息，供调用方读取或传入。 */
  title: string;
  /** 提供说明信息，供调用方读取或传入。 */
  description: string;
  /** 提供分类信息，供调用方读取或传入。 */
  category: string;
  /** 提供标签信息，供调用方读取或传入。 */
  tags: string[];
  /** 提供元数据信息，供调用方读取或传入。 */
  metadata: Record<string, unknown>;
  /** 提供创建时间信息，供调用方读取或传入。 */
  createdAt: string;
}

/** 定义评测报告的数据结构与类型约束。 */
export interface EvaluationReport {
  /** 提供report标识信息，供调用方读取或传入。 */
  reportId: string;
  /** 提供运行标识信息，供调用方读取或传入。 */
  runId: string;
  /** 提供版本标识信息，供调用方读取或传入。 */
  versionId: string;
  /** 提供输入引用列表信息，供调用方读取或传入。 */
  inputRefs: ArtifactRef[];
  /** 提供证据引用列表信息，供调用方读取或传入。 */
  evidenceRefs: ArtifactRef[];
  /** 提供工具链指纹信息，供调用方读取或传入。 */
  toolchainFingerprint: string;
  /** 提供criticalFailures信息，供调用方读取或传入。 */
  criticalFailures: number;
  /** 提供测试通过数信息，供调用方读取或传入。 */
  testsPassed: number;
  /** 提供测试总数信息，供调用方读取或传入。 */
  testsTotal: number;
  /** 提供稳定性信息，供调用方读取或传入。 */
  stability: number;
  /** 提供infrastructureFailure信息，供调用方读取或传入。 */
  infrastructureFailure: boolean;
  /** 提供check阻塞信息，供调用方读取或传入。 */
  checkBlocking?: boolean;
  /** 知识风险独立于代码检查；旧记录缺失时按 false 读取。 */
  knowledgeRiskBlocking?: boolean;
  /** 提供review阻塞信息，供调用方读取或传入。 */
  reviewBlocking?: boolean;
  /** 提供创建时间信息，供调用方读取或传入。 */
  createdAt: string;
}

/** 门禁策略。 */
export interface GatePolicy {
  /** 提供策略标识信息，供调用方读取或传入。 */
  policyId: string;
  /** 提供最低稳定性信息，供调用方读取或传入。 */
  minimumStability: number;
  /** 提供要求全部测试信息，供调用方读取或传入。 */
  requireAllTests: boolean;
  /** 提供最大Iterations信息，供调用方读取或传入。 */
  maxIterations: number;
}

/** 门禁判定。 */
export interface GateDecision {
  /** 提供decision标识信息，供调用方读取或传入。 */
  decisionId: string;
  /** 提供运行标识信息，供调用方读取或传入。 */
  runId: string;
  /** 提供版本标识信息，供调用方读取或传入。 */
  versionId: string;
  /** 提供结果信息，供调用方读取或传入。 */
  outcome: GateOutcome;
  /** 提供原因Codes信息，供调用方读取或传入。 */
  reasonCodes: string[];
  /** 提供证据引用列表信息，供调用方读取或传入。 */
  evidenceRefs: ArtifactRef[];
  /** 提供创建时间信息，供调用方读取或传入。 */
  createdAt: string;
}

/** 定义Domain事件的数据结构与类型约束。 */
export interface DomainEvent {
  /** 提供event标识信息，供调用方读取或传入。 */
  eventId: string;
  /** 提供event类型信息，供调用方读取或传入。 */
  eventType: DomainEventType;
  /** 提供Schema版本信息，供调用方读取或传入。 */
  schemaVersion: '1.0';
  /** 提供运行标识信息，供调用方读取或传入。 */
  runId: string;
  /** 提供occurred时间信息，供调用方读取或传入。 */
  occurredAt: string;
  /** 提供causation标识信息，供调用方读取或传入。 */
  causationId: string | null;
  /** 提供业务载荷信息，供调用方读取或传入。 */
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

/** 校验Invariant。 */
export function assertInvariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`DOMAIN_INVARIANT: ${message}`);
}

/** 提供 SHA256 对应的SHA256操作。 */
export function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** 提供 工件标识For 对应的工件标识For操作。 */
export function artifactIdFor(hash: string): string {
  assertInvariant(/^[a-f0-9]{64}$/.test(hash), 'sha256 must be lowercase hex');
  return `sha256:${hash}`;
}

/** 创建工件引用。 */
export function createArtifactRef(bytes: Uint8Array, mediaType: string): ArtifactRef {
  assertInvariant(mediaType.trim().length > 0, 'artifact mediaType is required');
  const digest = sha256(bytes);
  return { artifactId: artifactIdFor(digest), mediaType, sha256: digest, size: bytes.byteLength };
}

/** 校验工件引用。 */
export function assertArtifactRef(ref: ArtifactRef): void {
  assertInvariant(ref.artifactId === artifactIdFor(ref.sha256), 'artifactId must bind to sha256');
  assertInvariant(Number.isSafeInteger(ref.size) && ref.size >= 0, 'artifact size must be non-negative');
  assertInvariant(ref.mediaType.trim().length > 0, 'artifact mediaType is required');
}

/** 创建运行。 */
export function createRun(moduleId: string, policyId: string, now: string): FlywheelRun {
  assertInvariant(moduleId.trim().length > 0, 'moduleId is required');
  assertInvariant(policyId.trim().length > 0, 'policyId is required');
  return {
    runId: randomUUID(), moduleId, policyId, state: 'CREATED', iteration: 0,
    bestVersionId: null, createdAt: now, updatedAt: now,
  };
}

/** 业务 Run 只能沿允许的生命周期迁移，工作流节点完成不能直接替代知识验收。 */
export function transitionRun(run: FlywheelRun, next: RunState, now: string): FlywheelRun {
  assertInvariant(TRANSITIONS[run.state].has(next), `illegal run transition ${run.state} -> ${next}`);
  const iteration = next === 'ITERATING' ? run.iteration + 1 : run.iteration;
  assertInvariant(iteration >= run.iteration, 'run iteration cannot decrease');
  return { ...run, state: next, iteration, updatedAt: now };
}

/** 以独立评测事实和冻结策略计算门禁结果，Agent 的通过建议不能直接批准发布。 */
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
    if (outcome !== 'STOPPED') outcome = run.iteration + 1 >= policy.maxIterations ? 'STOPPED' : 'ITERATE';
    reasons.push('CHECK_BLOCKING');
  }
  if (report.knowledgeRiskBlocking) {
    if (outcome !== 'STOPPED') outcome = run.iteration + 1 >= policy.maxIterations ? 'STOPPED' : 'ITERATE';
    reasons.push('KNOWLEDGE_RISK_UNRESOLVED');
  }
  if (report.reviewBlocking) {
    if (outcome !== 'STOPPED') outcome = run.iteration + 1 >= policy.maxIterations ? 'STOPPED' : 'ITERATE';
    reasons.push('REVIEW_BLOCKING');
  }
  if (report.criticalFailures > 0) {
    if (outcome !== 'STOPPED') outcome = run.iteration + 1 >= policy.maxIterations ? 'STOPPED' : 'ITERATE';
    reasons.push('CRITICAL_TEST_FAILURE');
  }
  if (policy.requireAllTests && report.testsPassed !== report.testsTotal) {
    if (outcome !== 'STOPPED') outcome = run.iteration + 1 >= policy.maxIterations ? 'STOPPED' : 'ITERATE';
    reasons.push('TESTS_INCOMPLETE');
  }
  if (report.stability < policy.minimumStability) {
    if (outcome !== 'STOPPED') outcome = run.iteration + 1 >= policy.maxIterations ? 'STOPPED' : 'ITERATE';
    reasons.push('STABILITY_BELOW_THRESHOLD');
  }
  if (outcome === 'PASS') reasons.push('ALL_DETERMINISTIC_GATES_PASSED');
  return {
    decisionId: randomUUID(), runId: run.runId, versionId: report.versionId,
    outcome, reasonCodes: [...new Set(reasons)], evidenceRefs: report.evidenceRefs, createdAt: now,
  };
}

/** 创建事件。 */
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
