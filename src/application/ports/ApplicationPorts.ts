/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：定义 Application 与存储、运行时、模型及外部能力之间的端口契约。
 */
/** 统一引用 Domain 拥有的源码发现、工作空间和业务角色定义契约。 */
import type { KnowledgeDiscoveryCandidate, KnowledgeDiscoveryPort } from '../../domain/sourceScan/SourceScan.ts';
import type { AgentWorkspaceProvider, AgentWorkspaceView } from '../../domain/workspace/LocalAgentWorkspace.ts';
import type { AgentDefinition } from '../../domain/workflow/AgentDefinitions.ts';
export type { KnowledgeDiscoveryCandidate, KnowledgeDiscoveryPort } from '../../domain/sourceScan/SourceScan.ts';
export type { AgentWorkspaceProvider, AgentWorkspaceView } from '../../domain/workspace/LocalAgentWorkspace.ts';
export type { AgentDefinition } from '../../domain/workflow/AgentDefinitions.ts';
import type { AgentId, AgentCommand, AgentResult } from '../../domain/agents/AgentContracts.ts';
/** 统一导出本模块的公共符号，供其他层通过明确入口引用。 */
export { AGENT_IDS, type AgentId, type AgentCommand, type AgentResult } from '../../domain/agents/AgentContracts.ts';
import type {
  ArtifactRef, DomainEvent, EvaluationReport, FlywheelRun, GateDecision, GatePolicy,
  KnowledgeVersion, ProvenanceRef,
} from '../../domain/Domain.ts';

/** 工件存储。 */
export interface ArtifactStore {
  /** 保存工件正文并返回按内容摘要寻址的引用。 */
  put(bytes: Uint8Array, mediaType: string): Promise<ArtifactRef>;
  /** 根据工件引用读取正文；读取失败由具体存储适配器报告。 */
  get(ref: ArtifactRef): Promise<Uint8Array>;
  /** 检查工件正文与引用中的摘要、大小是否一致。 */
  verify(ref: ArtifactRef): Promise<boolean>;
}

