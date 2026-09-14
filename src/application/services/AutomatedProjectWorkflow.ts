/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：加载工作流上下文与历史工件，协调角色执行、独立评测和发布。
 */
import { assessRisks, collectRisks, type KnowledgeRisk } from '../../domain/knowledge/KnowledgeRisks.ts';
import type { Output as PlanOutput } from '../../domain/agents/orchestratorAgent/OrchestratorAgentContract.ts';
import { hasExecutableCases, TEST_CASE_PROTOCOL } from '../../domain/agents/testGenAgent/TestGenAgentContract.ts';
import type { Output as TestOutput } from '../../domain/agents/testGenAgent/TestGenAgentContract.ts';
import { canStartIteration, canContinueIteration } from '../../domain/workflow/IterationBudget.ts';
import { sourceIdentity, testValidationAction } from '../../domain/agents/testGenAgent/TestSuitePolicy.ts';
import { validateProjectAgentConfiguration } from '../../domain/agents/ProjectAgentConfiguration.ts';
import { renderKnowledgeDocument } from '../../domain/knowledge/KnowledgeDocument.ts';
import type { Output as DocumentOutput } from '../../domain/agents/docGenAgent/DocGenAgentContract.ts';
import type { Output as CodeOutput } from '../../domain/agents/codeAgent/CodeAgentContract.ts';
import type { Output as CheckOutput } from '../../domain/agents/checkAgent/CheckAgentContract.ts';
import type { Output as WorkbenchReviewOutput } from '../../domain/agents/reviewAgent/WorkbenchReviewContract.ts';
import type { Output as ReviewOutput } from '../../domain/agents/reviewAgent/ReviewAgentContract.ts';
import type { Output as BehaviorTestOutput } from '../../domain/agents/testGenAgent/BehaviorCasesContract.ts';
import type { ModuleBehaviorSuite } from '../../domain/agents/testGenAgent/ModuleBehaviorSuite.ts';
import { DocWorkerExecutionService } from './DocWorkerExecution.ts';
import type { Input as DocGenInput } from '../../domain/agents/docGenAgent/DocGenAgentContract.ts';
import { RoleExecutionService } from './RoleExecution.ts';
import type { ModelExecutionPort } from '../../domain/agents/AgentExecution.ts';
import type {
  AgentId,
  AgentCommand,
  AgentContractValidator,
  AgentProvider,
  AgentResult,
  EvalRunnerUseCase,
  ProjectEvaluation,
  ProjectEvaluator,
  ProjectSnapshot,
  QualityReport,
  RunConfigurationManager,
  WorkflowStageExecutor,
  WorkflowStageInput,
  WorkflowStageResult,
  WorkflowEngine,
  WorkflowExecutionView,
  WorkflowHandle,
} from '../ports/ApplicationPorts.ts';
import {
  assertInvariant, sha256, type ArtifactRef, type GateDecision, type GatePolicy,
} from '../../domain/Domain.ts';
import type { KnowledgeFlywheelService } from './ApplicationServices.ts';
import type { RealSourceScenario } from './ProjectFlow.ts';
import type { PublicationOperations } from './PublicationOperations.ts';

/** 定义Automated项目Scenario的数据结构与类型约束。 */
export interface AutomatedProjectScenario extends RealSourceScenario {
  /** 用户对 DocGen 提案的显式答复，在新任务中继续生成单文档。 */
  docGenDecision?: DocGenInput['payload']['documentDecision'];
}

function contextKey(nodeId: string, iteration: number, workerId?: string): string {
  return `${nodeId}:${iteration}${workerId ? `:${workerId}` : ''}`;
}

function routeFor(outcome: GateDecision['outcome']): WorkflowStageResult['route'] {
  return outcome;
}

/** 校验角色结果绑定。 */
export function assertAgentResultBinding(
  result: AgentResult,
  command: AgentCommand,
  expected: { runId: string; agentId: AgentId; generationKey: string },
): void {
  if (result.status !== 'SUCCEEDED'
    || result.runId !== expected.runId
    || result.agentType !== expected.agentId) {
    throw new Error(`AGENT_RESULT_ROLE_MISMATCH: expected ${expected.agentId}`);
  }
  if (command.commandId !== result.commandId
    || command.runId !== expected.runId
    || command.agentType !== expected.agentId
    || command.generationKey !== expected.generationKey) {
    throw new Error(`AGENT_RESULT_COMMAND_MISMATCH: expected ${expected.generationKey}`);
  }
}

/** 应用接线：解析工作流上下文、加载历史证据，再交给角色及统一提交服务。 */
export class ProjectWorkflowStages implements WorkflowStageExecutor {
  /** 内部 Worker 的冻结配置、观察器及技术任务执行器。 */
  readonly workerRuntime?: Pick<DocWorkerExecutionService['dependencies'], 'prompts' | 'observer' | 'tasks'>;
  readonly flywheel: KnowledgeFlywheelService;
  /** 提供evalRunner信息，供调用方读取或传入。 */
  readonly evalRunner: EvalRunnerUseCase;
  /** 提供evaluator信息，供调用方读取或传入。 */
  readonly evaluator: ProjectEvaluator;
  /** 提供角色信息，供调用方读取或传入。 */
  readonly agent?: AgentProvider;
  /** 提供 角色Resolver 对应的角色Resolver操作。 */
  readonly agentResolver?: (runId: string) => AgentProvider | undefined;
  /** 提供节点By角色信息，供调用方读取或传入。 */
  readonly nodeByAgent: Record<AgentId, string>;
  /** 提供contracts信息，供调用方读取或传入。 */
  readonly contracts: AgentContractValidator;
  readonly localPublication?: Pick<PublicationOperations, 'publish'>;
  /** 提供 模型Factory 对应的模型工厂操作。 */
  readonly modelFactory: (input: { provider?: AgentProvider; command: AgentCommand; stage: WorkflowStageInput; scenario: AutomatedProjectScenario }) => ModelExecutionPort;

  /** 注入协作依赖并初始化实例状态。 */
  constructor(input: {
    workerRuntime?: ProjectWorkflowStages['workerRuntime'];
    flywheel: KnowledgeFlywheelService;
    evalRunner: EvalRunnerUseCase;
    evaluator: ProjectEvaluator;
    nodeByAgent: Record<AgentId, string>;
    contracts: AgentContractValidator;
    modelFactory: ProjectWorkflowStages['modelFactory'];
    agent?: AgentProvider;
    agentResolver?: (runId: string) => AgentProvider | undefined;
    localPublication?: Pick<PublicationOperations, 'publish'>;
  }) {
    this.workerRuntime = input.workerRuntime;
    this.flywheel = input.flywheel;
    this.evalRunner = input.evalRunner;
    this.evaluator = input.evaluator;
    this.nodeByAgent = input.nodeByAgent;
    this.contracts = input.contracts;
    this.modelFactory = input.modelFactory;
    this.agent = input.agent;
    this.agentResolver = input.agentResolver;
    this.localPublication = input.localPublication;
  }

  /** 执行当前角色或业务阶段并返回结构化结果。 */
  async execute(input: WorkflowStageInput): Promise<WorkflowStageResult> {
    const scenario = input.context.scenario as AutomatedProjectScenario | undefined;
    if (!scenario || scenario.schemaVersion !== '1.0') throw new Error('WORKFLOW_SCENARIO_INVALID');
    if (input.nodeId === 'review' && input.context.testValidationRequired) return { route: 'STOPPED', detail: '测试参考校验未通过，等待人工处理' };
    switch (input.nodeId) {
      case 'orchestrator': return this.orchestrate(input, scenario);
      case 'doc_gen':
      case 'test_gen':
      case 'code':
      case 'check':
      case 'review':
        return this.executeAgent(input, scenario, input.agentId as AgentId);
      case 'candidate_knowledge': return this.commitCandidate(input, scenario);
      case 'oracle_validation': return this.validateOracle(input, scenario);
      case 'evaluation': return this.evaluate(input, scenario);
      case 'workflow_router': return this.route(input);
      case 'publication': return this.publish(input);
      default: throw new Error(`WORKFLOW_STAGE_UNSUPPORTED: ${input.nodeId}`);
    }
  }

