import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import Ajv2020Import from 'ajv/dist/2020.js';
import type {
  AgentId,
  AgentCommand,
  AgentContractValidator,
  AgentProvider,
  AgentResult,
  AgentWorkspaceProvider,
  EvalRunnerUseCase,
  GeneratedProjectFile,
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
} from '../ports/index.ts';
import {
  assertInvariant, sha256, type ArtifactRef, type GateDecision, type GatePolicy,
} from '../../domain/index.ts';
import type { KnowledgeFlywheelService } from './index.ts';
import type { RealSourceScenario } from './project-flow.ts';

const Ajv2020 = Ajv2020Import as unknown as new (options: Record<string, unknown>) => {
  compile(schema: Record<string, unknown>): {
    (value: unknown): boolean;
    errors?: unknown;
  };
  errorsText(errors: unknown): string;
};

const AGENT_OUTPUT_SCHEMAS: Record<AgentId, Record<string, unknown>> = {
  orchestrator: {
    type: 'object', required: ['strategy', 'iteration', 'parallel'], additionalProperties: false,
    properties: {
      strategy: { type: 'string', minLength: 1 }, iteration: { type: 'integer', minimum: 0 },
      parallel: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
    },
  },
  'doc-worker': {
    type: 'object', required: ['workerId', 'fragment', 'provenance'], additionalProperties: false,
    properties: {
      workerId: { type: 'string', minLength: 1 }, fragment: { type: 'string', minLength: 20 },
      provenance: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
    },
  },
  'doc-gen': {
    type: 'object', required: ['body', 'title', 'description'], additionalProperties: false,
    properties: {
      body: { type: 'string', minLength: 200 }, title: { type: 'string', minLength: 1 },
      description: { type: 'string', minLength: 1 },
    },
  },
  'test-gen': {
    type: 'object', required: ['candidateCommands', 'oracleRequired'], additionalProperties: false,
    properties: {
      candidateCommands: { type: 'array', minItems: 1, items: { type: 'object' } },
      oracleRequired: { type: 'boolean' },
    },
  },
  code: {
    type: 'object', required: ['files'], additionalProperties: false,
    properties: {
      files: {
        type: 'array', minItems: 1,
        items: {
          type: 'object', required: ['path', 'content'], additionalProperties: false,
          properties: { path: { type: 'string', minLength: 1 }, content: { type: 'string', minLength: 1 } },
        },
      },
    },
  },
  check: {
    type: 'object', required: ['blocking', 'findings', 'scope'], additionalProperties: false,
    properties: {
      blocking: { type: 'boolean' }, findings: { type: 'array', items: { type: 'string' } },
      scope: { type: 'array', items: { type: 'string', minLength: 1 } },
    },
  },
  review: {
    type: 'object', required: ['blocking', 'recommendation', 'correction'], additionalProperties: false,
    properties: {
      blocking: { type: 'boolean' }, recommendation: { enum: ['PASS', 'ITERATE'] },
      correction: {
        type: ['object', 'null'],
        properties: {
          correctionId: { type: 'string', minLength: 1 }, knowledgePath: { type: 'string', minLength: 1 },
          criterion: { type: 'string', minLength: 1 }, risk: { type: 'string', minLength: 1 },
        },
        required: ['correctionId', 'knowledgePath', 'criterion', 'risk'], additionalProperties: false,
      },
    },
  },
};

const NODE_BY_AGENT: Record<AgentId, string> = {
  orchestrator: 'orchestrator',
  'doc-worker': 'doc_worker',
  'doc-gen': 'doc_gen',
  'test-gen': 'test_gen',
  code: 'code',
  check: 'check',
  review: 'review',
};

interface AutomatedAssets {
  knowledgeV1: string;
  knowledgeV2: string;
  codeV1: string;
  codeV2: string;
  correction: string;
  generatedPath: string;
  title: string;
  description: string;
}

export interface AutomatedProjectScenario extends RealSourceScenario {
  assets: AutomatedAssets;
}

interface DocumentOutput {
  body: string;
  title: string;
  description: string;
}

interface CodeOutput {
  files: GeneratedProjectFile[];
}

interface CheckOutput {
  blocking: boolean;
  findings: string[];
}

interface ReviewOutput {
  blocking: boolean;
  recommendation: 'PASS' | 'ITERATE';
  correction: Record<string, unknown> | null;
}

