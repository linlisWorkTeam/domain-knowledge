import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import Ajv2020Import from 'ajv/dist/2020.js';
import type {
  AgentId,
  AgentProvider,
  AgentWorkspaceProvider,
  GeneratedProjectFile,
  ProjectEvaluation,
  ProjectEvaluator,
  ProjectSnapshot,
  QualityReport,
  WorkflowStageExecutor,
  WorkflowStageInput,
  WorkflowStageResult,
  WorkflowEngine,
  WorkflowExecutionView,
  WorkflowHandle,
} from '../ports/index.ts';
import {
  assertInvariant, type ArtifactRef, type GateDecision, type GatePolicy,
} from '../../domain/index.ts';
import type { KnowledgeFlywheelService } from './index.ts';
import type { RealSourceScenario } from './project-flow.ts';
import { KNOWLEDGE_WRITING_GUIDE } from './knowledge-writing-guide.ts';

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

export class OhMyWorkPanelWorkflowExecutor implements WorkflowStageExecutor {
  readonly service: KnowledgeFlywheelService;
  readonly evaluator: ProjectEvaluator;
  readonly assetRoot: string;
  readonly agent?: AgentProvider;
  readonly agentWorkspaces?: AgentWorkspaceProvider;

  constructor(input: {
    service: KnowledgeFlywheelService;
    evaluator: ProjectEvaluator;
    assetRoot: string;
    agent?: AgentProvider;
    agentWorkspaces?: AgentWorkspaceProvider;
  }) {
    this.service = input.service;
    this.evaluator = input.evaluator;
    this.assetRoot = resolve(input.assetRoot);
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
    const current = this.service.repository.getRun(input.runId);
    if (!current) throw new Error(`WORKFLOW_RUN_NOT_FOUND: ${input.runId}`);
    if (current.state === 'CREATED') this.service.transition(input.runId, 'PLANNED');
    const planned = this.service.repository.getRun(input.runId);
    if (planned?.state === 'PLANNED' || planned?.state === 'ITERATING' || planned?.state === 'ROLLING_BACK') {
      this.service.transition(input.runId, 'GENERATING');
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
      scenarioRef = await this.service.artifacts.put(Buffer.from(JSON.stringify({
        ...scenario, repositoryRoot: snapshot.repositoryRoot, expectedCommit: snapshot.commit,
      }, null, 2)), 'application/json');
    }
    const agent = this.agent
      ? await this.runLiveAgentCheckpoint(input, scenario, 'orchestrator')
      : await this.commitAgentOutput(input, {
        strategy: 'fixed-knowledge-flywheel-v1',
        iteration: input.iteration,
        parallel: ['documentation', 'test-generation'],
      }, AGENT_OUTPUT_SCHEMAS.orchestrator);
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
    const ref = await this.commitAgentOutput(input, output, AGENT_OUTPUT_SCHEMAS[agentId]);
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
    const outputSchema = outputSchemaFor(agentId, scenario);
    const checkpoint = await this.service.executeNode({
      runId: input.runId,
      nodeId: input.workerId ? `${input.nodeId}:${input.workerId}` : input.nodeId,
      generationKey: this.agentGenerationKey(input, agentId),
      inputRefs: this.agentInputRefs(input, agentId),
    }, async () => {
      const output = await this.runLiveAgent(input, scenario, agentId);
      this.validateAgentOutput(output, outputSchema);
      if (agentId === 'code') assertAllowedGeneratedFiles(output, scenario.allowedGeneratedPaths);
      return [await this.service.artifacts.put(
        Buffer.from(JSON.stringify(output, null, 2)), 'application/json',
      )];
    });
    const ref = checkpoint.outputRefs[0];
    if (!ref) throw new Error(`WORKFLOW_AGENT_OUTPUT_MISSING: ${input.nodeId}`);
    return ref;
  }