/** 定义候选输入的数据结构与类型约束。 */
export interface CandidateInput {
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
  /** 提供质量结果信息，供调用方读取或传入。 */
  qualityOutcome: 'ACCEPTED' | 'REJECTED';
  /** 提供质量Score信息，供调用方读取或传入。 */
  qualityScore: number;
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

/** 定义Flywheel仓库的数据结构与类型约束。 */
export interface FlywheelRepository {
  /** 初始化请求。 */
  initialize(): void;
  /** 保存运行。 */
  saveRun(run: FlywheelRun, event: DomainEvent): void;
  /** 读取指定运行的业务状态。 */
  getRun(runId: string): FlywheelRun | null;
  /** 更新运行。 */
  updateRun(run: FlywheelRun, event: DomainEvent): void;
  /** 保存候选。 */
  saveCandidate(input: CandidateInput, event: DomainEvent): KnowledgeVersion;
  /** 读取知识版本。 */
  getKnowledgeVersion(versionId: string): KnowledgeVersion | null;
  /** 查找知识版本By正文。 */
  findKnowledgeVersionByBody(moduleId: string, artifactId: string): KnowledgeVersion | null;
  /** 提供 latest知识版本 对应的latest知识版本操作。 */
  latestKnowledgeVersion(moduleId: string): KnowledgeVersion | null;
  /** 列出知识Versions。 */
  listKnowledgeVersions(statuses?: string[]): KnowledgeVersion[];
  /** 保存评测And判定。 */
  saveEvaluationAndDecision(
    report: EvaluationReport,
    decision: GateDecision,
    reviewingRun: FlywheelRun,
    gateEvent: DomainEvent,
    transitionEvent: DomainEvent,
  ): void;
  /** 读取评测And判定。 */
  getEvaluationAndDecision(runId: string, versionId: string): {
    report: EvaluationReport;
    decision: GateDecision;
  } | null;
  /** 读取门禁判定。 */
  getGateDecision(decisionId: string): GateDecision | null;
  /** 依据确定性门禁结果发布知识。 */
  publish(
    publicationKey: string,
    run: FlywheelRun,
    version: KnowledgeVersion,
    decision: GateDecision,
    event: DomainEvent,
  ): { publicationKey: string; versionId: string; publishedAt: string; replayed: boolean };
  /** 读取发布。 */
  getPublication(publicationKey: string): { publicationKey: string; versionId: string; publishedAt: string } | null;
  /** 记录反馈。 */
  recordFeedback(versionId: string, action: string, rating: number | null, note: string, now: string): void;
  /** 列出运行的审计事件。 */
  listEvents(runId: string): DomainEvent[];
  /** 读取检查点。 */
  getCheckpoint(generationKey: string): NodeCheckpoint | null;
  /** 已校验测试集按源码身份保存，与 Run 和模型配置无关。 */
  getValidatedTestSuite(sourceKey: string): ArtifactRef | null;
  saveValidatedTestSuite(sourceKey: string, suiteRef: ArtifactRef): ArtifactRef;
  /** 申请检查点。 */
  claimCheckpoint(checkpoint: NodeCheckpoint): NodeCheckpoint;
  /** 提供 提交Checkpoint 对应的提交检查点操作。 */
  commitCheckpoint(generationKey: string, retryCount: number, outputRefs: ArtifactRef[], event: DomainEvent, now: string): NodeCheckpoint;
  /** 提供 failCheckpoint 对应的fail检查点操作。 */
  failCheckpoint(generationKey: string, retryCount: number, event: DomainEvent, now: string): NodeCheckpoint;
  /** 列出角色提示词Configurations。 */
  listAgentPromptConfigurations(): AgentPromptConfiguration[];
  /** 保存角色提示词配置。 */
  saveAgentPromptConfiguration(configuration: AgentPromptConfiguration, event: DomainEvent): AgentPromptConfiguration;
  /** 保存运行配置。 */
  saveRunConfiguration(snapshot: RunConfigurationSnapshot, event: DomainEvent): RunConfigurationSnapshot;
  /** 读取运行配置。 */
  getRunConfiguration(runId: string): RunConfigurationSnapshot | null;
  /** 记录工作流节点Projection。 */
  recordWorkflowNodeProjection(projection: WorkflowNodeProjection, event: DomainEvent): void;
  /** 记录Operational事件。 */
  recordOperationalEvent(event: DomainEvent): void;
  /** 列出工作流节点Projections。 */
  listWorkflowNodeProjections(runId: string): WorkflowNodeProjection[];
  /** 应用ActionItemAction。 */
  applyActionItemAction(input: {
    actionItemId: string;
    action: 'ACKNOWLEDGE' | 'RESOLVE' | 'RETRY' | 'REGENERATE';
    expectedRevision: number;
    reason: string;
    feedback?: string;
    commandRunId?: string;
    auditId: string;
    occurredAt: string;
    actor: string;
  }): Record<string, unknown>;
  /** 读取命令回执。 */
  getCommandReceipt(scope: string, idempotencyKey: string): {
    fingerprint: string;
    status: number;
    value: unknown;
  } | null;
  /** 保存命令回执。 */
  saveCommandReceipt(input: {
    scope: string;
    idempotencyKey: string;
    fingerprint: string;
    status: number;
    value: unknown;
    createdAt: string;
  }): void;
  /** 提供 状态 对应的状态操作。 */
  status(): Record<string, unknown>;
  /** Optional versioned policy resolver. Adapters without DEV-008 use the supplied policy unchanged. */
  /** 解析评测策略。 */
  resolveEvaluationPolicy?(policy: GatePolicy): GatePolicy;
}

/** 定义节点检查点的数据结构与类型约束。 */
export interface NodeCheckpoint {
  /** 提供运行标识信息，供调用方读取或传入。 */
  runId: string;
  /** 提供节点标识信息，供调用方读取或传入。 */
  nodeId: string;
  /** 提供生成键信息，供调用方读取或传入。 */
  generationKey: string;
  /** 提供状态信息，供调用方读取或传入。 */
  status: 'RUNNING' | 'COMMITTED' | 'FAILED';
  /** 提供输入引用列表信息，供调用方读取或传入。 */
  inputRefs: ArtifactRef[];
  /** 提供输出引用列表信息，供调用方读取或传入。 */
  outputRefs: ArtifactRef[];
  /** 提供retry数量信息，供调用方读取或传入。 */
  retryCount: number;
  /** 提供更新时间信息，供调用方读取或传入。 */
  updatedAt: string;
}

/** 定义质量报告的数据结构与类型约束。 */
export interface QualityReport {
  /** 提供score信息，供调用方读取或传入。 */
  score: number;
  /** 提供结果信息，供调用方读取或传入。 */
  outcome: 'ACCEPTED' | 'REJECTED';
  /** 提供signals信息，供调用方读取或传入。 */
  signals: Record<string, number>;
  /** 提供weakPoints信息，供调用方读取或传入。 */
  weakPoints: string[];
}

/** 定义质量策略的数据结构与类型约束。 */
export interface QualityPolicy {
  /** 评估请求。 */
  evaluate(body: string, input: {
    title: string;
    description: string;
    provenance: ProvenanceRef[];
  }): QualityReport;
}

/** Read-only projection consumed by Application use cases, implemented by an adapter. */
/** 定义运行ProjectionReader的数据结构与类型约束。 */
export interface RunProjectionReader {
  /** 列出运行Summaries。 */
  listRunSummaries(states?: string[]): Record<string, unknown>[];
  /** 读取运行快照。 */
  getRunSnapshot(runId: string, versions: KnowledgeVersion[]): Record<string, unknown> | null;
  /** 列出ActionItems。 */
  listActionItems(filters?: Record<string, string>): Record<string, unknown>[];
  /** 读取ActionItem。 */
  getActionItem(actionItemId: string): Record<string, unknown> | null;
  /** 读取运行Progress。 */
  getRunProgress(runId: string): Record<string, unknown> | null;
  /** 列出Activities。 */
  listActivities(filters?: Record<string, string>): Record<string, unknown>[];
}

/** 定义Demo报告Builder的数据结构与类型约束。 */
export interface DemoReportBuilder {
  /** 构造请求。 */
  build(runId: string): Promise<Record<string, unknown>>;
}

/** 定义评测Submission的数据结构与类型约束。 */
export interface EvaluationSubmission {
  /** 提供运行标识信息，供调用方读取或传入。 */
  runId: string;
  /** 提供版本标识信息，供调用方读取或传入。 */
  versionId: string;
  /** 提供输入引用列表信息，供调用方读取或传入。 */
  inputRefs?: ArtifactRef[];
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
  infrastructureFailure?: boolean;
  /** 提供check阻塞信息，供调用方读取或传入。 */
  checkBlocking?: boolean;
  /** 提供review阻塞信息，供调用方读取或传入。 */
  reviewBlocking?: boolean;
}

/** 定义EvalRunnerUse用例的数据结构与类型约束。 */
export interface EvalRunnerUseCase {
  /** 评估请求。 */
  evaluate(input: EvaluationSubmission, policy: GatePolicy): Promise<{
    report: EvaluationReport;
    decision: GateDecision;
  }>;
}

/** 定义知识发现候选的数据结构与类型约束。 */
/** 定义Legacy知识Migration端口的数据结构与类型约束。 */
export interface LegacyKnowledgeMigrationPort {
  /** 提供 migrate 对应的migrate操作。 */
  migrate(legacyKnowledgeRoot: string): Promise<{
    imported: number;
    replayed: number;
    rejected: number;
    errors: { file: string; error: string }[];
  }>;
}

/** 定义角色上下文快照的数据结构与类型约束。 */
export interface AgentContextSnapshot {
  /** 提供轮次信息，供调用方读取或传入。 */
  iteration: number;
  /** 提供尝试次数信息，供调用方读取或传入。 */
  attempt: number;
  /** 提供输入引用列表信息，供调用方读取或传入。 */
  inputRefs: ArtifactRef[];
  /** 提供输出引用列表信息，供调用方读取或传入。 */
  outputRefs: ArtifactRef[];
  /** 提供route信息，供调用方读取或传入。 */
  route: 'PASS' | 'ITERATE' | 'STOPPED' | 'FAILED' | null;
}

/** 定义角色上下文存储的数据结构与类型约束。 */
export interface AgentContextStore {
  /** 读取请求。 */
  get(runId: string, nodeId: string): Promise<AgentContextSnapshot | null>;
  /** 设置请求。 */
  set(runId: string, nodeId: string, context: AgentContextSnapshot, ttlMs: number): Promise<void>;
  /** 删除请求。 */
  delete(runId: string, nodeId: string): Promise<void>;
}

/** 定义Running状态租约的数据结构与类型约束。 */
export interface RunningStateLease {
  /** 提供运行标识信息，供调用方读取或传入。 */
  runId: string;
  /** 提供持有者标识信息，供调用方读取或传入。 */
  ownerId: string;
  /** 提供租约标识信息，供调用方读取或传入。 */
  leaseId: string;
  /** 提供过期时间信息，供调用方读取或传入。 */
  expiresAt: string;
}

/** 定义Running状态存储的数据结构与类型约束。 */
export interface RunningStateStore {
  /** 提供 acquire 对应的acquire操作。 */
  acquire(runId: string, ownerId: string, ttlMs: number): Promise<RunningStateLease | null>;
  /** 读取请求。 */
  get(runId: string): Promise<RunningStateLease | null>;
  /** 释放请求。 */
  release(runId: string, ownerId: string, leaseId: string): Promise<boolean>;
}

/** 定义角色请求的数据结构与类型约束。 */
export interface AgentRequest {
  /** 提供authorized工具信息，供调用方读取或传入。 */
  authorizedTools?: readonly string[];
  /** 提供role信息，供调用方读取或传入。 */
  role: string;
  /** 提供提示词信息，供调用方读取或传入。 */
  prompt: string;
  /** 提供输出Schema信息，供调用方读取或传入。 */
  outputSchema: Record<string, unknown>;
  /** 提供幂等键信息，供调用方读取或传入。 */
  idempotencyKey: string;
  /** Validated workflow command. Providers may transport it but cannot redefine it. */
  /** 提供命令信息，供调用方读取或传入。 */
  command?: AgentCommand;
  /** 提供输入引用列表信息，供调用方读取或传入。 */
  inputRefs?: ArtifactRef[];
  /** Trusted workspace selected by the workflow, never by model output. */
  /** 提供workspace根目录信息，供调用方读取或传入。 */
  workspaceRoot?: string;
  /** Non-secret correlation fields copied into provider audit records. */
  /** 提供元数据信息，供调用方读取或传入。 */
  metadata?: Record<string, string | number | boolean | null>;
}

/** 定义角色提供方的数据结构与类型约束。 */
export interface AgentProvider {
  /** 运行请求。 */
  run(request: AgentRequest, signal?: AbortSignal): Promise<Record<string, unknown>>;
}

/** 定义提供方Verification状态的数据结构与类型约束。 */
export type ProviderVerificationStatus = 'NOT_CONFIGURED' | 'UNVERIFIED' | 'VERIFIED' | 'FAILED';

/** 定义提供方设置Record的数据结构与类型约束。 */
export interface ProviderSettingsRecord {
  /** 提供提供方信息，供调用方读取或传入。 */
  provider: 'deepseek-harness' | 'pi-agent';
  /** 提供APIURL信息，供调用方读取或传入。 */
  apiUrl: string;
  /** 提供API键信息，供调用方读取或传入。 */
  apiKey: string | null;
  /** 提供模型信息，供调用方读取或传入。 */
  model: string | null;
  /** 提供启用状态信息，供调用方读取或传入。 */
  enabled: boolean;
  /** 提供修订号信息，供调用方读取或传入。 */
  revision: number;
  /** 提供verification状态信息，供调用方读取或传入。 */
  verificationStatus: ProviderVerificationStatus;
  /** 提供verification原因Code信息，供调用方读取或传入。 */
  verificationReasonCode: string;
  /** 提供lastVerified时间信息，供调用方读取或传入。 */
  lastVerifiedAt: string | null;
  /** 提供verified指纹信息，供调用方读取或传入。 */
  verifiedFingerprint: string | null;
  /** 提供更新时间信息，供调用方读取或传入。 */
  updatedAt: string;
}

/** 定义Dsh执行Parameters的数据结构与类型约束。 */
export interface DshExecutionParameters {
  /** 提供runtimeSHA256信息，供调用方读取或传入。 */
  runtimeSha256?: string;
  /** 提供API信息，供调用方读取或传入。 */
  api: 'openai-completions';
  /** 提供最大Token信息，供调用方读取或传入。 */
  maxTokens: number;
  /** 提供最大SchemaAttempts信息，供调用方读取或传入。 */
  maxSchemaAttempts: number;
  /** 提供上下文窗口信息，供调用方读取或传入。 */
  contextWindow: number;
}

/** 定义Dsh运行时配置的数据结构与类型约束。 */
export interface DshRuntimeConfiguration extends DshExecutionParameters {
  /** 提供settings信息，供调用方读取或传入。 */
  settings: ProviderSettingsRecord;
}

/** Secret-bearing persistence boundary. Implementations must never expose this record to HTTP directly. */
/** 定义提供方设置存储的数据结构与类型约束。 */
export interface ProviderSettingsStore {
  /** 加载请求。 */
  load(): ProviderSettingsRecord | null;
  /** 保存请求。 */
  save(record: ProviderSettingsRecord): void;
}

/** 定义提供方Endpoint的数据结构与类型约束。 */
export interface ProviderEndpoint {
  /** 提供URL信息，供调用方读取或传入。 */
  url: URL;
  /** 提供addresses信息，供调用方读取或传入。 */
  addresses: readonly string[];
}

/** Resolves and rejects unsafe destinations before either persistence or a network probe. */
/** 定义提供方Endpoint策略的数据结构与类型约束。 */
export interface ProviderEndpointPolicy {
  /** 校验请求。 */
  validate(apiUrl: string): Promise<ProviderEndpoint>;
}

/** 定义提供方Probe结果的数据结构与类型约束。 */
export interface ProviderProbeResult {
  /** 提供状态信息，供调用方读取或传入。 */
  status: 'VERIFIED' | 'FAILED';
  /** 提供原因Code信息，供调用方读取或传入。 */
  reasonCode: string;
  /** 提供模型信息，供调用方读取或传入。 */
  model: string | null;
}

/** 定义提供方ConnectionProbe的数据结构与类型约束。 */
export interface ProviderConnectionProbe {
  /** 验证请求。 */
  verify(input: {
    endpoint: ProviderEndpoint;
    apiKey: string | null;
    model: string | null;
  }): Promise<ProviderProbeResult>;
}

/** 定义提供方InvocationRecord的数据结构与类型约束。 */
export interface ProviderInvocationRecord {
  /** 提供invocation标识信息，供调用方读取或传入。 */
  invocationId: string;
  /** 提供运行标识信息，供调用方读取或传入。 */
  runId: string;
  /** 提供角色标识信息，供调用方读取或传入。 */
  agentId: string;
  /** 提供提供方信息，供调用方读取或传入。 */
  provider: string;
  /** 提供模型信息，供调用方读取或传入。 */
  model: string;
  /** 提供启动时间信息，供调用方读取或传入。 */
  startedAt: string;
  /** 提供完成时间信息，供调用方读取或传入。 */
  completedAt: string;
  /** 提供耗时毫秒信息，供调用方读取或传入。 */
  durationMs: number;
  /** 提供状态信息，供调用方读取或传入。 */
  status: 'SUCCEEDED' | 'FAILED';
  /** 提供retry数量信息，供调用方读取或传入。 */
  retryCount: number;
  /** 提供输入Token信息，供调用方读取或传入。 */
  inputTokens: number | null;
  /** 提供输出Token信息，供调用方读取或传入。 */
  outputTokens: number | null;
  /** 提供cacheReadToken信息，供调用方读取或传入。 */
  cacheReadTokens: number | null;
  /** 提供cacheWriteToken信息，供调用方读取或传入。 */
  cacheWriteTokens: number | null;
  /** 提供估算费用美元信息，供调用方读取或传入。 */
  estimatedCostUsd: number | null;
  /** 提供fixture信息，供调用方读取或传入。 */
  fixture: boolean;
  /** 提供错误Code信息，供调用方读取或传入。 */
  errorCode: string | null;
}

/** 定义Operational指标端口的数据结构与类型约束。 */
export interface OperationalMetricsPort {
  /** 记录提供方Invocation。 */
  recordProviderInvocation(record: ProviderInvocationRecord): void;
  /** 提供 runs 对应的runs操作。 */
  runs(window: '24h' | '7d' | '30d'): Record<string, unknown>;
  /** 提供 governance 对应的governance操作。 */
  governance(window: '24h' | '7d' | '30d'): Record<string, unknown>;
}

/** Runtime boundary for the versioned schemas under docs/specs/schemas. */
/** 定义角色契约校验器的数据结构与类型约束。 */
export interface AgentContractValidator {
  /** 校验命令。 */
  assertCommand(command: AgentCommand): void;
  /** 校验结果。 */
  assertResult(result: AgentResult): void;
}

/** 定义角色工作区视图的数据结构与类型约束。 */
/** 定义Sandbox结果的数据结构与类型约束。 */
export interface SandboxResult {
  /** 提供exitCode信息，供调用方读取或传入。 */
  exitCode: number;
  /** 提供stdout引用信息，供调用方读取或传入。 */
  stdoutRef: ArtifactRef;
  /** 提供stderr引用信息，供调用方读取或传入。 */
  stderrRef: ArtifactRef;
  /** 提供timedOut信息，供调用方读取或传入。 */
  timedOut: boolean;
  /** 提供resourceUsage信息，供调用方读取或传入。 */
  resourceUsage: Record<string, number>;
}

/** 定义Sandbox的数据结构与类型约束。 */
export interface Sandbox {
  /** 执行当前角色或业务阶段并返回结构化结果。 */
  execute(command: string, args: string[], inputRefs: ArtifactRef[], signal?: AbortSignal): Promise<SandboxResult>;
}

/** 定义语言Plugin的数据结构与类型约束。 */
export interface LanguagePlugin {
  /** 提供语言标识信息，供调用方读取或传入。 */
  readonly languageId: string;
  /** 提供 compile 对应的compile操作。 */
  compile(sourceRefs: ArtifactRef[], sandbox: Sandbox, signal?: AbortSignal): Promise<SandboxResult>;
  /** 提供 测试 对应的测试操作。 */
  test(binaryRef: ArtifactRef, testRefs: ArtifactRef[], sandbox: Sandbox, signal?: AbortSignal): Promise<SandboxResult>;
}

/** 定义项目工具的数据结构与类型约束。 */
export type ProjectTool = 'node' | 'pnpm' | 'cargo' | 'gcc' | 'g++' | 'binary';

/** 定义项目命令的数据结构与类型约束。 */
export interface ProjectCommand {
  /** 提供工具信息，供调用方读取或传入。 */
  tool: ProjectTool;
  /** 提供purpose信息，供调用方读取或传入。 */
  purpose: 'setup' | 'test' | 'check';
  /** 提供args信息，供调用方读取或传入。 */
  args: string[];
  /** 提供cwd信息，供调用方读取或传入。 */
  cwd?: string;
  /** 提供repetitions信息，供调用方读取或传入。 */
  repetitions?: number;
  /** 提供超时毫秒信息，供调用方读取或传入。 */
  timeoutMs?: number;
  /** 提供最大输出字节信息，供调用方读取或传入。 */
  maxOutputBytes?: number;
}

/** 定义Generated项目文件的数据结构与类型约束。 */
export interface GeneratedProjectFile {
  /** 提供路径信息，供调用方读取或传入。 */
  path: string;
  /** 提供内容信息，供调用方读取或传入。 */
  content: string;
}

/** 项目快照。 */
export interface ProjectSnapshot {
  /** 提供仓库根目录信息，供调用方读取或传入。 */
  repositoryRoot: string;
  /** 提供远程信息，供调用方读取或传入。 */
  remote: string;
  /** 提供checkoutHead信息，供调用方读取或传入。 */
  checkoutHead: string;
  /** 提供提交信息，供调用方读取或传入。 */
  commit: string;
  /** 提供dirty信息，供调用方读取或传入。 */
  dirty: boolean;
  /** 提供源码路径列表信息，供调用方读取或传入。 */
  sourcePaths: string[];
  /** 提供publicInterface路径列表信息，供调用方读取或传入。 */
  publicInterfacePaths: string[];
  /** 提供清单引用信息，供调用方读取或传入。 */
  manifestRef: ArtifactRef;
}

/** 定义项目命令结果的数据结构与类型约束。 */
export interface ProjectCommandResult {
  /** 提供phase信息，供调用方读取或传入。 */
  phase: 'prepare' | 'gate';
  /** 提供工具信息，供调用方读取或传入。 */
  tool: ProjectTool;
  /** 提供purpose信息，供调用方读取或传入。 */
  purpose: ProjectCommand['purpose'];
  /** 提供args信息，供调用方读取或传入。 */
  args: string[];
  /** 提供cwd信息，供调用方读取或传入。 */
  cwd: string;
  /** 提供尝试次数信息，供调用方读取或传入。 */
  attempt: number;
  /** 提供exitCode信息，供调用方读取或传入。 */
  exitCode: number | null;
  /** 提供timedOut信息，供调用方读取或传入。 */
  timedOut: boolean;
  /** 提供输出上限Exceeded信息，供调用方读取或传入。 */
  outputLimitExceeded: boolean;
  /** 提供耗时毫秒信息，供调用方读取或传入。 */
  durationMs: number;
  /** 提供stdout信息，供调用方读取或传入。 */
  stdout: string;
  /** 提供stderr信息，供调用方读取或传入。 */
  stderr: string;
  /** 提供测试通过数信息，供调用方读取或传入。 */
  testsPassed: number;
  /** 提供测试总数信息，供调用方读取或传入。 */
  testsTotal: number;
  /** 提供测试CountsParsed信息，供调用方读取或传入。 */
  testCountsParsed: boolean;
}

/** 定义项目评测的数据结构与类型约束。 */
export interface ProjectEvaluation {
  /** 提供label信息，供调用方读取或传入。 */
  label: string;
  /** 提供提交信息，供调用方读取或传入。 */
  commit: string;
  /** 提供通过数信息，供调用方读取或传入。 */
  passed: boolean;
  /** 提供测试通过数信息，供调用方读取或传入。 */
  testsPassed: number;
  /** 提供测试总数信息，供调用方读取或传入。 */
  testsTotal: number;
  /** 提供稳定性信息，供调用方读取或传入。 */
  stability: number;
  /** 提供infrastructureFailure信息，供调用方读取或传入。 */
  infrastructureFailure: boolean;
  /** 提供工具链指纹信息，供调用方读取或传入。 */
  toolchainFingerprint: string;
  /** 提供generated文件Digests信息，供调用方读取或传入。 */
  generatedFileDigests: Record<string, string>;
  /** 提供results信息，供调用方读取或传入。 */
  results: ProjectCommandResult[];
  /** 提供证据引用信息，供调用方读取或传入。 */
  evidenceRef: ArtifactRef;
}

/** 定义项目Evaluator的数据结构与类型约束。 */
export interface ProjectEvaluator {
  /** 检查请求。 */
  inspect(input: {
    repositoryRoot: string;
    expectedCommit?: string;
    sourcePaths: string[];
    publicInterfacePaths: string[];
  }): Promise<ProjectSnapshot>;
  /** 评估请求。 */
  evaluate(input: {
    label: string;
    snapshot: ProjectSnapshot;
    generatedFiles: GeneratedProjectFile[];
    replaceSourcePaths?: string[];
    prepareCommands: ProjectCommand[];
    commands: ProjectCommand[];
  }, signal?: AbortSignal): Promise<ProjectEvaluation>;
}

/** 角色定义。 */
/** 定义角色提示词配置的数据结构与类型约束。 */
export interface AgentPromptConfiguration {
  /** 提供角色标识信息，供调用方读取或传入。 */
  agentId: AgentId;
  /** 提供提示词追加信息，供调用方读取或传入。 */
  promptAddon: string;
  /** 提供修订号信息，供调用方读取或传入。 */
  revision: number;
  /** 提供更新时间信息，供调用方读取或传入。 */
  updatedAt: string | null;
}

/** 定义角色运行配置的数据结构与类型约束。 */
export interface AgentRunConfiguration {
  /** 提供角色标识信息，供调用方读取或传入。 */
  agentId: AgentId;
  /** 提供提示词修订号信息，供调用方读取或传入。 */
  promptRevision: number;
  /** 提供基础提示词SHA256信息，供调用方读取或传入。 */
  basePromptSha256: string;
  /** 提供提示词追加SHA256信息，供调用方读取或传入。 */
  promptAddonSha256: string;
  /** 提供生效提示词SHA256信息，供调用方读取或传入。 */
  effectivePromptSha256: string;
  /** 提供生效提示词引用信息，供调用方读取或传入。 */
  effectivePromptRef: ArtifactRef;
  /** 提供工具信息，供调用方读取或传入。 */
  tools: string[];
}

/** 定义运行配置快照的数据结构与类型约束。 */
export interface RunConfigurationSnapshot {
  /** 提供role执行版本信息，供调用方读取或传入。 */
  roleExecutionVersion?: string;
  /** 提供Schema版本信息，供调用方读取或传入。 */
  schemaVersion: '1.0';
  /** 提供运行标识信息，供调用方读取或传入。 */
  runId: string;
  /** 提供提供方信息，供调用方读取或传入。 */
  provider: {
    kind: string;
    model: string;
    parametersSha256: string;
  };
  /** 提供contracts信息，供调用方读取或传入。 */
  contracts: {
    commandSchema: 'https://wpknowledge.local/schemas/agent-command/v1';
    resultSchema: 'https://wpknowledge.local/schemas/agent-result/v1';
    commandSchemaSha256: string;
    resultSchemaSha256: string;
  };
  /** 提供agents信息，供调用方读取或传入。 */
  agents: AgentRunConfiguration[];
  /** 提供governanceTrigger信息，供调用方读取或传入。 */
  governanceTrigger?: {
    parentRunId: string;
    causedByActionItemId: string;
    reasonSha256: string;
    feedbackRef: ArtifactRef;
  } | null;
  /** 提供captured时间信息，供调用方读取或传入。 */
  capturedAt: string;
}

/** 定义运行配置管理器的数据结构与类型约束。 */
export interface RunConfigurationManager {
  /** 冻结当前运行所使用的配置。 */
  capture(runId: string, governanceTrigger?: {
    parentRunId: string;
    causedByActionItemId: string;
    reason: string;
    feedback: string;
  }): Promise<RunConfigurationSnapshot>;
  /** 读取请求。 */
  get(runId: string): RunConfigurationSnapshot | null;
  /** 检查冻结配置是否允许恢复执行。 */
  assertCompatible(runId: string): Promise<RunConfigurationSnapshot>;
  /** 读取当前运行冻结的有效提示词。 */
  resolvePrompt(runId: string, agentId: AgentId): Promise<string>;
}

/** 定义工作流节点状态的数据结构与类型约束。 */
export type WorkflowNodeStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

/** 定义工作流节点Projection的数据结构与类型约束。 */
export interface WorkflowNodeProjection {
  /** 提供运行标识信息，供调用方读取或传入。 */
  runId: string;
  /** 提供节点标识信息，供调用方读取或传入。 */
  nodeId: string;
  /** 提供角色标识信息，供调用方读取或传入。 */
  agentId: AgentId | null;
  /** 提供状态信息，供调用方读取或传入。 */
  status: WorkflowNodeStatus;
  /** 提供轮次信息，供调用方读取或传入。 */
  iteration: number;
  /** 提供尝试次数信息，供调用方读取或传入。 */
  attempt: number;
  /** 提供详情信息，供调用方读取或传入。 */
  detail: string;
  /** 提供错误信息，供调用方读取或传入。 */
  error: string | null;
  /** Time at which the scheduler proved the node eligible for this attempt. */
  /** 提供就绪时间信息，供调用方读取或传入。 */
  readyAt: string | null;
  /** 提供启动时间信息，供调用方读取或传入。 */
  startedAt: string | null;
  /** 提供完成时间信息，供调用方读取或传入。 */
  completedAt: string | null;
  /** 提供更新时间信息，供调用方读取或传入。 */
  updatedAt: string;
}

/** 定义Start工作流命令的数据结构与类型约束。 */
export interface StartWorkflowCommand {
  /** 提供运行标识信息，供调用方读取或传入。 */
  runId: string;
  /** 提供最大Iterations信息，供调用方读取或传入。 */
  maxIterations: number;
  /** 提供分块任务数量信息，供调用方读取或传入。 */
  workerCount: number;
  /** 提供上下文信息，供调用方读取或传入。 */
  context?: Record<string, unknown>;
}

/** 定义工作流句柄的数据结构与类型约束。 */
export interface WorkflowHandle {
  /** 提供运行标识信息，供调用方读取或传入。 */
  runId: string;
  /** 提供execution状态信息，供调用方读取或传入。 */
  executionStatus: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'STOPPED' | 'CANCELLED';
}

/** 定义工作流执行视图的数据结构与类型约束。 */
export interface WorkflowExecutionView extends WorkflowHandle {
  /** 提供current节点信息，供调用方读取或传入。 */
  currentNode: string | null;
  /** 提供轮次信息，供调用方读取或传入。 */
  iteration: number;
  /** 提供最大Iterations信息，供调用方读取或传入。 */
  maxIterations: number;
  /** 提供route信息，供调用方读取或传入。 */
  route: 'PASS' | 'ITERATE' | 'STOPPED' | 'FAILED' | null;
  /** 提供错误信息，供调用方读取或传入。 */
  error: string | null;
}

/** 定义工作流Engine的数据结构与类型约束。 */
export interface WorkflowEngine {
  /** 启动请求。 */
  start(command: StartWorkflowCommand): Promise<WorkflowHandle>;
  /** 恢复请求。 */
  resume(runId: string): Promise<WorkflowHandle>;
  /** 取消请求。 */
  cancel(runId: string): Promise<void>;
  /** 等待请求。 */
  wait(runId: string): Promise<WorkflowExecutionView>;
  /** 提供 状态 对应的状态操作。 */
  status(runId: string): Promise<WorkflowExecutionView>;
}

/** 定义工作流Stage输入的数据结构与类型约束。 */
export interface WorkflowStageInput {
  /** 提供运行标识信息，供调用方读取或传入。 */
  runId: string;
  /** 提供节点标识信息，供调用方读取或传入。 */
  nodeId: string;
  /** 提供角色标识信息，供调用方读取或传入。 */
  agentId: AgentId | null;
  /** 提供轮次信息，供调用方读取或传入。 */
  iteration: number;
  /** 提供最大Iterations信息，供调用方读取或传入。 */
  maxIterations: number;
  /** 提供尝试次数信息，供调用方读取或传入。 */
  attempt: number;
  /** 提供提示词信息，供调用方读取或传入。 */
  prompt: string;
  /** 提供上下文信息，供调用方读取或传入。 */
  context: Record<string, unknown>;
  /** 提供分块任务标识信息，供调用方读取或传入。 */
  workerId?: string;
  /** 提供分块任务Index信息，供调用方读取或传入。 */
  workerIndex?: number;
  /** 提供分块任务数量信息，供调用方读取或传入。 */
  workerCount: number;
  /** 提供取消信号信息，供调用方读取或传入。 */
  signal?: AbortSignal;
}

/** 定义工作流Stage结果的数据结构与类型约束。 */
export interface WorkflowStageResult {
  /** 提供详情信息，供调用方读取或传入。 */
  detail: string;
  /** 提供上下文信息，供调用方读取或传入。 */
  context?: Record<string, unknown>;
  /** 提供route信息，供调用方读取或传入。 */
  route?: 'PASS' | 'ITERATE' | 'STOPPED' | 'FAILED';
}

/** 定义工作流StageExecutor的数据结构与类型约束。 */
export interface WorkflowStageExecutor {
  /** 执行当前角色或业务阶段并返回结构化结果。 */
  execute(input: WorkflowStageInput): Promise<WorkflowStageResult>;
}

/** 定义工作流观察器的数据结构与类型约束。 */
export interface WorkflowObserver {
  /** 记录请求。 */
  record(projection: WorkflowNodeProjection): void;
  /** 提供 next尝试次数 对应的next尝试次数操作。 */
  nextAttempt?(runId: string, nodeId: string, iteration: number): number;
}

/** 定义角色提示词Resolver的数据结构与类型约束。 */
export interface AgentPromptResolver {
  /** 读取当前运行冻结的有效提示词。 */
  resolvePrompt?(runId: string, agentId: AgentId): Promise<string>;
  /** Compatibility path for tests without a persisted RunConfigurationSnapshot. */
  /** 读取提示词Addon。 */
  getPromptAddon?(agentId: AgentId): string;
}

/** 有界任务执行器：失败时取消同批任务，等待在途调用结束后再返回。 */
export interface TaskBatchRunner {
  run<T>(tasks: Array<(signal: AbortSignal) => Promise<T>>, signal?: AbortSignal): Promise<T[]>;
}