  private async orchestrate(
    input: WorkflowStageInput,
    scenario: AutomatedProjectScenario,
  ): Promise<WorkflowStageResult> {
    assertInvariant(canStartIteration(input.iteration, input.maxIterations), 'WORKFLOW_ITERATION_LIMIT_EXCEEDED');
    const current = this.flywheel.getRun(input.runId);
    if (!current) throw new Error(`WORKFLOW_RUN_NOT_FOUND: ${input.runId}`);
    if (current.state === 'CREATED') this.flywheel.transition(input.runId, 'PLANNED');
    const planned = this.flywheel.getRun(input.runId);

    let snapshot = input.context.snapshot as ProjectSnapshot | undefined;
    let scenarioRef = input.context.scenarioRef as ArtifactRef | undefined;
    if (!snapshot) {
      snapshot = await this.evaluator.inspect({
        repositoryRoot: scenario.repositoryRoot,
        expectedCommit: scenario.expectedCommit,
        sourcePaths: scenario.sourcePaths,
        publicInterfacePaths: scenario.publicInterfacePaths,
      });
      scenarioRef = await this.flywheel.putArtifact(Buffer.from(JSON.stringify({
        ...scenario, repositoryRoot: snapshot.repositoryRoot, expectedCommit: snapshot.commit,
      }, null, 2)), 'application/json');
    }
    // 完整任务只供可信应用审计；模型材料不含门禁、参考测试或机器目录。
    const roleScenarioRef = input.context.roleScenarioRef as ArtifactRef | undefined ?? await this.flywheel.putArtifact(
      Buffer.from(JSON.stringify({ moduleId: scenario.moduleId, sourcePaths: scenario.sourcePaths,
        publicInterfacePaths: scenario.publicInterfacePaths, allowedGeneratedPaths: scenario.allowedGeneratedPaths,
        moduleContract: scenario.moduleContract,
        constraints: ['保留全部公开接口', '禁止引入外部依赖', '只输出允许路径', '不得硬编码测试结果'],
      })), 'application/json');
    const publicContractRef = scenario.moduleContract
      ? await this.flywheel.putArtifact(Buffer.from(JSON.stringify(scenario.moduleContract)), 'application/json') : undefined;
    const frozenSuiteRef = scenario.fixedSuite
      ? input.context.frozenSuiteRef as ArtifactRef | undefined ?? await this.flywheel.putArtifact(Buffer.from(JSON.stringify(scenario.fixedSuite)), 'application/json')
      : undefined;
    const commandInput = { ...input, context: { ...input.context, snapshot, scenarioRef, roleScenarioRef, publicContractRef, frozenSuiteRef } };
    const agent = await this.runRole(commandInput, scenario, 'orchestrator');
    const plan = await this.readAgentOutput<PlanOutput>(agent, 'orchestrator', commandInput);
    const moduleId = plan.tasks[0]!.moduleId;
    const selected = scenario.modules?.find((module) => module.moduleId === moduleId) ?? scenario;
    if (selected !== scenario) {
      snapshot = await this.evaluator.inspect({ ...selected, repositoryRoot: snapshot.repositoryRoot, expectedCommit: snapshot.commit });
      scenario = { ...selected, businessGoal: scenario.businessGoal, repositoryRoot: snapshot.repositoryRoot, expectedCommit: snapshot.commit };
      scenarioRef = await this.flywheel.putArtifact(Buffer.from(JSON.stringify(scenario)), 'application/json');
    }
    this.flywheel.selectRunModule(input.runId, moduleId);
    if (planned?.state === 'PLANNED' || planned?.state === 'ITERATING' || planned?.state === 'ROLLING_BACK') this.flywheel.transition(input.runId, 'GENERATING');
    if (input.signal?.aborted) throw new Error('AGENT_CANCELLED');
    await this.flywheel.executeNode({
      runId: input.runId, nodeId: 'project-scenario', generationKey: `${input.runId}:project-scenario`,
      inputRefs: [scenarioRef!],
    }, async () => [scenarioRef!]);
    return {
      detail: `planned iteration ${input.iteration}`,
      context: { snapshot, scenarioRef, scenario, roleScenarioRef, publicContractRef, frozenSuiteRef, taskPlan: plan.tasks, [contextKey(input.nodeId, input.iteration)]: agent },
    };
  }

  private async executeAgent(
    input: WorkflowStageInput,
    scenario: AutomatedProjectScenario,
    agentId: AgentId,
  ): Promise<WorkflowStageResult> {
    if (agentId === 'test-gen' && this.scenarioLanguage(scenario) !== 'typescript') {
      const cachedRef = this.flywheel.getValidatedTestSuite(await this.testSourceKey(input, scenario));
      if (cachedRef) {
        const cached = await this.readJson<{ output: TestOutput; protocolVersion?: string }>(cachedRef);
        if (cached.protocolVersion !== TEST_CASE_PROTOCOL || !hasExecutableCases(cached.output)) {
          const evidenceRef = await this.flywheel.putArtifact(Buffer.from(JSON.stringify({
            configurationFailure: 'TEST_CASE_PROTOCOL_INCOMPATIBLE', candidateRef: cachedRef,
            requiredProtocol: TEST_CASE_PROTOCOL, action: '请人工迁移或清除旧测试缓存后重新运行；同源测试不会自动重新生成。',
          })), 'application/json');
          return { route: 'STOPPED', detail: '旧测试协议需要人工迁移', context: { testValidationRequired: { candidateRef: cachedRef, evidenceRef, repairs: 0, infrastructureFailure: true } } };
        }
      }
    }
    const tasks = input.context.taskPlan as PlanOutput['tasks'] | undefined;
    if (tasks && !tasks.some((task) => task.agentType === agentId && task.moduleId === scenario.moduleId)) throw new Error('WORKFLOW_TASK_NOT_PLANNED');
    const ref = await this.runRole(input, scenario, agentId);
    return {
      detail: `${agentId} produced schema-validated role output`,
      context: { [contextKey(input.nodeId, input.iteration, input.workerId)]: ref,
        ...(agentId === 'test-gen' ? { testGenPrompt: input.prompt } : {}) },
    };
  }

  /** Business handoff only; sessions and tools belong to the injected provider. */
  private async runRole(
    input: WorkflowStageInput,
    scenario: AutomatedProjectScenario,
    agentId: AgentId,
  ): Promise<ArtifactRef> {
    return this.executeAgentCheckpoint(input, scenario, agentId);
  }

  // 工作流状态只在 Application 解析，领域角色接收的是明确的材料与命令 payload。
  private async executeAgentCheckpoint(
    input: WorkflowStageInput,
    scenario: AutomatedProjectScenario,
    agentId: AgentId,
  ): Promise<ArtifactRef> {
    const command = await this.buildAgentCommand(input, scenario, agentId);
    this.contracts.assertCommand(command);
    const materials = await Promise.all(this.artifactRefsIn(command.payload).map(async (ref) => ({
      ref, content: await this.readArtifact(ref),
    })));
    const snapshot = input.context.snapshot as ProjectSnapshot;
    const cachedSuite = agentId === 'test-gen' && this.scenarioLanguage(scenario) !== 'typescript' && !input.context.testRepair
      ? this.flywheel.getValidatedTestSuite(await this.testSourceKey(input, scenario)) : null;
    const cached = cachedSuite ? await this.readJson<{ output: TestOutput }>(cachedSuite) : undefined;
    return new RoleExecutionService(this.flywheel, this.contracts, this.nodeByAgent).execute({
      command, nodeId: input.workerId ? `${input.nodeId}:${input.workerId}` : input.nodeId,
      inputRefs: this.agentInputRefs(input, agentId),
      input: {
        payload: command.payload, materials,
        sourcePaths: scenario.sourcePaths,
        publicInterfacePaths: scenario.publicInterfacePaths,
        provenance: [input.context.scenarioRef as ArtifactRef, snapshot.manifestRef], moduleId: scenario.moduleId,
      },
      context: {
        model: this.modelFactory({ provider: this.agentForRun(input.runId), command, stage: input, scenario }),
        command, effectivePrompt: input.prompt, iteration: input.iteration, signal: input.signal,
        ...(cached ? { validatedOutput: cached.output } : {}),
        ...(agentId === 'doc-gen' && this.workerRuntime ? { docWorkers: new DocWorkerExecutionService({
          ...this.workerRuntime, stage: input, flywheel: this.flywheel, contracts: this.contracts, nodeByAgent: this.nodeByAgent,
          parent: { payload: command.payload as unknown as DocGenInput['payload'], materials,
            sourcePaths: scenario.sourcePaths, publicInterfacePaths: scenario.publicInterfacePaths,
            provenance: [input.context.scenarioRef as ArtifactRef, snapshot.manifestRef], moduleId: scenario.moduleId },
          model: (command, stage) => this.modelFactory({ provider: this.agentForRun(input.runId), command, stage, scenario }),
        }) } : {}),
      },
    });
  }