  private async runLiveAgent(
    input: WorkflowStageInput,
    scenario: AutomatedProjectScenario,
    agentId: AgentId,
  ): Promise<Record<string, unknown>> {
    if (!this.agent) throw new Error('WORKFLOW_LIVE_AGENT_UNAVAILABLE');
    if (!this.agentWorkspaces) throw new Error('WORKFLOW_AGENT_WORKSPACE_UNAVAILABLE');
    const sourceReadable = ['doc-worker', 'doc-gen', 'test-gen'].includes(agentId);
    const readablePaths = sourceReadable
      ? [...scenario.sourcePaths, ...scenario.publicInterfacePaths]
      : agentId === 'code' || agentId === 'check' || agentId === 'review'
        ? scenario.publicInterfacePaths
        : [];
    const workspace = await this.agentWorkspaces.materialize({
      isolationKey: `${input.runId}:${input.nodeId}:${input.iteration}:${input.workerId ?? 'main'}`,
      role: agentId,
      sourceRoot: scenario.repositoryRoot,
      readablePaths,
    });
    const evidence: Record<string, unknown> = {
      moduleId: scenario.moduleId,
      iteration: input.iteration,
      workerId: input.workerId ?? null,
      readablePaths: workspace.readablePaths,
      allowedGeneratedPaths: scenario.allowedGeneratedPaths,
      writingGuide: agentId === 'doc-gen' ? KNOWLEDGE_WRITING_GUIDE : undefined,
    };
    if (agentId === 'doc-worker') {
      const workerIndex = input.workerIndex ?? 0;
      evidence.assignedSourcePaths = scenario.sourcePaths.filter((_, index) =>
        index % Math.max(1, input.workerCount) === workerIndex,
      );
    }
    if (input.iteration > 0) {
      const previousDocumentRef = input.context[contextKey('doc_gen', input.iteration - 1)] as ArtifactRef | undefined;
      const previousReviewRef = input.context[contextKey('review', input.iteration - 1)] as ArtifactRef | undefined;
      if (previousDocumentRef) evidence.previousDocument = await this.readJson<Record<string, unknown>>(previousDocumentRef);
      if (previousReviewRef) evidence.previousReview = await this.readJson<Record<string, unknown>>(previousReviewRef);
      const previousQuality = input.context[contextKey('qualityReport', input.iteration - 1)] as QualityReport | undefined;
      if (previousQuality) evidence.previousQualityFeedback = previousQuality;
    }
    if (agentId === 'doc-gen') {
      const fragments: Record<string, unknown>[] = [];
      for (const [key, value] of Object.entries(input.context)) {
        if (!key.startsWith(`doc_worker:${input.iteration}:`)) continue;
        if (value && typeof value === 'object' && 'artifactId' in value) {
          fragments.push(await this.readJson<Record<string, unknown>>(value as ArtifactRef));
        }
      }
      evidence.workerFragments = fragments;
    }
    const contextualRefs: Record<string, unknown> = {};
    const contextAllowlist: Partial<Record<AgentId, string[]>> = {
      code: ['candidateBodyRef'],
      check: ['candidateBodyRef', 'code'],
      review: ['candidateBodyRef', 'check', 'evaluationEvidenceRef'],
    };
    for (const [key, value] of Object.entries(input.context)) {
      if (!key.endsWith(`:${input.iteration}`) || !value || typeof value !== 'object' || !('artifactId' in value)) continue;
      if ((contextAllowlist[agentId] ?? []).some((name) => key.startsWith(name))) {
        contextualRefs[key] = await this.readArtifact(value as ArtifactRef);
      }
    }
    evidence.currentEvidence = contextualRefs;
    return this.agent.run({
      role: agentId,
      prompt: `${input.prompt}\n\n受信工作流上下文：\n${JSON.stringify(evidence)}`,
      outputSchema: outputSchemaFor(agentId, scenario),
      idempotencyKey: `${input.runId}:${input.nodeId}:${input.iteration}:${input.workerId ?? 'main'}`,
      workspaceRoot: workspace.workspaceRoot,
      metadata: {
        runId: input.runId, nodeId: input.nodeId, iteration: input.iteration,
        attempt: input.attempt, workerId: input.workerId ?? null,
      },
    }, input.signal);
  }