function outputSchemaFor(
  agentId: AgentId,
  scenario: AutomatedProjectScenario,
): Record<string, unknown> {
  if (agentId !== 'code') return AGENT_OUTPUT_SCHEMAS[agentId];
  assertInvariant(scenario.allowedGeneratedPaths.length > 0,
    'automated scenario must declare at least one allowed generated path');
  return {
    type: 'object', required: ['files'], additionalProperties: false,
    properties: {
      files: {
        type: 'array', minItems: 1, maxItems: scenario.allowedGeneratedPaths.length,
        items: {
          type: 'object', required: ['path', 'content'], additionalProperties: false,
          properties: {
            path: { enum: scenario.allowedGeneratedPaths },
            content: { type: 'string', minLength: 1 },
          },
        },
      },
    },
  };
}

function assertAllowedGeneratedFiles(output: Record<string, unknown>, allowedPaths: string[]): void {
  const files = (output as unknown as CodeOutput).files;
  if (!Array.isArray(files)) throw new Error('AGENT_OUTPUT_INVALID: code.files must be an array');
  const seen = new Set<string>();
  for (const file of files) {
    if (!allowedPaths.includes(file.path)) throw new Error(`PROJECT_PATH_DENIED: ${file.path}`);
    if (seen.has(file.path)) throw new Error(`PROJECT_PATH_DUPLICATED: ${file.path}`);
    seen.add(file.path);
  }
}

function contextKey(nodeId: string, iteration: number, workerId?: string): string {
  return `${nodeId}:${iteration}${workerId ? `:${workerId}` : ''}`;
}

function routeFor(outcome: GateDecision['outcome']): WorkflowStageResult['route'] {
  return outcome;
}

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

export class OhMyWorkPanelWorkflowExecutor implements WorkflowStageExecutor {
  readonly flywheel: KnowledgeFlywheelService;
  readonly evalRunner: EvalRunnerUseCase;
  readonly evaluator: ProjectEvaluator;
  readonly assetRoot: string;
  readonly agent?: AgentProvider;
  readonly agentWorkspaces?: AgentWorkspaceProvider;
  readonly contracts: AgentContractValidator;

  constructor(input: {
    flywheel: KnowledgeFlywheelService;
    evalRunner: EvalRunnerUseCase;
    evaluator: ProjectEvaluator;
    assetRoot: string;
    contracts: AgentContractValidator;
    agent?: AgentProvider;
    agentWorkspaces?: AgentWorkspaceProvider;
  }) {
    this.flywheel = input.flywheel;
    this.evalRunner = input.evalRunner;
    this.evaluator = input.evaluator;
    this.assetRoot = resolve(input.assetRoot);
    this.contracts = input.contracts;
    this.agent = input.agent;
    this.agentWorkspaces = input.agentWorkspaces;
  }