  // 文档生成成功不等于知识通过：候选正文仍须经过领域质量策略和后续独立评测。
  private async commitCandidate(
    input: WorkflowStageInput,
    scenario: AutomatedProjectScenario,
  ): Promise<WorkflowStageResult> {
    const documentRef = input.context[contextKey('doc_gen', input.iteration)] as ArtifactRef | undefined;
    if (!documentRef) throw new Error('WORKFLOW_DOC_OUTPUT_MISSING');
    const documentResult = await this.readAgentResult(documentRef, 'doc-gen', input.runId,
      this.expectedAgentGenerationKey(input, 'doc-gen', input.iteration));
    if (documentResult.payload['resultKind'] === 'userDecisionRequired') {
      return { route: 'STOPPED', detail: `DocGen 等待用户决定文档范围：${documentResult.payload['reason']}；建议：${(documentResult.payload['suggestedDocuments'] as string[]).join('；')}`,
        context: { docGenDecisionRequired: documentResult.payload } };
    }
    const document = await this.readAgentOutput<DocumentOutput>(documentRef, 'doc-gen', input);
    const unresolvedRisks = Array.isArray(documentResult.payload.unresolvedRisks)
      ? documentResult.payload.unresolvedRisks.filter((risk): risk is string => typeof risk === 'string') : [];
    if (document.body.includes('[NEEDS CLARIFICATION]')) unresolvedRisks.push('正文仍有待澄清声明');
    const previousReviewRef = input.iteration > 0
      ? input.context[contextKey('review', input.iteration - 1)] as ArtifactRef | undefined
      : undefined;
    let correctionIds: string[] = [];
    let correctionEvidenceRefs: ArtifactRef[] = [];
    if (previousReviewRef) {
      const previousReview = await this.readAgentResult(
        previousReviewRef,
        'review',
        input.runId,
        this.expectedAgentGenerationKey(input, 'review', input.iteration - 1),
      );
      const corrections = previousReview.payload['corrections'];
      if (Array.isArray(corrections)) {
        correctionIds = corrections.flatMap((correction) => (
          correction && typeof correction === 'object'
            && typeof (correction as Record<string, unknown>).correctionId === 'string'
            ? [String((correction as Record<string, unknown>).correctionId)]
            : []
        ));
        correctionEvidenceRefs = corrections.flatMap((correction) => {
          if (!correction || typeof correction !== 'object') return [];
          const refs = (correction as Record<string, unknown>).evidenceRefs;
          return Array.isArray(refs) ? refs as ArtifactRef[] : [];
        });
      }
    }
    const checkpoint = await this.flywheel.executeNode({
      runId: input.runId,
      nodeId: input.nodeId,
      generationKey: `${input.runId}:${input.nodeId}:${input.iteration}`,
      inputRefs: previousReviewRef ? [documentRef, previousReviewRef] : [documentRef],
    }, async () => {
      const candidate = await this.flywheel.ingestCandidate({
        moduleId: scenario.moduleId,
        body: renderKnowledgeDocument(document),
        title: document.title,
        description: document.description,
        category: 'automated-project',
        tags: document.keywords,
        provenance: scenario.sourcePaths.map((path) => ({
          path,
          commit: (input.context.snapshot as ProjectSnapshot).commit,
          pinned: true,
        })),
        metadata: {
          workflow: 'embedded-domain-knowledge',
          iteration: input.iteration,
          unresolvedRisks,
          knowledgeRisks: documentResult.payload.knowledgeRisks ?? [],
          ...(correctionIds.length > 0 ? { correctionIds } : {}),
          ...(correctionEvidenceRefs.length > 0
            ? { correctionEvidenceRefs: this.uniqueRefs(correctionEvidenceRefs) }
            : {}),
        },
      });
      return [candidate.version.bodyRef];
    });
    const bodyRef = checkpoint.outputRefs[0];
    if (!bodyRef) throw new Error('WORKFLOW_CANDIDATE_CHECKPOINT_EMPTY');
    const version = this.flywheel.findKnowledgeVersionByBody(scenario.moduleId, bodyRef.artifactId);
    if (!version) throw new Error('WORKFLOW_CANDIDATE_VERSION_MISSING');
    const quality = this.flywheel.evaluateQuality(renderKnowledgeDocument(document), {
      title: document.title,
      description: document.description,
      provenance: version.provenance,
    });
    if (quality.outcome !== 'ACCEPTED') {
      return {
        detail: `candidate ${version.versionId} rejected by quality policy (${quality.score})`,
        route: 'ITERATE',
        context: {
          [contextKey('candidateVersionId', input.iteration)]: version.versionId,
          [contextKey('candidateBodyRef', input.iteration)]: bodyRef,
          [contextKey('qualityReport', input.iteration)]: quality,
        },
      };
    }
    return {
      detail: `candidate ${version.versionId}`,
      context: {
        [contextKey('candidateVersionId', input.iteration)]: version.versionId,
        [contextKey('candidateBodyRef', input.iteration)]: bodyRef,
      },
    };
  }

  private async testSourceKey(input: WorkflowStageInput, scenario: AutomatedProjectScenario): Promise<string> {
    const snapshot = input.context.snapshot as ProjectSnapshot;
    const manifest = await this.readJson<{ files: { path: string; sha256: string }[] }>(snapshot.manifestRef);
    return sourceIdentity(scenario.moduleId, [...scenario.sourcePaths, ...scenario.publicInterfacePaths], manifest.files);
  }

  private async validateOracle(input: WorkflowStageInput, scenario: AutomatedProjectScenario): Promise<WorkflowStageResult> {
    if (this.scenarioLanguage(scenario) === 'typescript') return this.validateModuleOracle(input, scenario);
    if (input.context.testValidationRequired) return { route: 'STOPPED', detail: '测试参考校验等待人工处理' };
    validateProjectAgentConfiguration(scenario.agentConfiguration);
    const snapshot = input.context.snapshot as ProjectSnapshot;
    const sourceKey = await this.testSourceKey(input, scenario);
    const cached = this.flywheel.getValidatedTestSuite(sourceKey);
    let fixedSuiteRef = cached;
    let candidateRef = input.context[contextKey('test_gen', input.iteration)] as ArtifactRef;
    if (!candidateRef) throw new Error('TEST_CANDIDATE_MISSING');
    let roleStage = { ...input, nodeId: 'test_gen', agentId: 'test-gen' as const };
    let output = cached ? (await this.readJson<{ output: TestOutput }>(cached)).output : await this.readAgentOutput<TestOutput>(candidateRef, 'test-gen', roleStage);
    for (let repairs = 0; ; repairs++) {
      const checked = await this.flywheel.executeNode({ runId: input.runId, nodeId: 'oracle_validation',
        generationKey: `${input.runId}:oracle_validation:${input.iteration}:${repairs}:${sha256(JSON.stringify(output))}:${fixedSuiteRef?.sha256 ?? 'candidate'}:tests-v3`, inputRefs: [fixedSuiteRef ?? candidateRef, snapshot.manifestRef] }, async () => {
        const evaluation = await this.evaluator.evaluate({ label: `test-reference-${input.iteration}-${repairs}`, snapshot,
          generatedFiles: output.files, prepareCommands: scenario.prepareCommands, commands: scenario.referenceCommands, testSuite: output }, input.signal);
        return [evaluation.evidenceRef];
      });
      const evidenceRef = checked.outputRefs[0]!;
      const evaluation = await this.readJson<ProjectEvaluation>(evidenceRef);
      const action = testValidationAction({ passed: evaluation.passed, infrastructureFailure: evaluation.infrastructureFailure,
        reused: Boolean(fixedSuiteRef), repairs, maxRepairs: scenario.agentConfiguration.maxTestRepairs ?? 1 });
      if (action === 'ACCEPT') {
        const suiteRef = await this.flywheel.putArtifact(Buffer.from(JSON.stringify({ protocolVersion: TEST_CASE_PROTOCOL, sourceKey, output, validationEvidenceRef: evidenceRef })), 'application/json');
        const fixed = await this.flywheel.saveValidatedTestSuite(sourceKey, suiteRef);
        const winner = await this.readJson<{ output: TestOutput }>(fixed);
        if (JSON.stringify(winner.output) !== JSON.stringify(output)) {
          output = winner.output; fixedSuiteRef = fixed;
          continue; // 另一 Run 已固定同源测试：重新校验胜出的集合，不能把本次证据错绑给它。
        }
        return { detail: `source tests validated${cached ? ' and reused' : ''}`, context: {
          [contextKey('oracleEvidenceRef', input.iteration)]: evidenceRef,
          [contextKey('validatedTestSuiteRef', input.iteration)]: fixed,
        } };
      }
      if (action === 'MANUAL') return { detail: '生成测试需要人工处理', route: 'STOPPED',
        context: { testValidationRequired: { candidateRef, evidenceRef, repairs, infrastructureFailure: evaluation.infrastructureFailure } } };
      roleStage = { ...roleStage, workerId: `repair-${repairs + 1}`, attempt: repairs + 2,
        context: { ...input.context, testRepair: { candidateRef, failureRef: evidenceRef } },
        prompt: input.context.testGenPrompt as string ?? input.prompt };
      candidateRef = await this.runRole(roleStage, scenario, 'test-gen');
      output = await this.readAgentOutput<TestOutput>(candidateRef, 'test-gen', roleStage);
    }
  }

