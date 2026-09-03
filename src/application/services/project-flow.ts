import { sha256 } from '../../domain/index.ts';
import type {
  ArtifactRef, GateDecision, KnowledgeVersion,
} from '../../domain/index.ts';
import type {
  AgentProvider, ArtifactStore, GeneratedProjectFile, ProjectCommand,
  ProjectEvaluation, ProjectEvaluator, ProjectSnapshot,
} from '../ports/index.ts';
import type { KnowledgeFlywheelService } from './index.ts';
import { KNOWLEDGE_WRITING_GUIDE } from './knowledge-writing-guide.ts';

const DOCUMENT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: ['body', 'title', 'description'],
  properties: {
    body: { type: 'string', minLength: 200 },
    title: { type: 'string', minLength: 1 },
    description: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
};

const CODE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: ['files'],
  properties: {
    files: {
      type: 'array', minItems: 1,
      items: {
        type: 'object', required: ['path', 'content'],
        properties: {
          path: { type: 'string', minLength: 1 },
          content: { type: 'string', minLength: 1 },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
};

const REVIEW_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: ['correction'],
  properties: {
    correction: {
      type: 'object',
      required: ['correctionId', 'knowledgePath', 'criterion', 'risk'],
      properties: {
        correctionId: { type: 'string', minLength: 1 },
        knowledgePath: { type: 'string', minLength: 1 },
        criterion: { type: 'string', minLength: 1 },
        risk: { type: 'string', minLength: 1 },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
};

interface DocumentOutput {
  body: string;
  title: string;
  description: string;
}

interface CodeOutput {
  files: GeneratedProjectFile[];
}

interface ReviewOutput {
  correction: {
    correctionId: string;
    knowledgePath: string;
    criterion: string;
    risk: string;
  };
}

export interface RealSourceScenario {
  schemaVersion: '1.0';
  name: string;
  moduleId: string;
  repositoryRoot: string;
  expectedCommit?: string;
  sourcePaths: string[];
  publicInterfacePaths: string[];
  allowedGeneratedPaths: string[];
  prepareCommands: ProjectCommand[];
  referenceCommands: ProjectCommand[];
  firstIterationCommands: ProjectCommand[];
  finalCommands: ProjectCommand[];
}

export interface RealSourceFlowReport {
  schemaVersion: '1.0';
  scenario: string;
  agentProvider: 'schema-validated-scenario';
  trustBoundary: 'trusted-source-process-evaluation';
  runId: string;
  scenarioRef: ArtifactRef;
  snapshot: Omit<ProjectSnapshot, 'manifestRef'> & { manifestRef: ArtifactRef };
  firstVersion: KnowledgeVersion;
  finalVersion: KnowledgeVersion;
  correction: ReviewOutput['correction'];
  referenceEvaluation: ProjectEvaluation;
  firstEvaluation: ProjectEvaluation;
  finalEvaluation: ProjectEvaluation;
  firstDecision: GateDecision;
  finalDecision: GateDecision;
  publication: { publicationKey: string; versionId: string; publishedAt: string; replayed: boolean };
  eventTypes: string[];
  reportRef: ArtifactRef;
}

function generationKey(runId: string, nodeId: string, iteration: number, inputRefs: ArtifactRef[]): string {
  return `${runId}:${nodeId}:${iteration}:${sha256(inputRefs.map((ref) => ref.artifactId).join('\0')).slice(0, 16)}`;
}

async function readJson<T>(artifacts: ArtifactStore, ref: ArtifactRef): Promise<T> {
  return JSON.parse(Buffer.from(await artifacts.get(ref)).toString('utf8')) as T;
}

async function runAgentNode<T extends Record<string, unknown>>(input: {
  service: KnowledgeFlywheelService;
  artifacts: ArtifactStore;
  agent: AgentProvider;
  runId: string;
  nodeId: string;
  iteration: number;
  role: string;
  inputRefs: ArtifactRef[];
  prompt: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}): Promise<{ output: T; artifactRef: ArtifactRef }> {
  const checkpoint = await input.service.executeNode({
    runId: input.runId,
    nodeId: input.nodeId,
    generationKey: generationKey(input.runId, input.nodeId, input.iteration, input.inputRefs),
    inputRefs: input.inputRefs,
  }, async () => {
    const output = await input.agent.run({
      role: input.role,
      prompt: JSON.stringify(input.prompt),
      outputSchema: input.outputSchema,
      idempotencyKey: generationKey(input.runId, input.nodeId, input.iteration, input.inputRefs),
      inputRefs: input.inputRefs,
    });
    return [await input.artifacts.put(Buffer.from(JSON.stringify(output)), 'application/json')];
  });
  const artifactRef = checkpoint.outputRefs[0];
  if (!artifactRef) throw new Error(`PROJECT_FLOW_OUTPUT_MISSING: ${input.nodeId}`);
  return { output: await readJson<T>(input.artifacts, artifactRef), artifactRef };
}

async function runEvaluationNode(input: {
  service: KnowledgeFlywheelService;
  artifacts: ArtifactStore;
  evaluator: ProjectEvaluator;
  runId: string;
  nodeId: string;
  iteration: number;
  snapshot: ProjectSnapshot;
  generatedFiles: GeneratedProjectFile[];
  prepareCommands: ProjectCommand[];
  commands: ProjectCommand[];
  inputRefs: ArtifactRef[];
}): Promise<ProjectEvaluation> {
  const checkpoint = await input.service.executeNode({
    runId: input.runId,
    nodeId: input.nodeId,
    generationKey: generationKey(input.runId, input.nodeId, input.iteration, input.inputRefs),
    inputRefs: input.inputRefs,
  }, async () => {
    const evaluation = await input.evaluator.evaluate({
      label: input.nodeId,
      snapshot: input.snapshot,
      generatedFiles: input.generatedFiles,
      prepareCommands: input.prepareCommands,
      commands: input.commands,
    });
    return [evaluation.evidenceRef];
  });
  const evidenceRef = checkpoint.outputRefs[0];
  if (!evidenceRef) throw new Error(`PROJECT_FLOW_EVIDENCE_MISSING: ${input.nodeId}`);
  const evidence = await readJson<Omit<ProjectEvaluation, 'evidenceRef'>>(input.artifacts, evidenceRef);
  return { ...evidence, evidenceRef };
}

function assertGeneratedPaths(files: GeneratedProjectFile[], allowed: string[]): void {
  const allowedSet = new Set(allowed.map((path) => path.replaceAll('\\', '/')));
  for (const file of files) {
    if (!allowedSet.has(file.path.replaceAll('\\', '/'))) {
      throw new Error(`CODE_AGENT_PATH_DENIED: ${file.path}`);
    }
  }
}

function markdownSection(body: string, name: string): { before: string; section: string; after: string } {
  const headings = [...body.matchAll(/^##\s+(.+?)\s*$/gm)];
  const matching = headings.filter((match) => match[1] === name);
  if (matching.length !== 1) throw new Error(`KNOWLEDGE_SECTION_AMBIGUOUS: ${name}`);
  const index = headings.indexOf(matching[0]!);
  const start = headings[index]?.index;
  const end = headings[index + 1]?.index ?? body.length;
  if (start === undefined || end === undefined) throw new Error(`KNOWLEDGE_SECTION_MISSING: ${name}`);
  return { before: body.slice(0, start), section: body.slice(start, end), after: body.slice(end) };
}

function assertIncrementalRevision(base: string, revised: string, knowledgePath: string): void {
  const before = markdownSection(base, knowledgePath);
  const after = markdownSection(revised, knowledgePath);
  if (before.before !== after.before || before.after !== after.after) {
    throw new Error(`KNOWLEDGE_REVISION_OUTSIDE_CORRECTION: ${knowledgePath}`);
  }
  if (before.section === after.section) throw new Error(`KNOWLEDGE_CORRECTION_NOT_APPLIED: ${knowledgePath}`);
}

/**
 * Deterministic two-iteration acceptance baseline. Production runs use
 * AutomatedProjectWorkflowService; this explicit path stays small so tests can
 * prove the failure/correction/publication contract without graph scheduling.
 */
export async function runRealSourceFlow(input: {
  scenario: RealSourceScenario;
  service: KnowledgeFlywheelService;
  artifacts: ArtifactStore;
  agent: AgentProvider;
  evaluator: ProjectEvaluator;
  policy: {
    policyId: string;
    minimumStability: number;
    requireAllTests: boolean;
    maxIterations: number;
  };
}): Promise<RealSourceFlowReport> {
  if (input.scenario.schemaVersion !== '1.0') throw new Error('PROJECT_SCENARIO_VERSION_UNSUPPORTED');
  const snapshot = await input.evaluator.inspect({
    repositoryRoot: input.scenario.repositoryRoot,
    expectedCommit: input.scenario.expectedCommit,
    sourcePaths: input.scenario.sourcePaths,
    publicInterfacePaths: input.scenario.publicInterfacePaths,
  });
  const scenarioRef = await input.artifacts.put(Buffer.from(JSON.stringify({
    ...input.scenario, repositoryRoot: snapshot.repositoryRoot, expectedCommit: snapshot.commit,
  }, null, 2)), 'application/json');
  let run = input.service.createRun(input.scenario.moduleId, input.policy.policyId);
  run = input.service.transition(run.runId, 'PLANNED');

  const referenceEvaluation = await runEvaluationNode({
    service: input.service, artifacts: input.artifacts, evaluator: input.evaluator,
    runId: run.runId, nodeId: 'reference-oracle', iteration: 0, snapshot,
    generatedFiles: [], prepareCommands: input.scenario.prepareCommands,
    commands: input.scenario.referenceCommands, inputRefs: [scenarioRef, snapshot.manifestRef],
  });
  if (!referenceEvaluation.passed) {
    throw new Error(`REFERENCE_GATE_FAILED: evidence=${referenceEvaluation.evidenceRef.artifactId}`);
  }

  run = input.service.transition(run.runId, 'GENERATING');
  const firstDocument = await runAgentNode<DocumentOutput & Record<string, unknown>>({
    service: input.service, artifacts: input.artifacts, agent: input.agent,
    runId: run.runId, nodeId: 'docgen', iteration: 0, role: 'docgen',
    inputRefs: [scenarioRef, snapshot.manifestRef],
    prompt: {
      moduleId: input.scenario.moduleId,
      sourceSnapshotRef: snapshot.manifestRef,
      writingGuide: KNOWLEDGE_WRITING_GUIDE,
    },
    outputSchema: DOCUMENT_SCHEMA,
  });
  const firstCandidate = await input.service.ingestCandidate({
    moduleId: input.scenario.moduleId,
    body: firstDocument.output.body,
    title: firstDocument.output.title,
    description: firstDocument.output.description,
    category: 'real-source-acceptance', tags: ['ohmyworkpanel', 'e2e'],
    provenance: input.scenario.sourcePaths.map((path) => ({ path, commit: snapshot.commit, pinned: true })),
    metadata: { scenario: input.scenario.name, iteration: 0 },
  });
  if (firstCandidate.quality.outcome !== 'ACCEPTED') throw new Error('FIRST_KNOWLEDGE_QUALITY_REJECTED');

  const firstCode = await runAgentNode<CodeOutput & Record<string, unknown>>({
    service: input.service, artifacts: input.artifacts, agent: input.agent,
    runId: run.runId, nodeId: 'codegen', iteration: 0, role: 'codegen',
    inputRefs: [scenarioRef, firstCandidate.version.bodyRef, snapshot.manifestRef],
    prompt: {
      knowledgeRef: firstCandidate.version.bodyRef,
      publicInterfaceManifestRef: snapshot.manifestRef,
      forbidden: ['reference source', 'gate tests', 'previous implementation'],
    },
    outputSchema: CODE_SCHEMA,
  });
  assertGeneratedPaths(firstCode.output.files, input.scenario.allowedGeneratedPaths);
  run = input.service.transition(run.runId, 'EVALUATING');
  const firstEvaluation = await runEvaluationNode({
    service: input.service, artifacts: input.artifacts, evaluator: input.evaluator,
    runId: run.runId, nodeId: 'eval', iteration: 0, snapshot,
    generatedFiles: firstCode.output.files, prepareCommands: input.scenario.prepareCommands,
    commands: input.scenario.firstIterationCommands,
    inputRefs: [scenarioRef, snapshot.manifestRef, firstCandidate.version.bodyRef, firstCode.artifactRef],
  });
  const { decision: firstDecision } = await input.service.recordEvaluation({
    runId: run.runId, versionId: firstCandidate.version.versionId,
    inputRefs: [scenarioRef, snapshot.manifestRef, firstCandidate.version.bodyRef, firstCode.artifactRef],
    evidenceRefs: [firstEvaluation.evidenceRef],
    toolchainFingerprint: firstEvaluation.toolchainFingerprint,
    criticalFailures: firstEvaluation.passed ? 0 : 1,
    testsPassed: firstEvaluation.testsPassed, testsTotal: firstEvaluation.testsTotal,
    stability: firstEvaluation.stability, infrastructureFailure: firstEvaluation.infrastructureFailure,
  }, input.policy);
  if (firstDecision.outcome !== 'ITERATE') {
    throw new Error(`FIRST_ITERATION_MUST_FAIL: ${firstDecision.outcome}`);
  }

  const review = await runAgentNode<ReviewOutput & Record<string, unknown>>({
    service: input.service, artifacts: input.artifacts, agent: input.agent,
    runId: run.runId, nodeId: 'review', iteration: 0, role: 'review',
    inputRefs: [scenarioRef, firstCandidate.version.bodyRef, firstEvaluation.evidenceRef],
    prompt: {
      knowledgeRef: firstCandidate.version.bodyRef,
      evaluationRef: firstEvaluation.evidenceRef,
      criterion: 'AC-E2E-001',
    },
    outputSchema: REVIEW_SCHEMA,
  });
  const correctionRef = await input.artifacts.put(Buffer.from(JSON.stringify(review.output.correction)), 'application/json');
  run = input.service.transition(run.runId, 'ITERATING');
  run = input.service.transition(run.runId, 'GENERATING');

  const finalDocument = await runAgentNode<DocumentOutput & Record<string, unknown>>({
    service: input.service, artifacts: input.artifacts, agent: input.agent,
    runId: run.runId, nodeId: 'docgen', iteration: 1, role: 'docgen',
    inputRefs: [scenarioRef, firstCandidate.version.bodyRef, correctionRef],
    prompt: {
      baseKnowledgeRef: firstCandidate.version.bodyRef,
      correctionRef,
      constraint: 'Only revise the affected knowledge path.',
      writingGuide: KNOWLEDGE_WRITING_GUIDE,
    },
    outputSchema: DOCUMENT_SCHEMA,
  });
  assertIncrementalRevision(
    firstDocument.output.body, finalDocument.output.body, review.output.correction.knowledgePath,
  );
  const finalCandidate = await input.service.ingestCandidate({
    moduleId: input.scenario.moduleId,
    body: finalDocument.output.body,
    title: finalDocument.output.title,
    description: finalDocument.output.description,
    category: 'real-source-acceptance', tags: ['ohmyworkpanel', 'e2e'],
    provenance: input.scenario.sourcePaths.map((path) => ({ path, commit: snapshot.commit, pinned: true })),
    metadata: {
      scenario: input.scenario.name,
      iteration: 1,
      correctionId: review.output.correction.correctionId,
      correctionEvidenceRefs: [correctionRef],
    },
  });
  if (finalCandidate.quality.outcome !== 'ACCEPTED') throw new Error('FINAL_KNOWLEDGE_QUALITY_REJECTED');
  if (finalCandidate.version.parentVersionId !== firstCandidate.version.versionId) {
    throw new Error('KNOWLEDGE_REVISION_LINEAGE_BROKEN');
  }

  const finalCode = await runAgentNode<CodeOutput & Record<string, unknown>>({
    service: input.service, artifacts: input.artifacts, agent: input.agent,
    runId: run.runId, nodeId: 'codegen', iteration: 1, role: 'codegen',
    inputRefs: [scenarioRef, finalCandidate.version.bodyRef, snapshot.manifestRef],
    prompt: {
      knowledgeRef: finalCandidate.version.bodyRef,
      publicInterfaceManifestRef: snapshot.manifestRef,
      forbidden: ['reference source', 'gate tests', 'first iteration implementation'],
    },
    outputSchema: CODE_SCHEMA,
  });
  assertGeneratedPaths(finalCode.output.files, input.scenario.allowedGeneratedPaths);
  run = input.service.transition(run.runId, 'EVALUATING');
  const finalEvaluation = await runEvaluationNode({
    service: input.service, artifacts: input.artifacts, evaluator: input.evaluator,
    runId: run.runId, nodeId: 'eval', iteration: 1, snapshot,
    generatedFiles: finalCode.output.files, prepareCommands: input.scenario.prepareCommands,
    commands: input.scenario.finalCommands,
    inputRefs: [scenarioRef, snapshot.manifestRef, finalCandidate.version.bodyRef, finalCode.artifactRef],
  });
  const { decision: finalDecision } = await input.service.recordEvaluation({
    runId: run.runId, versionId: finalCandidate.version.versionId,
    inputRefs: [scenarioRef, snapshot.manifestRef, finalCandidate.version.bodyRef, finalCode.artifactRef],
    evidenceRefs: [finalEvaluation.evidenceRef],
    toolchainFingerprint: finalEvaluation.toolchainFingerprint,
    criticalFailures: finalEvaluation.passed ? 0 : 1,
    testsPassed: finalEvaluation.testsPassed, testsTotal: finalEvaluation.testsTotal,
    stability: finalEvaluation.stability, infrastructureFailure: finalEvaluation.infrastructureFailure,
  }, input.policy);
  if (finalDecision.outcome !== 'PASS') throw new Error(`FINAL_GATE_NOT_PASS: ${finalDecision.outcome}`);
  const publication = await input.service.publish(
    run.runId, finalCandidate.version.versionId, finalDecision.decisionId,
  );
  const replay = await input.service.publish(
    run.runId, finalCandidate.version.versionId, finalDecision.decisionId,
  );
  if (!replay.replayed || replay.publicationKey !== publication.publicationKey) {
    throw new Error('PUBLICATION_REPLAY_NOT_IDEMPOTENT');
  }
  const verifiedVersion = input.service.getKnowledgeVersion(finalCandidate.version.versionId);
  if (!verifiedVersion || verifiedVersion.status !== 'VERIFIED' || verifiedVersion.gateDecisionId !== finalDecision.decisionId) {
    throw new Error('PUBLISHED_VERSION_STATE_INVALID');
  }

  const after = await input.evaluator.inspect({
    repositoryRoot: input.scenario.repositoryRoot,
    expectedCommit: snapshot.commit,
    sourcePaths: input.scenario.sourcePaths,
    publicInterfacePaths: input.scenario.publicInterfacePaths,
  });
  if (after.checkoutHead !== snapshot.checkoutHead || after.dirty !== snapshot.dirty) {
    throw new Error('REFERENCE_WORKSPACE_CHANGED_DURING_EVALUATION');
  }
  const eventTypes = input.service.repository.listEvents(run.runId).map((event) => event.eventType);
  const reportWithoutRef = {
    schemaVersion: '1.0' as const,
    scenario: input.scenario.name,
    agentProvider: 'schema-validated-scenario' as const,
    trustBoundary: 'trusted-source-process-evaluation' as const,
    runId: run.runId, scenarioRef,
    snapshot,
    firstVersion: firstCandidate.version, finalVersion: verifiedVersion,
    correction: review.output.correction,
    referenceEvaluation, firstEvaluation, finalEvaluation,
    firstDecision, finalDecision, publication, eventTypes,
  };
  const reportRef = await input.artifacts.put(
    Buffer.from(JSON.stringify(reportWithoutRef, null, 2)), 'application/json',
  );
  return { ...reportWithoutRef, reportRef };
}