  async execute(input: WorkflowStageInput): Promise<WorkflowStageResult> {
    const scenario = input.context.scenario as AutomatedProjectScenario | undefined;
    if (!scenario || scenario.schemaVersion !== '1.0') throw new Error('WORKFLOW_SCENARIO_INVALID');
    switch (input.nodeId) {
      case 'orchestrator': return this.orchestrate(input, scenario);
      case 'doc_worker':
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
    const current = this.flywheel.getRun(input.runId);
    if (!current) throw new Error(`WORKFLOW_RUN_NOT_FOUND: ${input.runId}`);
    if (current.state === 'CREATED') this.flywheel.transition(input.runId, 'PLANNED');
    const planned = this.flywheel.getRun(input.runId);
    if (planned?.state === 'PLANNED' || planned?.state === 'ITERATING' || planned?.state === 'ROLLING_BACK') {
      this.flywheel.transition(input.runId, 'GENERATING');
    }
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
    const commandInput = { ...input, context: { ...input.context, snapshot, scenarioRef } };
    const agent = this.agent
      ? await this.runLiveAgentCheckpoint(commandInput, scenario, 'orchestrator')
      : await this.commitAgentOutput(commandInput, scenario, 'orchestrator', {
        strategy: 'fixed-knowledge-flywheel-v1',
        iteration: input.iteration,
        parallel: ['documentation', 'test-generation'],
      });
    return {
      detail: `planned iteration ${input.iteration}`,
      context: { snapshot, scenarioRef, [contextKey(input.nodeId, input.iteration)]: agent },
    };
  }

  private async executeAgent(
    input: WorkflowStageInput,
    scenario: AutomatedProjectScenario,
    agentId: AgentId,
  ): Promise<WorkflowStageResult> {
    if (this.agent) {
      const ref = await this.runLiveAgentCheckpoint(input, scenario, agentId);
      return {
        detail: `${agentId} produced schema-validated DeepSeek Harness output`,
        context: { [contextKey(input.nodeId, input.iteration, input.workerId)]: ref },
      };
    }
    let output: Record<string, unknown>;
    if (agentId === 'doc-gen') {
      output = {
        body: this.asset(input.iteration === 0 ? scenario.assets.knowledgeV1 : scenario.assets.knowledgeV2),
        title: scenario.assets.title,
        description: scenario.assets.description,
      };
    } else if (agentId === 'code') {
      output = { files: [{
        path: scenario.assets.generatedPath,
        content: this.asset(input.iteration === 0 ? scenario.assets.codeV1 : scenario.assets.codeV2),
      }] };
    } else if (agentId === 'review') {
      const evaluationRef = input.context[contextKey('evaluationEvidenceRef', input.iteration)] as ArtifactRef | undefined;
      if (!evaluationRef) throw new Error('WORKFLOW_REVIEW_EVALUATION_MISSING');
      const evaluation = await this.readJson<ProjectEvaluation>(evaluationRef);
      output = {
        blocking: false,
        recommendation: evaluation.passed ? 'PASS' : 'ITERATE',
        correction: evaluation.passed
          ? null
          : JSON.parse(this.asset(scenario.assets.correction)) as Record<string, unknown>,
      };
    } else if (agentId === 'test-gen') {
      output = { candidateCommands: scenario.finalCommands, oracleRequired: true };
    } else if (agentId === 'check') {
      output = { blocking: false, findings: [], scope: scenario.allowedGeneratedPaths };
    } else if (agentId === 'doc-worker') {
      output = {
        workerId: input.workerId,
        fragment: `Source partition ${input.workerId ?? 'default'} prepared for DocGen.`,
        provenance: scenario.sourcePaths,
      };
    } else {
      output = { iteration: input.iteration, strategy: 'fixed-knowledge-flywheel-v1' };
    }
    const ref = await this.commitAgentOutput(input, scenario, agentId, output);
    return {
      detail: `${agentId} produced schema-bound fixture output`,
      context: { [contextKey(input.nodeId, input.iteration, input.workerId)]: ref },
    };
  }

  private async runLiveAgentCheckpoint(
    input: WorkflowStageInput,
    scenario: AutomatedProjectScenario,
    agentId: AgentId,
  ): Promise<ArtifactRef> {
    return this.executeAgentCheckpoint(input, scenario, agentId);
  }

  private async runLiveAgent(
    input: WorkflowStageInput,
    scenario: AutomatedProjectScenario,
    agentId: AgentId,
    command: AgentCommand,
  ): Promise<Record<string, unknown>> {
    if (!this.agent) throw new Error('WORKFLOW_LIVE_AGENT_UNAVAILABLE');
    if (!this.agentWorkspaces) throw new Error('WORKFLOW_AGENT_WORKSPACE_UNAVAILABLE');
    const snapshot = input.context.snapshot as ProjectSnapshot | undefined;
    if (!snapshot) throw new Error('WORKFLOW_PROJECT_SNAPSHOT_MISSING');
    const readablePaths = agentId === 'doc-worker'
      ? [...this.assignedSourcePaths(input, scenario), ...scenario.publicInterfacePaths]
      : agentId === 'doc-gen' || agentId === 'test-gen'
        ? [...scenario.sourcePaths, ...scenario.publicInterfacePaths]
      : agentId === 'code' || agentId === 'check' || agentId === 'review'
        ? scenario.publicInterfacePaths
        : [];
    const workspace = await this.agentWorkspaces.materialize({
      isolationKey: `${input.runId}:${input.nodeId}:${input.iteration}:${input.workerId ?? 'main'}`,
      role: agentId,
      sourceRoot: scenario.repositoryRoot,
      sourceCommit: snapshot.commit,
      readablePaths,
    });
    const materials = await Promise.all(this.artifactRefsIn(command.payload).map(async (ref) => ({
      ref,
      content: await this.readArtifact(ref),
    })));
    return this.agent.run({
      role: agentId,
      prompt: `${input.prompt}\n\n受信 AgentCommand：\n${JSON.stringify(command)}\n\n命令引用工件（已校验内容摘要）：\n${JSON.stringify(materials)}`,
      outputSchema: outputSchemaFor(agentId, scenario),
      idempotencyKey: command.generationKey,
      command,
      inputRefs: this.artifactRefsIn(command.payload),
      workspaceRoot: workspace.workspaceRoot,
      metadata: {
        runId: input.runId, nodeId: input.nodeId, iteration: input.iteration,
        attempt: input.attempt, workerId: input.workerId ?? null,
        commandId: command.commandId,
      },
    }, input.signal);
  }

  private async executeAgentCheckpoint(
    input: WorkflowStageInput,
    scenario: AutomatedProjectScenario,
    agentId: AgentId,
    fixtureOutput?: Record<string, unknown>,
  ): Promise<ArtifactRef> {
    const outputSchema = outputSchemaFor(agentId, scenario);
    const command = await this.buildAgentCommand(input, scenario, agentId);
    this.contracts.assertCommand(command);
    const commandRef = await this.flywheel.putArtifact(
      Buffer.from(JSON.stringify(command, null, 2)), 'application/json',
    );
    const inputRefs = this.uniqueRefs([
      ...this.agentInputRefs(input, agentId),
      ...this.artifactRefsIn(command.payload),
      commandRef,
    ]);
    const checkpoint = await this.flywheel.executeNode({
      runId: input.runId,
      nodeId: input.workerId ? `${input.nodeId}:${input.workerId}` : input.nodeId,
      generationKey: command.generationKey,
      inputRefs,
    }, async () => {
      const output = fixtureOutput ?? await this.runLiveAgent(input, scenario, agentId, command);
      this.validateAgentOutput(output, outputSchema);
      if (agentId === 'code') assertAllowedGeneratedFiles(output, scenario.allowedGeneratedPaths);
      const rawRef = await this.flywheel.putArtifact(
        Buffer.from(JSON.stringify(output, null, 2)), 'application/json',
      );
      const result = await this.normalizeAgentResult(command, commandRef, input, scenario, output, rawRef);
      this.contracts.assertResult(result);
      const resultRef = await this.flywheel.putArtifact(
        Buffer.from(JSON.stringify(result, null, 2)), 'application/json',
      );
      return [resultRef, rawRef];
    });
    const ref = checkpoint.outputRefs[0];
    if (!ref) throw new Error(`WORKFLOW_AGENT_OUTPUT_MISSING: ${input.nodeId}`);
    return ref;
  }

  private async commitCandidate(
    input: WorkflowStageInput,
    scenario: AutomatedProjectScenario,
  ): Promise<WorkflowStageResult> {
    const documentRef = input.context[contextKey('doc_gen', input.iteration)] as ArtifactRef | undefined;
    if (!documentRef) throw new Error('WORKFLOW_DOC_OUTPUT_MISSING');
    const document = await this.readAgentOutput<DocumentOutput>(documentRef, 'doc-gen', input);
    const checkpoint = await this.flywheel.executeNode({
      runId: input.runId,
      nodeId: input.nodeId,
      generationKey: `${input.runId}:${input.nodeId}:${input.iteration}`,
      inputRefs: [documentRef],
    }, async () => {
      const candidate = await this.flywheel.ingestCandidate({
        moduleId: scenario.moduleId,
        body: document.body,
        title: document.title,
        description: document.description,
        category: 'automated-ohmyworkpanel',
        tags: ['ohmyworkpanel', 'langgraph'],
        provenance: scenario.sourcePaths.map((path) => ({
          path,
          commit: (input.context.snapshot as ProjectSnapshot).commit,
          pinned: true,
        })),
        metadata: { workflow: 'embedded-domain-knowledge', iteration: input.iteration },
      });
      return [candidate.version.bodyRef];
    });
    const bodyRef = checkpoint.outputRefs[0];
    if (!bodyRef) throw new Error('WORKFLOW_CANDIDATE_CHECKPOINT_EMPTY');
    const version = this.flywheel.findKnowledgeVersionByBody(scenario.moduleId, bodyRef.artifactId);
    if (!version) throw new Error('WORKFLOW_CANDIDATE_VERSION_MISSING');
    const quality = this.flywheel.evaluateQuality(document.body, {
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

  private async validateOracle(
    input: WorkflowStageInput,
    scenario: AutomatedProjectScenario,
  ): Promise<WorkflowStageResult> {
    const snapshot = input.context.snapshot as ProjectSnapshot;
    const scenarioRef = input.context.scenarioRef as ArtifactRef;
    const checkpoint = await this.flywheel.executeNode({
      runId: input.runId,
      nodeId: input.nodeId,
      generationKey: `${input.runId}:${input.nodeId}:${input.iteration}`,
      inputRefs: [scenarioRef, snapshot.manifestRef],
    }, async () => {
      const evaluation = await this.evaluator.evaluate({
        label: `reference-oracle-${input.iteration}`,
        snapshot,
        generatedFiles: [],
        prepareCommands: scenario.prepareCommands,
        commands: scenario.referenceCommands,
      }, input.signal);
      if (!evaluation.passed) throw new Error(`REFERENCE_GATE_FAILED: ${evaluation.evidenceRef.artifactId}`);
      return [evaluation.evidenceRef];
    });
    return {
      detail: 'reference oracle passed',
      context: { [contextKey('oracleEvidenceRef', input.iteration)]: checkpoint.outputRefs[0] },
    };
  }

  private async evaluate(
    input: WorkflowStageInput,
    scenario: AutomatedProjectScenario,
  ): Promise<WorkflowStageResult> {
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
    for (const file of code.files) {
      if (!scenario.allowedGeneratedPaths.includes(file.path)) throw new Error(`PROJECT_PATH_DENIED: ${file.path}`);
    }
    const checkpoint = await this.flywheel.executeNode({
      runId: input.runId,
      nodeId: input.nodeId,
      generationKey: `${input.runId}:${input.nodeId}:${input.iteration}`,
      inputRefs: [scenarioRef, snapshot.manifestRef, bodyRef, codeRef, oracleRef, checkRef],
    }, async () => {
      const evaluation = await this.evaluator.evaluate({
        label: `generated-iteration-${input.iteration}`,
        snapshot,
        generatedFiles: code.files,
        prepareCommands: scenario.prepareCommands,
        commands: input.iteration === 0 ? scenario.firstIterationCommands : scenario.finalCommands,
      }, input.signal);
      return [evaluation.evidenceRef];
    });
    const evidenceRef = checkpoint.outputRefs[0];
    if (!evidenceRef) throw new Error('WORKFLOW_EVALUATION_EVIDENCE_MISSING');
    const evaluation = await this.readJson<ProjectEvaluation>(evidenceRef);
    const run = this.flywheel.getRun(input.runId);
    if (run?.state === 'GENERATING') this.flywheel.transition(input.runId, 'EVALUATING');
    if (evaluation.infrastructureFailure) {
      const decision = await this.recordGateDecision(input, evaluation);
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
    const quality = input.context[contextKey('qualityReport', input.iteration)] as QualityReport | undefined;
    if (quality?.outcome === 'REJECTED') {
      const run = this.flywheel.getRun(input.runId);
      if (!run) throw new Error(`WORKFLOW_RUN_NOT_FOUND: ${input.runId}`);
      const exhausted = run.iteration >= input.maxIterations;
      if (exhausted && run.state === 'GENERATING') {
        this.flywheel.transition(input.runId, 'LOW_CONFIDENCE');
      } else if (!exhausted && run.state === 'GENERATING') {
        this.flywheel.transition(input.runId, 'ITERATING');
      }
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
    const run = this.flywheel.getRun(input.runId);
    if (route === 'ITERATE' && run?.state === 'REVIEWING') {
      this.flywheel.transition(input.runId, 'ITERATING');
    } else if (route === 'STOPPED' && run?.state === 'REVIEWING') {
      this.flywheel.transition(input.runId, 'LOW_CONFIDENCE');
    }
    return {
      detail: `workflow route ${route}`,
      route,
      context: { [contextKey('gateDecision', input.iteration)]: decision },
    };
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
    const review = reviewRef ? await this.readAgentOutput<ReviewOutput>(reviewRef, 'review', input) : null;
    const policy = input.context.gatePolicy as GatePolicy | undefined;
    const run = this.flywheel.getRun(input.runId);
    if (!policy || !run) throw new Error('WORKFLOW_GATE_POLICY_MISSING');
    assertInvariant(policy.policyId === run.policyId, 'workflow gate policy does not match run');
    assertInvariant(policy.maxIterations === input.maxIterations, 'workflow iteration policy changed after start');
    const evaluationRef = input.context[contextKey('evaluationEvidenceRef', input.iteration)] as ArtifactRef | undefined;
    if (!evaluationRef) throw new Error('WORKFLOW_EVALUATION_EVIDENCE_MISSING');
    const inputRefs = [scenarioRef, snapshot.manifestRef, bodyRef, codeRef, oracleRef, checkRef];
    if (reviewRef) inputRefs.push(reviewRef);
    const { decision } = await this.evalRunner.evaluate({
      runId: input.runId,
      versionId,
      inputRefs,
      evidenceRefs: [evaluationRef],
      toolchainFingerprint: evaluation.toolchainFingerprint,
      criticalFailures: evaluation.passed ? 0 : 1,
      testsPassed: evaluation.testsPassed,
      testsTotal: evaluation.testsTotal,
      stability: evaluation.stability,
      infrastructureFailure: evaluation.infrastructureFailure,
      checkBlocking: check.blocking,
      reviewBlocking: review?.blocking ?? false,
    }, policy);
    return decision;
  }

  private async publish(input: WorkflowStageInput): Promise<WorkflowStageResult> {
    const decision = input.context[contextKey('gateDecision', input.iteration)] as GateDecision | undefined;
    const versionId = input.context[contextKey('candidateVersionId', input.iteration)];
    if (!decision || typeof versionId !== 'string') throw new Error('WORKFLOW_PUBLICATION_INPUT_MISSING');
    const publication = await this.flywheel.publish(input.runId, versionId, decision.decisionId);
    return {
      detail: `Knowledge Flywheel publication ${publication.publicationKey}`,
      context: { publication },
      route: 'PASS',
    };
  }

  private async commitAgentOutput(
    input: WorkflowStageInput,
    scenario: AutomatedProjectScenario,
    agentId: AgentId,
    output: Record<string, unknown>,
  ): Promise<ArtifactRef> {
    return this.executeAgentCheckpoint(input, scenario, agentId, output);
  }

  private async buildAgentCommand(
    input: WorkflowStageInput,
    scenario: AutomatedProjectScenario,
    agentId: AgentId,
  ): Promise<AgentCommand> {
    const scenarioRef = input.context.scenarioRef as ArtifactRef | undefined;
    const snapshot = input.context.snapshot as ProjectSnapshot | undefined;
    if (!scenarioRef || !snapshot?.manifestRef) throw new Error(`AGENT_COMMAND_INPUT_MISSING: ${agentId}`);
    const publicInterfaceRefs = [snapshot.manifestRef];
    let payload: Record<string, unknown>;
    if (agentId === 'orchestrator') {
      const gatePolicy = input.context.gatePolicy;
      if (!gatePolicy) throw new Error('AGENT_COMMAND_INPUT_MISSING: orchestrator.gatePolicy');
      const policyRef = await this.flywheel.putArtifact(
        Buffer.from(JSON.stringify(gatePolicy, null, 2)), 'application/json',
      );
      payload = { policyRef, moduleRefs: [scenarioRef, snapshot.manifestRef] };
    } else if (agentId === 'doc-gen' || agentId === 'doc-worker') {
      payload = {
        moduleId: scenario.moduleId,
        sourceRefs: [snapshot.manifestRef],
        publicInterfaceRefs,
      };
      if (agentId === 'doc-worker') {
        const assignedSourcePaths = this.assignedSourcePaths(input, scenario);
        if (assignedSourcePaths.length > 0) payload.assignedSourcePaths = assignedSourcePaths;
      } else {
        const workerFragmentRefs: ArtifactRef[] = [];
        for (const [key, value] of Object.entries(input.context)) {
          if (!key.startsWith(`doc_worker:${input.iteration}:`)
            || !value || typeof value !== 'object' || !('artifactId' in value)) continue;
          const workerId = key.split(':')[2];
          const workerResult = await this.readAgentResult(
            value as ArtifactRef,
            'doc-worker',
            input.runId,
            this.expectedAgentGenerationKey(input, 'doc-worker', input.iteration, workerId),
          );
          const chunkRef = workerResult.payload['chunkRef'] as ArtifactRef | undefined;
          if (chunkRef) workerFragmentRefs.push(chunkRef);
        }
        if (workerFragmentRefs.length > 0) payload.workerFragmentRefs = this.uniqueRefs(workerFragmentRefs);
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
      }
    } else if (agentId === 'test-gen') {
      payload = {
        moduleId: scenario.moduleId,
        sourceSnapshotRef: snapshot.manifestRef,
        publicInterfaceRefs,
        languageId: this.scenarioLanguage(scenario),
        testPolicyRef: scenarioRef,
      };
    } else if (agentId === 'code') {
      const knowledgeRef = input.context[contextKey('candidateBodyRef', input.iteration)] as ArtifactRef | undefined;
      if (!knowledgeRef) throw new Error('AGENT_COMMAND_INPUT_MISSING: code.knowledgeRef');
      payload = {
        knowledgeRef,
        publicInterfaceRefs,
        languageId: this.scenarioLanguage(scenario),
        buildContractRef: scenarioRef,
        allowedGeneratedPaths: scenario.allowedGeneratedPaths,
      };
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
      payload = { diffRef, criteriaRef: scenarioRef, publicInterfaceRefs };
    } else {
      const knowledgeRef = input.context[contextKey('candidateBodyRef', input.iteration)] as ArtifactRef | undefined;
      const evaluationReportRef = input.context[contextKey('evaluationEvidenceRef', input.iteration)] as ArtifactRef | undefined;
      if (!knowledgeRef || !evaluationReportRef) {
        throw new Error('AGENT_COMMAND_INPUT_MISSING: review');
      }
      payload = { knowledgeRef, evaluationReportRef, criteriaRef: scenarioRef };
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

  private async normalizeAgentResult(
    command: AgentCommand,
    commandRef: ArtifactRef,
    input: WorkflowStageInput,
    scenario: AutomatedProjectScenario,
    raw: Record<string, unknown>,
    rawRef: ArtifactRef,
  ): Promise<AgentResult> {
    const scenarioRef = input.context.scenarioRef as ArtifactRef;
    const snapshot = input.context.snapshot as ProjectSnapshot;
    let payload: Record<string, unknown>;
    const outputRefs: ArtifactRef[] = [rawRef];
    if (command.agentType === 'orchestrator') {
      const nodes: Array<[string, AgentId, string[], string[], string[]]> = [
        ['doc_worker', 'doc-worker', [], ['source:read'], ['knowledge-chunk']],
        ['doc_gen', 'doc-gen', ['doc_worker'], ['source:read', 'cas:write'], ['knowledge-candidate']],
        ['test_gen', 'test-gen', [], ['source:read', 'cas:write'], ['test-candidates']],
        ['code', 'code', ['doc_gen'], ['workspace:write', 'cas:write'], ['code-artifact']],
        ['check', 'check', ['code'], ['workspace:read'], ['findings']],
        ['review', 'review', ['check'], ['cas:read'], ['attribution']],
      ];
      payload = {
        resultKind: 'plan',
        nodes: nodes.map(([nodeId, agentType, dependsOn, resourceClaims, artifactExpectations]) => ({
          nodeId,
          agentType,
          dependsOn,
          generationKey: `${input.runId}:${nodeId}:${input.iteration}:contract-v5`,
          inputSchema: 'https://wpknowledge.local/schemas/agent-command/v1',
          outputSchema: 'https://wpknowledge.local/schemas/agent-result/v1',
          resourceClaims,
          artifactExpectations,
        })),
      };
    } else if (command.agentType === 'doc-gen') {
      const document = raw as unknown as DocumentOutput;
      const bodyRef = await this.flywheel.putArtifact(Buffer.from(document.body), 'text/markdown');
      outputRefs.push(bodyRef);
      payload = {
        resultKind: 'knowledgeCandidate',
        bodyRef,
        provenance: [scenarioRef, snapshot.manifestRef],
        changedPaths: [`knowledge/${scenario.moduleId}.md`],
        unresolvedRisks: [],
      };
    } else if (command.agentType === 'doc-worker') {
      const fragment = String(raw.fragment);
      const chunkRef = await this.flywheel.putArtifact(Buffer.from(fragment), 'text/plain');
      outputRefs.push(chunkRef);
      payload = {
        resultKind: 'knowledgeChunk',
        chunkRef,
        provenance: [scenarioRef, snapshot.manifestRef],
        unresolvedRisks: [],
      };
    } else if (command.agentType === 'test-gen') {
      payload = {
        resultKind: 'testCandidates',
        candidateSetRef: rawRef,
        caseManifestRef: rawRef,
        oracleClaims: [raw.oracleRequired === true
          ? 'reference oracle must pass before generated tests are trusted'
          : 'candidate commands require deterministic evaluation'],
      };
    } else if (command.agentType === 'code') {
      payload = { resultKind: 'codeArtifact', codeRef: rawRef, buildManifestRef: rawRef };
    } else if (command.agentType === 'check') {
      const check = raw as unknown as { blocking: boolean; findings: string[]; scope: string[] };
      payload = {
        resultKind: 'findings',
        findings: check.findings.map((message, index) => ({
          findingId: `finding-${index + 1}`,
          severity: check.blocking ? 'BLOCKER' : 'INFO',
          criterionId: 'deterministic-check',
          evidenceLocation: check.scope[0] ?? `workflow:${input.nodeId}`,
          message,
        })),
      };
    } else {
      const review = raw as unknown as ReviewOutput;
      const evaluationRef = input.context[contextKey('evaluationEvidenceRef', input.iteration)] as ArtifactRef;
      const correction = review.correction;
      const corrections = correction ? [{
        correctionId: this.correctionId(correction['correctionId']),
        knowledgePath: String(correction['knowledgePath']),
        criterion: String(correction['criterion']),
        evidenceRefs: [evaluationRef],
        risk: String(correction['risk']),
      }] : [];
      payload = {
        resultKind: 'attribution',
        corrections,
        unresolvedRisks: review.blocking && corrections.length === 0
          ? ['review reported a blocking condition without a correction']
          : [],
      };
    }
    return {
      schemaVersion: '1.0',
      commandId: command.commandId,
      commandRef,
      runId: command.runId,
      agentType: command.agentType,
      status: 'SUCCEEDED',
      outputRefs: this.uniqueRefs(outputRefs),
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
    const tool = scenario.finalCommands[0]?.tool ?? scenario.referenceCommands[0]?.tool ?? 'node';
    return tool === 'cargo' ? 'rust' : 'typescript';
  }

  private assignedSourcePaths(
    input: WorkflowStageInput,
    scenario: AutomatedProjectScenario,
  ): string[] {
    const workerIndex = input.workerIndex ?? 0;
    return scenario.sourcePaths.filter((_, index) =>
      index % Math.max(1, input.workerCount) === workerIndex,
    );
  }

  private correctionId(value: unknown): string {
    const candidate = String(value ?? '');
    if (/^COR-[0-9]{4,}$/.test(candidate)) return candidate;
    return `COR-${String(parseInt(sha256(candidate).slice(0, 8), 16)).padStart(10, '0')}`;
  }

  private validateAgentOutput(output: Record<string, unknown>, schema: Record<string, unknown>): void {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    const validate = ajv.compile(schema);
    if (!validate(output)) throw new Error(`AGENT_OUTPUT_INVALID: ${ajv.errorsText(validate.errors)}`);
  }

  private agentGenerationKey(input: WorkflowStageInput, agentId: AgentId): string {
    if (agentId === 'test-gen') return `${input.runId}:test_gen:stable-source:contract-v5`;
    if (agentId === 'doc-worker') {
      return `${input.runId}:doc_worker:${input.workerId ?? 'main'}:stable-source:contract-v5`;
    }
    return `${input.runId}:${input.nodeId}:${input.iteration}:${input.workerId ?? 'main'}:contract-v5`;
  }

  private agentInputRefs(input: WorkflowStageInput, agentId: AgentId): ArtifactRef[] {
    const keys: string[] = [];
    if (agentId !== 'orchestrator') keys.push('scenarioRef', 'snapshot.manifestRef');
    if (agentId === 'doc-gen') {
      keys.push(...Object.keys(input.context).filter((key) => key.startsWith(`doc_worker:${input.iteration}:`)));
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

  private asset(relativePath: string): string {
    const target = resolve(this.assetRoot, relativePath);
    if (target !== this.assetRoot && !target.startsWith(`${this.assetRoot}${sep}`)) {
      throw new Error(`WORKFLOW_ASSET_DENIED: ${relativePath}`);
    }
    return readFileSync(target, 'utf8');
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
      this.expectedAgentGenerationKey(input, expectedAgent, input.iteration),
    );
    const rawRef = result.outputRefs.find((outputRef) => outputRef.mediaType === 'application/json');
    if (!rawRef) throw new Error(`AGENT_RESULT_RAW_OUTPUT_MISSING: ${expectedAgent}`);
    return this.readJson<T>(rawRef);
  }

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
      nodeId: NODE_BY_AGENT[agentId],
      agentId,
      iteration,
      ...(workerId ? { workerId } : { workerId: undefined }),
    }, agentId);
  }

  private async readArtifact(ref: ArtifactRef): Promise<unknown> {
    const text = Buffer.from(await this.flywheel.getArtifact(ref)).toString('utf8');
    return ref.mediaType.includes('json') ? JSON.parse(text) as unknown : text;
  }
}

export class AutomatedProjectWorkflowService {
  readonly flywheel: KnowledgeFlywheelService;
  readonly workflow: WorkflowEngine;
  readonly runConfiguration: RunConfigurationManager;

  constructor(
    flywheel: KnowledgeFlywheelService,
    workflow: WorkflowEngine,
    runConfiguration: RunConfigurationManager,
  ) {
    this.flywheel = flywheel;
    this.workflow = workflow;
    this.runConfiguration = runConfiguration;
  }

  async start(
    scenario: AutomatedProjectScenario,
    input: GatePolicy & {
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
    assertInvariant(Number.isSafeInteger(input.maxIterations) && input.maxIterations >= 1,
      'workflow maxIterations must be a positive integer');
    assertInvariant(Number.isSafeInteger(input.workerCount ?? 1) && (input.workerCount ?? 1) >= 0 && (input.workerCount ?? 1) <= 5,
      'workflow workerCount must be an integer from 0 to 5');
    const run = this.flywheel.createRun(scenario.moduleId, input.policyId);
    const configurationSnapshot = await this.runConfiguration.capture(run.runId, input.governanceTrigger);
    this.flywheel.transition(run.runId, 'PLANNED');
    return this.workflow.start({
      runId: run.runId,
      maxIterations: input.maxIterations,
      workerCount: input.workerCount ?? 1,
      context: {
        scenario,
        configurationSnapshot,
        gatePolicy: {
          policyId: input.policyId,
          minimumStability: input.minimumStability,
          requireAllTests: input.requireAllTests,
          maxIterations: input.maxIterations,
        },
      },
    });
  }

  async wait(runId: string): Promise<WorkflowExecutionView> {
    return this.workflow.wait(runId);
  }

  status(runId: string): Promise<WorkflowExecutionView> {
    return this.workflow.status(runId);
  }

  async resume(runId: string): Promise<WorkflowHandle> {
    await this.runConfiguration.assertCompatible(runId);
    return this.workflow.resume(runId);
  }

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
    const next = status === 'CANCELLED' ? 'CANCELLED' : null;
    if (!next) return;
    const run = this.flywheel.getRun(runId);
    if (run && !['VERIFIED', 'LOW_CONFIDENCE', 'FAILED', 'CANCELLED'].includes(run.state)) {
      this.flywheel.transition(runId, next);
    }
  }
}