  private async validateModuleOracle(
    input: WorkflowStageInput,
    scenario: AutomatedProjectScenario,
  ): Promise<WorkflowStageResult> {
    const snapshot = input.context.snapshot as ProjectSnapshot;
    const scenarioRef = input.context.scenarioRef as ArtifactRef;
    const candidateRef = input.context[contextKey('test_gen', input.iteration)] as ArtifactRef;
    const candidate = scenario.moduleContract ? await this.readAgentOutput<BehaviorTestOutput>(candidateRef, 'test-gen', input) : undefined;
    if (scenario.moduleContract && !candidate?.suite) throw new Error('TEST_CANDIDATE_EXECUTABLE_SUITE_REQUIRED');
    const fixedSuite = input.context.frozenSuiteRef
      ? await this.readJson<ModuleBehaviorSuite>(input.context.frozenSuiteRef as ArtifactRef) : undefined;
    const checkpoint = await this.flywheel.executeNode({
      runId: input.runId,
      nodeId: input.nodeId,
      generationKey: `${input.runId}:${input.nodeId}:${input.iteration}`,
      inputRefs: [scenarioRef, snapshot.manifestRef, ...(candidateRef ? [candidateRef] : []), ...(input.context.frozenSuiteRef ? [input.context.frozenSuiteRef as ArtifactRef] : [])],
    }, async () => {
      const evaluation = await this.evaluator.evaluate({
        label: `reference-oracle-${input.iteration}`,
        snapshot,
        generatedFiles: [],
        prepareCommands: scenario.prepareCommands,
        commands: scenario.referenceCommands,
        moduleSuite: fixedSuite,
        moduleContract: scenario.moduleContract,
      }, input.signal);
      if (!evaluation.passed) throw new Error(`REFERENCE_GATE_FAILED: ${evaluation.evidenceRef.artifactId}`);
      if (candidate?.suite) {
        const candidateEvaluation = await this.evaluator.evaluate({ label: 'candidate-reference-oracle', snapshot,
          generatedFiles: [], prepareCommands: [], commands: [], moduleSuite: candidate.suite, moduleContract: scenario.moduleContract }, input.signal);
        if (!candidateEvaluation.passed) throw new Error(`TEST_ORACLE_REJECTED: ${candidateEvaluation.evidenceRef.artifactId}`);
        return [evaluation.evidenceRef, candidateEvaluation.evidenceRef];
      }
      return [evaluation.evidenceRef];
    });
    return {
      detail: 'reference oracle passed',
      context: { [contextKey('oracleEvidenceRef', input.iteration)]: checkpoint.outputRefs[0],
        [contextKey('candidateOracleRef', input.iteration)]: checkpoint.outputRefs[1] },
    };
  }

  private async evaluate(
    input: WorkflowStageInput,
    scenario: AutomatedProjectScenario,
  ): Promise<WorkflowStageResult> {
    if (input.context.testValidationRequired) return { route: 'STOPPED', detail: '测试参考校验未通过，等待人工处理' };
    const snapshot = input.context.snapshot as ProjectSnapshot;
    const scenarioRef = input.context.scenarioRef as ArtifactRef;
    const codeRef = input.context[contextKey('code', input.iteration)] as ArtifactRef | undefined;
    const bodyRef = input.context[contextKey('candidateBodyRef', input.iteration)] as ArtifactRef | undefined;
    const versionId = input.context[contextKey('candidateVersionId', input.iteration)];
    const checkRef = input.context[contextKey('check', input.iteration)] as ArtifactRef | undefined;
    const oracleRef = input.context[contextKey('oracleEvidenceRef', input.iteration)] as ArtifactRef | undefined;
    if (!codeRef || !bodyRef || !checkRef || !oracleRef || typeof versionId !== 'string') {
      throw new Error('WORKFLOW_EVALUATION_INPUT_MISSING');
    }
    const code = await this.readAgentOutput<CodeOutput>(codeRef, 'code', input);
    const suiteRef = input.context[contextKey('validatedTestSuiteRef', input.iteration)] as ArtifactRef | undefined;
    const moduleMode = this.scenarioLanguage(scenario) === 'typescript';
    if (!moduleMode && !suiteRef) throw new Error('VALIDATED_TEST_SUITE_MISSING');
    const suite = !moduleMode ? await this.readJson<{ output: TestOutput }>(suiteRef!) : undefined;
    if (!moduleMode) validateProjectAgentConfiguration(scenario.agentConfiguration);
    for (const file of code.files) {
      if (!scenario.allowedGeneratedPaths.includes(file.path)) throw new Error(`PROJECT_PATH_DENIED: ${file.path}`);
    }
    const checkpoint = await this.flywheel.executeNode({
      runId: input.runId,
      nodeId: input.nodeId,
      generationKey: `${input.runId}:${input.nodeId}:${input.iteration}`,
      inputRefs: [scenarioRef, snapshot.manifestRef, bodyRef, codeRef, oracleRef, checkRef, ...(suiteRef ? [suiteRef] : [])],
    }, async () => {
      let evaluation = await this.evaluator.evaluate({
        label: `generated-iteration-${input.iteration}`,
        snapshot,
        generatedFiles: [...code.files, ...(suite?.output.files ?? [])],
        prepareCommands: scenario.prepareCommands,
        commands: moduleMode && input.iteration === 0 ? scenario.firstIterationCommands : scenario.finalCommands,
        ...(moduleMode ? {
          moduleSuite: input.context.frozenSuiteRef ? await this.readJson<ModuleBehaviorSuite>(input.context.frozenSuiteRef as ArtifactRef) : undefined,
          moduleContract: scenario.moduleContract,
        } : { testSuite: suite!.output, replaceSourcePaths: scenario.sourcePaths.filter((path) => !scenario.publicInterfacePaths.includes(path)) }),
      }, input.signal);
      if (scenario.moduleContract && evaluation.passed) {
        const trustedCandidateRef = input.context[contextKey('candidateOracleRef', input.iteration)] as ArtifactRef | undefined;
        if (!trustedCandidateRef) throw new Error('TEST_CANDIDATE_ORACLE_MISSING');
        const candidate = await this.readAgentOutput<BehaviorTestOutput>(input.context[contextKey('test_gen', input.iteration)] as ArtifactRef, 'test-gen', input);
        if (!candidate.suite) throw new Error('TEST_CANDIDATE_EXECUTABLE_SUITE_REQUIRED');
        const extra = await this.evaluator.evaluate({ label: `candidate-generated-${input.iteration}`, snapshot,
          generatedFiles: code.files, prepareCommands: [], commands: [], moduleSuite: candidate.suite,
          moduleContract: scenario.moduleContract }, input.signal);
        const combined = { ...evaluation, label: `combined-generated-${input.iteration}`,
          passed: evaluation.passed && extra.passed, testsPassed: evaluation.testsPassed + extra.testsPassed,
          testsTotal: evaluation.testsTotal + extra.testsTotal, stability: Math.min(evaluation.stability, extra.stability),
          infrastructureFailure: evaluation.infrastructureFailure || extra.infrastructureFailure,
          results: [...evaluation.results, ...extra.results],
          evidenceRefs: [evaluation.evidenceRef, extra.evidenceRef, trustedCandidateRef] };
        evaluation = { ...combined, evidenceRef: await this.flywheel.putArtifact(Buffer.from(JSON.stringify(combined)), 'application/json') };
      }
      return [evaluation.evidenceRef];
    });
    const evidenceRef = checkpoint.outputRefs[0];
    if (!evidenceRef) throw new Error('WORKFLOW_EVALUATION_EVIDENCE_MISSING');
    const evaluation = await this.readJson<ProjectEvaluation>(evidenceRef);
    const run = this.flywheel.getRun(input.runId);
    if (run?.state === 'GENERATING') this.flywheel.transition(input.runId, 'EVALUATING');
    if (evaluation.infrastructureFailure) {
      const decision = await this.recordGateDecision({ ...input, context: { ...input.context, [contextKey('evaluationEvidenceRef', input.iteration)]: evidenceRef } }, evaluation);
      return {
        detail: `evaluation infrastructure failed; gate ${decision.outcome}`,
        context: {
          [contextKey('evaluationEvidenceRef', input.iteration)]: evidenceRef,
          [contextKey('gateDecision', input.iteration)]: decision,
        },
        route: routeFor(decision.outcome),
      };
    }
    return {
      detail: `evaluation ${evaluation.passed ? 'passed' : 'failed'}; awaiting review and gate`,
      context: { [contextKey('evaluationEvidenceRef', input.iteration)]: evidenceRef },
    };
  }