  private async commitCandidate(
    input: WorkflowStageInput,
    scenario: AutomatedProjectScenario,
  ): Promise<WorkflowStageResult> {
    const documentRef = input.context[contextKey('doc_gen', input.iteration)] as ArtifactRef | undefined;
    if (!documentRef) throw new Error('WORKFLOW_DOC_OUTPUT_MISSING');
    const document = await this.readJson<DocumentOutput>(documentRef);
    const checkpoint = await this.service.executeNode({
      runId: input.runId,
      nodeId: input.nodeId,
      generationKey: `${input.runId}:${input.nodeId}:${input.iteration}`,
      inputRefs: [documentRef],
    }, async () => {
      const candidate = await this.service.ingestCandidate({
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
    const version = this.service.repository.findKnowledgeVersionByBody(scenario.moduleId, bodyRef.artifactId);
    if (!version) throw new Error('WORKFLOW_CANDIDATE_VERSION_MISSING');
    const quality = this.service.qualityPolicy.evaluate(document.body, {
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
    const checkpoint = await this.service.executeNode({
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
    const code = await this.readJson<CodeOutput>(codeRef);
    for (const file of code.files) {
      if (!scenario.allowedGeneratedPaths.includes(file.path)) throw new Error(`PROJECT_PATH_DENIED: ${file.path}`);
    }
    const checkpoint = await this.service.executeNode({
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
    const run = this.service.repository.getRun(input.runId);
    if (run?.state === 'GENERATING') this.service.transition(input.runId, 'EVALUATING');
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
      const run = this.service.repository.getRun(input.runId);
      if (!run) throw new Error(`WORKFLOW_RUN_NOT_FOUND: ${input.runId}`);
      const exhausted = run.iteration >= input.maxIterations;
      if (exhausted && run.state === 'GENERATING') {
        this.service.transition(input.runId, 'LOW_CONFIDENCE');
      } else if (!exhausted && run.state === 'GENERATING') {
        this.service.transition(input.runId, 'ITERATING');
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
    const run = this.service.repository.getRun(input.runId);
    if (route === 'ITERATE' && run?.state === 'REVIEWING') {
      this.service.transition(input.runId, 'ITERATING');
    } else if (route === 'STOPPED' && run?.state === 'REVIEWING') {
      this.service.transition(input.runId, 'LOW_CONFIDENCE');
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
    const check = await this.readJson<CheckOutput>(checkRef);
    const review = reviewRef ? await this.readJson<ReviewOutput>(reviewRef) : null;
    const policy = input.context.gatePolicy as GatePolicy | undefined;
    const run = this.service.repository.getRun(input.runId);
    if (!policy || !run) throw new Error('WORKFLOW_GATE_POLICY_MISSING');
    assertInvariant(policy.policyId === run.policyId, 'workflow gate policy does not match run');
    assertInvariant(policy.maxIterations === input.maxIterations, 'workflow iteration policy changed after start');
    const evaluationRef = input.context[contextKey('evaluationEvidenceRef', input.iteration)] as ArtifactRef | undefined;
    if (!evaluationRef) throw new Error('WORKFLOW_EVALUATION_EVIDENCE_MISSING');
    const inputRefs = [scenarioRef, snapshot.manifestRef, bodyRef, codeRef, oracleRef, checkRef];
    if (reviewRef) inputRefs.push(reviewRef);
    const { decision } = await this.service.recordEvaluation({
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
    const publication = await this.service.publish(input.runId, versionId, decision.decisionId);
    return {
      detail: `Knowledge Flywheel publication ${publication.publicationKey}`,
      context: { publication },
      route: 'PASS',
    };
  }

  private async commitAgentOutput(
    input: WorkflowStageInput,
    output: Record<string, unknown>,
    schema: Record<string, unknown>,
  ): Promise<ArtifactRef> {
    this.validateAgentOutput(output, schema);
    const inputRefs = this.agentInputRefs(input, input.agentId as AgentId);
    const checkpoint = await this.service.executeNode({
      runId: input.runId,
      nodeId: input.workerId ? `${input.nodeId}:${input.workerId}` : input.nodeId,
      generationKey: this.agentGenerationKey(input, input.agentId as AgentId),
      inputRefs,
    }, async () => [await this.service.artifacts.put(
      Buffer.from(JSON.stringify(output, null, 2)), 'application/json',
    )]);
    const ref = checkpoint.outputRefs[0];
    if (!ref) throw new Error(`WORKFLOW_AGENT_OUTPUT_MISSING: ${input.nodeId}`);
    return ref;
  }

  private validateAgentOutput(output: Record<string, unknown>, schema: Record<string, unknown>): void {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    const validate = ajv.compile(schema);
    if (!validate(output)) throw new Error(`AGENT_OUTPUT_INVALID: ${ajv.errorsText(validate.errors)}`);
  }

  private agentGenerationKey(input: WorkflowStageInput, agentId: AgentId): string {
    if (agentId === 'test-gen') return `${input.runId}:test_gen:stable-source:contract-v4`;
    if (agentId === 'doc-worker') {
      return `${input.runId}:doc_worker:${input.workerId ?? 'main'}:stable-source:contract-v4`;
    }
    return `${input.runId}:${input.nodeId}:${input.iteration}:${input.workerId ?? 'main'}:contract-v4`;
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
    return JSON.parse(Buffer.from(await this.service.artifacts.get(ref)).toString('utf8')) as T;
  }

  private async readArtifact(ref: ArtifactRef): Promise<unknown> {
    const text = Buffer.from(await this.service.artifacts.get(ref)).toString('utf8');
    return ref.mediaType.includes('json') ? JSON.parse(text) as unknown : text;
  }
}

export class AutomatedProjectWorkflowService {
  readonly flywheel: KnowledgeFlywheelService;
  readonly workflow: WorkflowEngine;

  constructor(flywheel: KnowledgeFlywheelService, workflow: WorkflowEngine) {
    this.flywheel = flywheel;
    this.workflow = workflow;
  }

  async start(
    scenario: AutomatedProjectScenario,
    input: GatePolicy & { workerCount?: number },
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
    this.flywheel.transition(run.runId, 'PLANNED');
    return this.workflow.start({
      runId: run.runId,
      maxIterations: input.maxIterations,
      workerCount: input.workerCount ?? 1,
      context: {
        scenario,
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

  resume(runId: string): Promise<WorkflowHandle> {
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
    const run = this.flywheel.repository.getRun(runId);
    if (run && !['VERIFIED', 'LOW_CONFIDENCE', 'FAILED', 'CANCELLED'].includes(run.state)) {
      this.flywheel.transition(runId, next);
    }
  }
}