  private async route(input: WorkflowStageInput): Promise<WorkflowStageResult> {
    // 固定判定先于迁移，避免 Registry 已推进而 Graph 仍重放旧输入时重新作决定。
    const requestRef = await this.flywheel.putArtifact(Buffer.from(JSON.stringify({
      iteration: input.iteration, maxIterations: input.maxIterations, gatePolicy: input.context.gatePolicy,
      quality: input.context[contextKey('qualityReport', input.iteration)],
      candidateVersion: input.context[contextKey('candidateVersionId', input.iteration)],
      docGenDecisionRequired: input.context.docGenDecisionRequired, testValidationRequired: input.context.testValidationRequired,
    })), 'application/json');
    const refs = Object.entries(input.context).filter(([key]) => !key.startsWith('gateDecision:'))
      .flatMap(([,value]) => this.artifactRefsIn(value));
    const checkpoint = await this.flywheel.executeNode({runId: input.runId, nodeId: 'workflow_router',
      generationKey: `${input.runId}:workflow_router:${input.iteration}:route-v2`,
      inputRefs: this.uniqueRefs([requestRef, ...refs]) }, async () => {
        const result = await this.decideRoute(input);
        return [await this.flywheel.putArtifact(Buffer.from(JSON.stringify(result)), 'application/json')];
      });
    const result = await this.readJson<WorkflowStageResult>(checkpoint.outputRefs[0]!);
    const run = this.flywheel.getRun(input.runId);
    if (!run) throw new Error(`WORKFLOW_RUN_NOT_FOUND: ${input.runId}`);
    if (run.iteration === input.iteration && ['GENERATING', 'REVIEWING'].includes(run.state)) {
      if (result.route === 'ITERATE') this.flywheel.transition(input.runId, 'ITERATING');
      else if (result.route === 'STOPPED') this.flywheel.transition(input.runId, 'LOW_CONFIDENCE');
    }
    if (result.route === 'STOPPED') await this.recordGovernance(input,
      result.context?.[contextKey('gateDecision', input.iteration)] as GateDecision | undefined);
    return result;
  }

  private async decideRoute(input: WorkflowStageInput): Promise<WorkflowStageResult> {
    if (input.context.docGenDecisionRequired || input.context.testValidationRequired) {
      return { route: 'STOPPED', detail: input.context.testValidationRequired ? '测试参考校验未通过，等待人工处理' : 'DocGen 等待用户决定文档范围',
        context: { docGenDecisionRequired: input.context.docGenDecisionRequired, testValidationRequired: input.context.testValidationRequired } };
    }
    const quality = input.context[contextKey('qualityReport', input.iteration)] as QualityReport | undefined;
    if (quality?.outcome === 'REJECTED') {
      const exhausted = !canContinueIteration(input.iteration, input.maxIterations);
      return {
        detail: `knowledge quality ${quality.score}; ${exhausted ? 'stopped' : 'iterate'}: ${quality.weakPoints.join('; ')}`,
        route: exhausted ? 'STOPPED' : 'ITERATE',
        context: { [contextKey('qualityReport', input.iteration)]: quality },
      };
    }
    const existing = input.context[contextKey('gateDecision', input.iteration)] as GateDecision | undefined;
    const evaluationRef = input.context[contextKey('evaluationEvidenceRef', input.iteration)] as ArtifactRef | undefined;
    if (!evaluationRef) throw new Error('WORKFLOW_EVALUATION_EVIDENCE_MISSING');
    const evaluation = await this.readJson<ProjectEvaluation>(evaluationRef);
    const decision = existing ?? await this.recordGateDecision(input, evaluation);
    const route = routeFor(decision.outcome);
    return {
      detail: `workflow route ${route}`,
      route,
      context: { [contextKey('gateDecision', input.iteration)]: decision },
    };
  }

  private async recordGovernance(input: WorkflowStageInput, decision?: GateDecision): Promise<void> {
    const reviewRefs = Object.keys(input.context).filter(key => /^review:\d+$/.test(key))
      .sort((a, b) => Number(b.split(':')[1]) - Number(a.split(':')[1]));
    const latestKey = reviewRefs[0];
    const review = latestKey ? await this.readAgentOutput<ReviewOutput | WorkbenchReviewOutput>(input.context[latestKey] as ArtifactRef,
      'review', { ...input, iteration: Number(latestKey.split(':')[1]) }) : undefined;
    const quality = input.context[contextKey('qualityReport', input.iteration)] as QualityReport | undefined;
    const proposal = input.context.docGenDecisionRequired as { reason: string; suggestedDocuments: string[] } | undefined;
    const test = input.context.testValidationRequired as { repairs: number; infrastructureFailure: boolean } | undefined;
    const reason = test ? 'TEST_VALIDATION_REQUIRED' : proposal ? 'DOCUMENT_SCOPE_REQUIRED' : quality ? 'QUALITY_BUDGET_EXHAUSTED' : 'GATE_STOPPED';
    const summary = test
      ? `测试参考校验未通过，已修复 ${test.repairs} 次。请检查测试候选与失败日志${test.infrastructureFailure ? '，修正构建配置或执行环境' : '，确认用例预期和原始实现'}后重新运行。`
      : proposal ? `文档范围待决定：${proposal.reason}。建议：${proposal.suggestedDocuments.join('；')}。请确认本次单文档范围。`
      : quality ? `文档质量 ${quality.score}，总轮次预算已用完：${quality.weakPoints.join('；')}。请补充对应内容或调整任务后重新运行。`
      : review && 'correction' in review && review.correction
        ? `${review.correction.knowledgePath}：${review.correction.risk}；建议：${review.correction.criterion}`
      : review && 'corrections' in review && review.corrections.length ? review.corrections.map(item => `${item.knowledgePath}：${item.problem}；建议：${item.suggestion}`).join('\n')
      : `测评停止：${decision?.reasonCodes.join('、')}。请检查评测日志后决定修订或重新运行。`;
    const evidenceRefs = this.artifactRefsIn(input.context);
    if (quality) evidenceRefs.push(await this.flywheel.putArtifact(Buffer.from(JSON.stringify(quality)), 'application/json'));
    const handoff = { summary, historySummary: review && 'historySummary' in review ? review.historySummary ?? '' : '', evidenceRefs: this.uniqueRefs(evidenceRefs),
      reason, iteration: input.iteration, decisionId: decision?.decisionId,
      handoffKey: `${input.iteration}:${reason}:${decision?.decisionId ?? 'early'}` };
    const handoffRef = await this.flywheel.putArtifact(Buffer.from(JSON.stringify(handoff, null, 2)), 'application/json');
    this.flywheel.recordReviewHandoff(input.runId, { ...handoff, handoffRef });
  }

  private async recordGateDecision(
    input: WorkflowStageInput,
    evaluation: ProjectEvaluation,
  ): Promise<GateDecision> {
    const snapshot = input.context.snapshot as ProjectSnapshot;
    const scenarioRef = input.context.scenarioRef as ArtifactRef;
    const bodyRef = input.context[contextKey('candidateBodyRef', input.iteration)] as ArtifactRef | undefined;
    const codeRef = input.context[contextKey('code', input.iteration)] as ArtifactRef | undefined;
    const checkRef = input.context[contextKey('check', input.iteration)] as ArtifactRef | undefined;
    const oracleRef = input.context[contextKey('oracleEvidenceRef', input.iteration)] as ArtifactRef | undefined;
    const reviewRef = input.context[contextKey('review', input.iteration)] as ArtifactRef | undefined;
    const versionId = input.context[contextKey('candidateVersionId', input.iteration)];
    if (!bodyRef || !codeRef || !checkRef || !oracleRef || typeof versionId !== 'string') {
      throw new Error('WORKFLOW_GATE_INPUT_MISSING');
    }
    const check = await this.readAgentOutput<CheckOutput>(checkRef, 'check', input);
    const review = reviewRef ? await this.readAgentOutput<ReviewOutput | WorkbenchReviewOutput>(reviewRef, 'review', input) : null;
    const policy = input.context.gatePolicy as GatePolicy | undefined;
    const run = this.flywheel.getRun(input.runId);
    if (!policy || !run) throw new Error('WORKFLOW_GATE_POLICY_MISSING');
    assertInvariant(policy.policyId === run.policyId, 'workflow gate policy does not match run');
    assertInvariant(policy.maxIterations === input.maxIterations, 'workflow iteration policy changed after start');
    const evaluationRef = input.context[contextKey('evaluationEvidenceRef', input.iteration)] as ArtifactRef | undefined;
    if (!evaluationRef) throw new Error('WORKFLOW_EVALUATION_EVIDENCE_MISSING');
    const inputRefs = [scenarioRef, snapshot.manifestRef, bodyRef, codeRef, oracleRef, checkRef];
    if (reviewRef) inputRefs.push(reviewRef);
    const version = this.flywheel.getKnowledgeVersion(versionId);
    const declaredRisks = (version?.metadata.knowledgeRisks ?? []) as KnowledgeRisk[];
    const remaining = ((version?.metadata.unresolvedRisks ?? []) as string[])
      .filter(statement => !declaredRisks.some(risk => risk.statement === statement));
    const risks = [...declaredRisks, ...collectRisks([{ ref: bodyRef, content: { unresolvedRisks: remaining } }])];
    const frozenScenario = await this.readArtifact(scenarioRef) as AutomatedProjectScenario;
    const assessments = assessRisks(risks, { moduleScope: Boolean(frozenScenario.moduleContract),
      scopeRef: scenarioRef, evaluationRef, ...evaluation });
    const riskAuditRef = await this.flywheel.putArtifact(Buffer.from(JSON.stringify({
      schemaVersion: 'knowledge-risk-assessment-v1', runId: input.runId, versionId,
      iteration: input.iteration, assessments,
    })), 'application/json');
    const { decision } = await this.evalRunner.evaluate({
      runId: input.runId,
      versionId,
      inputRefs,
      evidenceRefs: [evaluationRef, riskAuditRef],
      toolchainFingerprint: evaluation.toolchainFingerprint,
      criticalFailures: evaluation.passed ? 0 : 1,
      testsPassed: evaluation.testsPassed,
      testsTotal: evaluation.testsTotal,
      stability: evaluation.stability,
      infrastructureFailure: evaluation.infrastructureFailure,
      checkBlocking: check.blocking,
      knowledgeRiskBlocking: assessments.some(risk => risk.status === 'OPEN')
        || Boolean((version?.metadata.unresolvedRisks as unknown[] | undefined)?.length),
      reviewBlocking: Boolean(review?.blocking || review && 'recommendation' in review
        && (review.recommendation === 'ITERATE' || review.unresolvedRisks?.length)),
    }, policy);
    return decision;
  }

  private async publish(input: WorkflowStageInput): Promise<WorkflowStageResult> {
    const decision = input.context[contextKey('gateDecision', input.iteration)] as GateDecision | undefined;
    const versionId = input.context[contextKey('candidateVersionId', input.iteration)];
    if (!decision || typeof versionId !== 'string') throw new Error('WORKFLOW_PUBLICATION_INPUT_MISSING');
    input.signal?.throwIfAborted();
    const publication = await this.flywheel.publish(input.runId, versionId, decision.decisionId, input.signal);
    let localPublication;
    if (this.localPublication) {
      const version = this.flywheel.getKnowledgeVersion(versionId);
      const snapshot = input.context.snapshot as ProjectSnapshot;
      if (!version || version.status !== 'VERIFIED') throw new Error('PUBLICATION_VERSION_NOT_VERIFIED');
      input.signal?.throwIfAborted();
      localPublication = await this.localPublication.publish({
        publicationKey: publication.publicationKey, gateDecisionId: decision.decisionId,
        runId: input.runId, versionId, moduleId: version.moduleId, title: version.title,
        body: Buffer.from(await this.flywheel.getArtifact(version.bodyRef)).toString('utf8'),
        sourceCommit: snapshot.commit, sourceDigest: snapshot.manifestRef.sha256,
        evidenceRefs: [input.context[contextKey('evaluationEvidenceRef', input.iteration)],
          input.context[contextKey('oracleEvidenceRef', input.iteration)]],
      });
    }
    return {
      detail: `Knowledge Flywheel publication ${publication.publicationKey}`,
      context: { publication, ...(localPublication ? { localPublication } : {}) },
      route: 'PASS',
    };
  }

  // 这里只负责上游工件加载与契约组装，角色提示词和输出转换留在各自目录。
  private async buildAgentCommand(
    input: WorkflowStageInput,
    scenario: AutomatedProjectScenario,
    agentId: AgentId,
  ): Promise<AgentCommand> {
    const scenarioRef = input.context.scenarioRef as ArtifactRef | undefined;
    const snapshot = input.context.snapshot as ProjectSnapshot | undefined;
    if (!scenarioRef || !snapshot?.manifestRef) throw new Error(`AGENT_COMMAND_INPUT_MISSING: ${agentId}`);
    const roleScenarioRef = input.context.roleScenarioRef as ArtifactRef | undefined ?? scenarioRef;
    const publicInterfaceRefs = input.context.publicContractRef ? [input.context.publicContractRef as ArtifactRef]
      : snapshot.publicInterfaceRefs?.length ? snapshot.publicInterfaceRefs : [snapshot.manifestRef];
    let payload: Record<string, unknown>;
    if (agentId === 'orchestrator') {
      const gatePolicy = input.context.gatePolicy;
      if (!gatePolicy) throw new Error('AGENT_COMMAND_INPUT_MISSING: orchestrator.gatePolicy');
      const policyRef = await this.flywheel.putArtifact(
        Buffer.from(JSON.stringify(gatePolicy, null, 2)), 'application/json',
      );
      const businessGoalRef = await this.flywheel.putArtifact(Buffer.from(scenario.businessGoal ?? `Generate and evaluate knowledge for ${scenario.moduleId}`), 'text/plain');
      const projectConfigurationRef = await this.flywheel.putArtifact(Buffer.from(JSON.stringify(scenario.agentConfiguration ?? {})), 'application/json');
      const progressRef = await this.flywheel.putArtifact(Buffer.from(JSON.stringify({ iteration: input.iteration,
        state: input.iteration === 0 ? 'PLANNED' : 'ITERATING', selectedModuleId: input.iteration > 0 ? scenario.moduleId : null,
        previousDecision: input.context[contextKey('gateDecision', input.iteration - 1)] ?? null, previousQuality: input.context[contextKey('qualityReport', input.iteration - 1)] ?? null,
      })), 'application/json');
      const moduleOverviewRef = await this.flywheel.putArtifact(Buffer.from(JSON.stringify({ modules: (scenario.modules ?? [scenario]).map((module) => ({
        moduleId: module.moduleId, description: module.businessGoal ?? module.name, sourcePaths: module.sourcePaths,
        publicInterfacePaths: module.publicInterfacePaths, projectConfiguration: module.agentConfiguration,
      })) })), 'application/json');
      payload = { policyRef, moduleRefs: [moduleOverviewRef], businessGoalRef, projectConfigurationRef, progressRef };
    } else if (agentId === 'doc-gen') {
      payload = {
        moduleId: scenario.moduleId,
        workerCount: input.workerCount,
        ...(scenario.moduleContract ? { executionContract: 'section-doc-v1' } : {}),
        ...(scenario.docGenDecision ? { documentDecision: scenario.docGenDecision } : {}),
        sourceRefs: [snapshot.manifestRef],
        publicInterfaceRefs,
      };
      if (input.iteration > 0) {
        const previousResultRef = input.context[contextKey('doc_gen', input.iteration - 1)] as ArtifactRef | undefined;
        if (previousResultRef) {
          const previousResult = await this.readAgentResult(
            previousResultRef,
            'doc-gen',
            input.runId,
            this.expectedAgentGenerationKey(input, 'doc-gen', input.iteration - 1),
          );
          const baseKnowledgeRef = previousResult.payload['bodyRef'] as ArtifactRef | undefined;
          if (baseKnowledgeRef) payload.baseKnowledgeRef = baseKnowledgeRef;
        }
        if (!payload.baseKnowledgeRef) throw new Error('DOCGEN_REVISION_BASE_REQUIRED');
        const previousReviewRef = input.context[contextKey('review', input.iteration - 1)] as ArtifactRef | undefined;
        if (previousReviewRef) {
          const previousReview = await this.readAgentResult(
            previousReviewRef,
            'review',
            input.runId,
            this.expectedAgentGenerationKey(input, 'review', input.iteration - 1),
          );
          const corrections = previousReview.payload['corrections'];
          if (Array.isArray(corrections) && corrections.length > 0) payload.corrections = corrections;
        }
        const quality = input.context[contextKey('qualityReport', input.iteration - 1)] as QualityReport | undefined;
        if (quality) {
          payload.qualityFeedback = {
            score: quality.score, signals: quality.signals, weakPoints: quality.weakPoints,
          };
        }
      }
    } else if (agentId === 'test-gen') {
      if (this.scenarioLanguage(scenario) === 'typescript') {
        payload = { executionContract: 'behavior-cases-v1', moduleId: scenario.moduleId,
          sourceSnapshotRef: snapshot.sourceContentRefs?.length
            ? await this.flywheel.putArtifact(Buffer.from(JSON.stringify({ files: await Promise.all(snapshot.sourceContentRefs.map((ref) => this.readArtifact(ref))) })), 'application/json')
            : snapshot.manifestRef,
          publicInterfaceRefs, languageId: 'typescript', testPolicyRef: roleScenarioRef };
      } else {
      validateProjectAgentConfiguration(scenario.agentConfiguration);
      const cachedRef = this.flywheel.getValidatedTestSuite(await this.testSourceKey(input, scenario));
      const cachedPaths = cachedRef ? (await this.readJson<{ output: TestOutput }>(cachedRef)).output.files.map((file) => file.path) : [];
      const allowedTestPaths = [...new Set([...scenario.agentConfiguration.testPaths, ...cachedPaths])];
      const testPolicyRef = await this.flywheel.putArtifact(Buffer.from(JSON.stringify({ languageId: scenario.agentConfiguration.languageId, standard: scenario.agentConfiguration.standard, allowedTestPaths })), 'application/json');
      const repair = input.context.testRepair as { candidateRef: ArtifactRef; failureRef: ArtifactRef } | undefined;
      payload = {
        moduleId: scenario.moduleId,
        sourceSnapshotRef: snapshot.sourceContentRefs?.length
          ? await this.flywheel.putArtifact(Buffer.from(JSON.stringify({ files: await Promise.all(snapshot.sourceContentRefs.map((ref) => this.readArtifact(ref))) })), 'application/json')
          : snapshot.manifestRef,
        publicInterfaceRefs,
        languageId: this.scenarioLanguage(scenario),
        testPolicyRef,
        allowedTestPaths,
        ...(repair ? { previousCandidateRef: (await this.readJson<AgentResult>(repair.candidateRef)).rawOutputRef!, validationFailureRef: repair.failureRef } : {}),
      };
      }
    } else if (agentId === 'code') {
      const knowledgeRef = input.context[contextKey('candidateBodyRef', input.iteration)] as ArtifactRef | undefined;
      if (!knowledgeRef) throw new Error('AGENT_COMMAND_INPUT_MISSING: code.knowledgeRef');
      if (this.scenarioLanguage(scenario) === 'typescript') {
        const buildContractRef = await this.flywheel.putArtifact(Buffer.from(JSON.stringify({
          schemaVersion: 'typescript-build-v1', language: 'typescript', target: 'ES2022', module: 'ESNext',
          allowedGeneratedPaths: scenario.allowedGeneratedPaths,
        })), 'application/json');
        payload = { executionContract: 'workbench-code-v1', knowledgeRef, publicInterfaceRefs,
          languageId: 'typescript', buildContractRef, allowedGeneratedPaths: scenario.allowedGeneratedPaths };
      } else {
      validateProjectAgentConfiguration(scenario.agentConfiguration);
      const { languageId, standard, dependencies, constraints } = scenario.agentConfiguration;
      const projectConfigurationRef = await this.flywheel.putArtifact(Buffer.from(JSON.stringify({
        languageId, standard, dependencies, constraints, allowedGeneratedPaths: scenario.allowedGeneratedPaths,
      })), 'application/json');
      payload = { knowledgeRef, languageId, projectConfigurationRef, allowedGeneratedPaths: scenario.allowedGeneratedPaths,
        requiredGeneratedPaths: scenario.sourcePaths.filter((path) => !scenario.publicInterfacePaths.includes(path)) };
      }
    } else if (agentId === 'check') {
      const codeResultRef = input.context[contextKey('code', input.iteration)] as ArtifactRef | undefined;
      if (!codeResultRef) throw new Error('AGENT_COMMAND_INPUT_MISSING: check.diffRef');
      const codeResult = await this.readAgentResult(
        codeResultRef,
        'code',
        input.runId,
        this.expectedAgentGenerationKey(input, 'code', input.iteration),
      );
      const diffRef = codeResult.payload['codeRef'] as ArtifactRef | undefined;
      if (!diffRef) throw new Error('AGENT_COMMAND_INPUT_MISSING: check.diffRef');
      const comparisonRulesRef = await this.flywheel.putArtifact(Buffer.from(JSON.stringify(scenario.comparisonRules ?? (scenario.moduleContract
        ? [{ id: 'public-interface', description: `Compare the exported interface and behavior for ${scenario.moduleContract.signature}` }] : []))), 'application/json');
      payload = { sourceSnapshotRef: snapshot.manifestRef, generatedCodeRef: diffRef, comparisonRulesRef };
    } else {
      const knowledgeRef = input.context[contextKey('candidateBodyRef', input.iteration)] as ArtifactRef | undefined;
      const evaluationReportRef = input.context[contextKey('evaluationEvidenceRef', input.iteration)] as ArtifactRef | undefined;
      if (!knowledgeRef || !evaluationReportRef) {
        throw new Error('AGENT_COMMAND_INPUT_MISSING: review');
      }
      if (scenario.moduleContract) {
      const checkRef = input.context[contextKey('check', input.iteration)] as ArtifactRef | undefined;
      const checkResult = checkRef ? await this.readAgentResult(checkRef, 'check', input.runId,
        this.expectedAgentGenerationKey(input, 'check', input.iteration)) : undefined;
      const documentResultRef = input.context[contextKey('doc_gen', input.iteration)] as ArtifactRef;
      const documentResult = await this.readAgentResult(documentResultRef, 'doc-gen', input.runId,
        this.expectedAgentGenerationKey(input, 'doc-gen', input.iteration));
      const criteriaRef = await this.flywheel.putArtifact(Buffer.from(JSON.stringify({
        ...(await this.readArtifact(roleScenarioRef) as object), unresolvedRisks: documentResult.payload.unresolvedRisks ?? [],
        knowledgeRisks: documentResult.payload.knowledgeRisks ?? [],
      })), 'application/json');
      payload = { executionContract: 'workbench-review-v1', knowledgeRef, evaluationReportRef, criteriaRef,
        ...(checkResult ? { checkReportRef: checkResult.rawOutputRef ?? checkResult.outputRefs.find((ref) => ref.mediaType === 'application/json') } : {}) };
      } else {
      const checkResultRef = input.context[contextKey('check', input.iteration)] as ArtifactRef | undefined;
      if (!checkResultRef) throw new Error('AGENT_COMMAND_INPUT_MISSING: review.comparisonReportRef');
      const checkResult = await this.readAgentResult(checkResultRef, 'check', input.runId, this.expectedAgentGenerationKey(input, 'check', input.iteration));
      if (!checkResult.rawOutputRef) throw new Error('AGENT_RESULT_RAW_OUTPUT_MISSING: check');
      const history: ArtifactRef[] = [];
      for (let iteration = 0; iteration < input.iteration; iteration++) {
        const documentRef = input.context[contextKey('candidateBodyRef', iteration)] as ArtifactRef | undefined;
        const evaluationRef = input.context[contextKey('evaluationEvidenceRef', iteration)] as ArtifactRef | undefined;
        const comparisonRef = input.context[contextKey('check', iteration)] as ArtifactRef | undefined;
        const reviewRef = input.context[contextKey('review', iteration)] as ArtifactRef | undefined;
        if (!documentRef) continue;
        const refs = [documentRef, evaluationRef, comparisonRef, reviewRef].filter((ref): ref is ArtifactRef => Boolean(ref));
        const loaded = await Promise.all(refs.map(async (ref) => {
          const result = await this.readArtifact(ref);
          const raw = (result as AgentResult)?.rawOutputRef;
          return { ref, content: raw ? await this.readArtifact(raw) : result };
        }));
        history.push(await this.flywheel.putArtifact(Buffer.from(JSON.stringify({ iteration, evidence: loaded })), 'application/json'));
      }
      payload = { knowledgeRef, evaluationReportRef, comparisonReportRef: checkResult.rawOutputRef,
        ...(history.length ? { previousCorrectionRefs: history } : {}) };
      }
    }
    const generationKey = this.agentGenerationKey(input, agentId);
    return {
      schemaVersion: '1.0',
      commandId: `cmd:${sha256(`${generationKey}:${JSON.stringify(payload)}`)}`,
      runId: input.runId,
      agentType: agentId,
      generationKey,
      payload,
    };
  }

  private artifactRefsIn(value: unknown): ArtifactRef[] {
    if (!value || typeof value !== 'object') return [];
    if ('artifactId' in value && 'sha256' in value && 'mediaType' in value && 'size' in value) {
      return [value as ArtifactRef];
    }
    return Object.values(value).flatMap((item) => this.artifactRefsIn(item));
  }

  private uniqueRefs(refs: ArtifactRef[]): ArtifactRef[] {
    return [...new Map(refs.map((ref) => [ref.artifactId, ref])).values()]
      .sort((left, right) => left.artifactId.localeCompare(right.artifactId));
  }

  private scenarioLanguage(scenario: AutomatedProjectScenario): string {
    if (scenario.agentConfiguration) return scenario.agentConfiguration.languageId;
    const tool = scenario.finalCommands[0]?.tool ?? scenario.referenceCommands[0]?.tool ?? 'node';
    return tool === 'cargo' ? 'rust' : 'typescript';
  }

  private agentGenerationKey(input: WorkflowStageInput, agentId: AgentId): string {
    return `${input.runId}:${input.nodeId}:${input.iteration}:${input.workerId ?? 'main'}:contract-v11`;
  }

  private agentInputRefs(input: WorkflowStageInput, agentId: AgentId): ArtifactRef[] {
    const keys: string[] = [];
    if (agentId !== 'orchestrator') keys.push('scenarioRef', 'snapshot.manifestRef');
    if (agentId === 'doc-gen') {
      if (input.iteration > 0) keys.push(
        contextKey('doc_gen', input.iteration - 1),
        contextKey('review', input.iteration - 1),
      );
    }
    if (agentId === 'code' || agentId === 'check' || agentId === 'review') {
      keys.push(contextKey('candidateBodyRef', input.iteration));
    }
    if (agentId === 'check') keys.push(contextKey('code', input.iteration));
    if (agentId === 'review') keys.push(
      contextKey('check', input.iteration),
      contextKey('evaluationEvidenceRef', input.iteration),
    );
    const snapshot = input.context.snapshot as ProjectSnapshot | undefined;
    const values: unknown[] = keys.map((key) => key === 'snapshot.manifestRef'
      ? snapshot?.manifestRef
      : input.context[key]);
    const refs = values.filter((value): value is ArtifactRef => Boolean(
      value && typeof value === 'object' && 'artifactId' in value && 'sha256' in value,
    ));
    return [...new Map(refs.map((ref) => [ref.artifactId, ref])).values()]
      .sort((left, right) => left.artifactId.localeCompare(right.artifactId));
  }

  private async readJson<T>(ref: ArtifactRef): Promise<T> {
    return JSON.parse(Buffer.from(await this.flywheel.getArtifact(ref)).toString('utf8')) as T;
  }

  private async readAgentOutput<T>(
    ref: ArtifactRef,
    expectedAgent: AgentId,
    input: WorkflowStageInput,
  ): Promise<T> {
    const result = await this.readAgentResult(
      ref,
      expectedAgent,
      input.runId,
      this.expectedAgentGenerationKey(input, expectedAgent, input.iteration, input.workerId),
    );
    const rawRef = result.rawOutputRef ?? result.outputRefs.find((outputRef) => outputRef.mediaType === 'application/json');
    if (!rawRef) throw new Error(`AGENT_RESULT_RAW_OUTPUT_MISSING: ${expectedAgent}`);
    return this.readJson<T>(rawRef);
  }

  // 历史工件必须同时匹配 Run、角色和生成键，避免把其他轮次或角色的结果当作输入。
  private async readAgentResult(
    ref: ArtifactRef,
    expectedAgent: AgentId,
    expectedRunId: string,
    expectedGenerationKey: string,
  ): Promise<AgentResult> {
    const result = await this.readJson<AgentResult>(ref);
    this.contracts.assertResult(result);
    const command = await this.readJson<AgentCommand>(result.commandRef);
    this.contracts.assertCommand(command);
    assertAgentResultBinding(result, command, {
      runId: expectedRunId, agentId: expectedAgent, generationKey: expectedGenerationKey,
    });
    return result;
  }

  private expectedAgentGenerationKey(
    input: WorkflowStageInput,
    agentId: AgentId,
    iteration: number,
    workerId?: string,
  ): string {
    return this.agentGenerationKey({
      ...input,
      nodeId: this.nodeByAgent[agentId],
      agentId,
      iteration,
      ...(workerId ? { workerId } : { workerId: undefined }),
    }, agentId);
  }

  private async readArtifact(ref: ArtifactRef): Promise<unknown> {
    const text = Buffer.from(await this.flywheel.getArtifact(ref)).toString('utf8');
    return ref.mediaType.includes('json') ? JSON.parse(text) as unknown : text;
  }

  private agentForRun(runId: string): AgentProvider | undefined {
    return this.agentResolver?.(runId) ?? this.agent;
  }
}

/** 封装Automated项目工作流服务的对外操作与协作依赖。 */
export class AutomatedProjectWorkflowService {
  /** 提供flywheel信息，供调用方读取或传入。 */
  readonly flywheel: KnowledgeFlywheelService;
  /** 提供workflow信息，供调用方读取或传入。 */
  readonly workflow: WorkflowEngine;
  /** 提供运行配置信息，供调用方读取或传入。 */
  readonly runConfiguration: RunConfigurationManager;

  /** 注入协作依赖并初始化实例状态。 */
  constructor(
    flywheel: KnowledgeFlywheelService,
    workflow: WorkflowEngine,
    runConfiguration: RunConfigurationManager,
  ) {
    this.flywheel = flywheel;
    this.workflow = workflow;
    this.runConfiguration = runConfiguration;
  }

  /** 启动请求。 */
  async start(
    scenario: AutomatedProjectScenario,
    input: GatePolicy & {
      budgetMode?: 'provider-quota';
      workerCount?: number;
      governanceTrigger?: {
        parentRunId: string;
        causedByActionItemId: string;
        reason: string;
        feedback: string;
      };
    },
  ): Promise<WorkflowHandle> {
    assertInvariant(input.policyId.trim().length > 0, 'workflow policyId is required');
    assertInvariant(Number.isFinite(input.minimumStability)
      && input.minimumStability >= 0 && input.minimumStability <= 1,
    'workflow minimumStability must be between zero and one');
    assertInvariant(typeof input.requireAllTests === 'boolean', 'workflow requireAllTests must be boolean');
    assertInvariant(Number.isSafeInteger(input.maxIterations) && input.maxIterations >= 1 && (input.budgetMode === 'provider-quota' || input.maxIterations <= 3),
      'workflow maxIterations must be 1..3');
    assertInvariant(Number.isSafeInteger(input.workerCount ?? 1) && (input.workerCount ?? 1) >= 0 && (input.workerCount ?? 1) <= 5,
      'workflow workerCount must be an integer from 0 to 5');
    const resolved = this.flywheel.resolveEvaluationPolicy({ policyId: input.policyId,
      minimumStability: input.minimumStability, requireAllTests: input.requireAllTests, maxIterations: input.maxIterations });
    const gatePolicy = { policyId: resolved.policyId, minimumStability: resolved.minimumStability,
      requireAllTests: resolved.requireAllTests, maxIterations: Math.min(input.maxIterations, resolved.maxIterations, input.budgetMode === 'provider-quota' ? Number.MAX_SAFE_INTEGER : 3) };
    assertInvariant(gatePolicy.maxIterations >= 1, 'workflow maxIterations must be 1..3');
    const run = this.flywheel.createRun(scenario.moduleId, input.policyId);
    const configurationSnapshot = await this.runConfiguration.capture(run.runId, input.governanceTrigger);
    const policyRef = await this.flywheel.putArtifact(Buffer.from(JSON.stringify(gatePolicy)), 'application/json');
    await this.flywheel.executeNode({ runId: run.runId, nodeId: 'workflow-policy',
      generationKey: `${run.runId}:workflow-policy`, inputRefs: [policyRef] }, async () => [policyRef]);
    this.flywheel.transition(run.runId, 'PLANNED');
    return this.workflow.start({
      runId: run.runId,
      maxIterations: gatePolicy.maxIterations,
      budgetMode: input.budgetMode,
      workerCount: input.workerCount ?? 1,
      context: {
        scenario: structuredClone(scenario),
        configurationSnapshot,
        gatePolicy,
      },
    });
  }

  /** 提供 scenarioFor运行 对应的scenarioFor运行操作。 */
  async scenarioForRun(runId: string): Promise<AutomatedProjectScenario> {
    const ref = this.flywheel.getCommittedNodeOutputs({
      runId, nodeId: 'project-scenario', generationKey: `${runId}:project-scenario`,
    })?.[0];
    if (!ref) throw new Error('WORKFLOW_SCENARIO_UNAVAILABLE');
    return JSON.parse(Buffer.from(await this.flywheel.getArtifact(ref)).toString('utf8'));
  }

  /** 等待请求。 */
  async shutdown(): Promise<void> { await this.workflow.shutdown?.(); }

  /** 等待请求。 */
  async wait(runId: string): Promise<WorkflowExecutionView> {
    const view = await this.workflow.wait(runId);
    this.synchronizeTerminalRun(runId, view.executionStatus);
    return view;
  }

  /** 提供 状态 对应的状态操作。 */
  async status(runId: string): Promise<WorkflowExecutionView> {
    const view = await this.workflow.status(runId);
    this.synchronizeTerminalRun(runId, view.executionStatus);
    return view;
  }

  /** 恢复请求。 */
  async resume(runId: string): Promise<WorkflowHandle> {
    await this.runConfiguration.assertCompatible(runId);
    return this.workflow.resume(runId);
  }

  /** 取消请求。 */
  async cancel(runId: string): Promise<void> {
    await this.workflow.cancel(runId);
    this.synchronizeTerminalRun(runId, 'CANCELLED');
  }

  private synchronizeTerminalRun(
    runId: string,
    status: WorkflowExecutionView['executionStatus'],
  ): void {
    // Infrastructure failures remain resumable. FlywheelRun only becomes terminal when
    // the knowledge-governance layer makes that decision (or an operator cancels it).
    const next = status === 'CANCELLED' ? 'CANCELLED' : status === 'STOPPED' ? 'LOW_CONFIDENCE' : null;
    if (!next) return;
    const run = this.flywheel.getRun(runId);
    if (run && !['VERIFIED', 'LOW_CONFIDENCE', 'FAILED', 'CANCELLED'].includes(run.state)) {
      this.flywheel.transition(runId, next);
    }
  }
}
