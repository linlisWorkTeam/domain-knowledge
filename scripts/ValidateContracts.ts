#!/usr/bin/env node
/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：校验机器 Schema 与运行时工件、事件和角色信封的正反例。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020Import from 'ajv/dist/2020.js';
import addFormatsImport from 'ajv-formats';
import { createArtifactRef, createEvent } from '../src/domain/Domain.ts';
import { AGENT_IDS, type AgentId } from '../src/application/ports/ApplicationPorts.ts';

const componentRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const specRoot = join(componentRoot, 'docs', 'specs');
const schemaRoot = join(specRoot, 'schemas');

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

const schemas = Object.fromEntries(
  readdirSync(schemaRoot)
    .filter((name) => name.endsWith('.schema.json'))
    .sort()
    .map((name) => [name, JSON.parse(readFileSync(join(schemaRoot, name), 'utf8'))]),
) as Record<string, Record<string, unknown>>;

const ids = Object.values(schemas).map((schema) => String(schema.$id));
invariant(ids.length === new Set(ids).size, 'Schema $id values must be unique');

const Ajv2020 = Ajv2020Import as unknown as new (options: Record<string, unknown>) => any;
const addFormats = addFormatsImport as unknown as (instance: any) => void;
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
for (const schema of Object.values(schemas)) ajv.addSchema(schema);

function validate(name: string, instance: unknown): void {
  const id = String(schemas[name].$id);
  const validator = ajv.getSchema(id);
  invariant(validator, `schema not registered: ${name}`);
  invariant(validator(instance), `${name} rejected fixture: ${ajv.errorsText(validator.errors)}`);
}

function expectInvalid(name: string, instance: unknown, label: string): void {
  const validator = ajv.getSchema(String(schemas[name].$id));
  invariant(validator, `schema not registered: ${name}`);
  invariant(!validator(instance), `Invalid fixture unexpectedly passed: ${label}`);
}

function artifact(seed = 'a') {
  return createArtifactRef(Buffer.from(seed.repeat(8), 'utf8'), 'application/json');
}

function command(agentType: AgentId, payload: Record<string, unknown>) {
  return {
    schemaVersion: '1.0', commandId: `cmd-${agentType}`, runId: 'run-1', agentType,
    generationKey: `generation-${agentType}-0001`, payload,
  };
}

function result(agentType: AgentId, payload: Record<string, unknown>, outputRefs: unknown[] = []) {
  return {
    schemaVersion: '1.0', commandId: `cmd-${agentType}`, commandRef: artifact('c'), runId: 'run-1', agentType,
    status: 'SUCCEEDED', outputRefs, payload,
  };
}

function validateAgentContracts(): [number, number] {
  const refA = artifact('a');
  const refB = artifact('b');
  const correction = {
    correctionId: 'COR-0001', knowledgePath: 'modules/example/behavior', criterion: 'AC-FLOW-002',
    evidenceRefs: [refA], risk: 'Incorrect behavior remains published',
  };
  const commands = [
    command('orchestrator', { policyRef: refA, moduleRefs: [refB], businessGoalRef: refA, projectConfigurationRef: refB, progressRef: refA }),
    command('doc-gen', { moduleId: 'example', sourceRefs: [refA], publicInterfaceRefs: [refB] }),
    command('doc-worker', { moduleId: 'example', sourceRefs: [refA], publicInterfaceRefs: [refB] }),
    command('test-gen', { moduleId: 'example', sourceSnapshotRef: refA, publicInterfaceRefs: [refB], languageId: 'cpp', testPolicyRef: refA, allowedTestPaths: ['tests/generated.cpp'] }),
    command('code', { knowledgeRef: refA, languageId: 'cpp', projectConfigurationRef: refB, allowedGeneratedPaths: ['src/out.cpp'] }),
    command('check', { sourceSnapshotRef: refA, generatedCodeRef: refB, comparisonRulesRef: refA }),
    command('review', { knowledgeRef: refA, evaluationReportRef: refB, comparisonReportRef: refA }),
  ];
  invariant(AGENT_IDS.every((agentId) => commands.some((fixture) => fixture.agentType === agentId)), 'Agent command fixtures must cover AGENT_IDS');
  for (const fixture of commands) {
    validate('AgentCommand.schema.json', fixture);
    const invalid = clone(fixture);
    (invalid.payload as Record<string, unknown>).unexpected = true;
    expectInvalid('AgentCommand.schema.json', invalid, `${fixture.agentType} command extra field`);
  }
  const node = {
    nodeId: 'node-docgen-1', agentType: 'doc-gen', dependsOn: [], generationKey: 'generation-node-0001',
    inputSchema: 'https://wpknowledge.local/schemas/agent-command/v1',
    outputSchema: 'https://wpknowledge.local/schemas/agent-result/v1', resourceClaims: ['knowledge:example'],
    artifactExpectations: ['knowledgeCandidate'],
  };
  const results = [
    result('orchestrator', { resultKind: 'plan', nodes: [node] }),
    result('doc-gen', { resultKind: 'knowledgeCandidate', bodyRef: refA, provenance: [refB], changedPaths: ['modules/example'] }, [refA]),
    result('doc-worker', { resultKind: 'knowledgeChunk', chunkRef: refA, provenance: [refB] }, [refA]),
    result('test-gen', { resultKind: 'testCandidates', candidateSetRef: refA, caseManifestRef: refB, oracleClaims: ['claim-1'] }, [refA, refB]),
    result('code', { resultKind: 'codeArtifact', codeRef: refA }, [refA]),
    result('check', { resultKind: 'findings', findings: [] }),
    result('review', { resultKind: 'attribution', corrections: [correction], unresolvedRisks: [] }, [refA]),
  ];
  const failed = result('doc-gen', { resultKind: 'error', errorCode: 'AGENT_OUTPUT_INVALID', message: 'invalid output', retryable: true });
  failed.status = 'FAILED';
  results.push(failed);
  for (const fixture of results) {
    validate('AgentResult.schema.json', fixture);
    const invalid = clone(fixture);
    (invalid.payload as Record<string, unknown>).unexpected = true;
    expectInvalid('AgentResult.schema.json', invalid, `${fixture.agentType} result extra field`);
  }
  const mismatch = clone(results[0]);
  mismatch.agentType = 'code';
  expectInvalid('AgentResult.schema.json', mismatch, 'result kind must match agent type');
  return [commands.length, results.length];
}

function validateEvaluation(): void {
  const refA = artifact('a');
  const refB = artifact('b');
  const report = {
    schemaVersion: '1.0', reportId: 'report-1', runId: 'run-1', iteration: 1,
    inputRefs: [refA], policyVersion: 'gate-policy-1', toolchainFingerprint: 'clang-18-linux-amd64',
    pluginFingerprint: 'cpp-plugin-1', testSetVersion: 'core-gate-1',
    modelConfigSummary: { provider: 'internal', model: 'example', parametersDigest: 'c'.repeat(64) },
    promptDigest: 'd'.repeat(64), compile: 'PASS',
    criticalResults: [{ caseId: 'critical-1', status: 'PASS', evidenceRefs: [refB] }],
    repetitions: Array.from({ length: 5 }, (_, index) => ({
      caseId: 'critical-1', attempt: index + 1, status: 'PASS', durationMs: 10, evidenceRefs: [refB],
    })),
    testSummary: { total: 5, passed: 5, failed: 0, errors: 0 }, stability: 'STABLE', findings: [],
    scoreComponents: { coreGatePassRate: 1, mutation: 'not_available' }, reasonCodes: [],
  };
  validate('EvaluationReport.schema.json', report);
  const missing = clone(report) as Record<string, unknown>;
  delete missing.pluginFingerprint;
  expectInvalid('EvaluationReport.schema.json', missing, 'evaluation provenance is required');
  const extra = clone(report);
  (extra.repetitions[0] as Record<string, unknown>).unexpected = true;
  expectInvalid('EvaluationReport.schema.json', extra, 'repetition fields are closed');
}

function validateSupporting(): void {
  const ref = artifact('a');
  validate('ArtifactRef.schema.json', ref);
  validate('Correction.schema.json', {
    correctionId: 'COR-0001', knowledgePath: 'modules/example/behavior', criterion: 'AC-FLOW-002',
    evidenceRefs: [ref], risk: 'Incorrect behavior remains published',
  });
  const event = createEvent('run-1', 'RunCreated', {}, '2026-08-31T09:22:00Z');
  validate('Event.schema.json', event);
  const invalid = clone(event) as unknown as Record<string, unknown>;
  delete invalid.causationId;
  expectInvalid('Event.schema.json', invalid, 'event causation is required');
  validate('ActionItem.schema.json', {
    actionItemId: `ai_${'a'.repeat(24)}`,
    type: 'SOURCE_DRIFT',
    severity: 'MEDIUM',
    status: 'OPEN',
    subject: { kind: 'SOURCE', id: `src_${'b'.repeat(24)}` },
    runId: null,
    reasonCode: 'SOURCE_REVISION_DRIFT',
    summary: '来源内容与固定版本不一致，需要人工复核',
    sourceEventId: `audit_${'c'.repeat(24)}`,
    fingerprint: `sha256:${'d'.repeat(64)}`,
    allowedActions: ['ACKNOWLEDGE', 'RESOLVE'],
    revision: 1,
    createdAt: '2026-09-04T00:00:00Z',
    updatedAt: '2026-09-04T00:00:00Z',
    resolvedAt: null,
    resolution: null,
    previousOccurrenceId: null,
  });
}

function validateContentGovernance(): void {
  const ref = artifact('g');
  const version = {
    versionId: 'kv-content-1', moduleId: 'content', parentVersionId: null,
    status: 'VERIFIED', qualityOutcome: 'ACCEPTED', qualityScore: 91,
    gateDecisionId: 'decision-1', bodyRef: ref, createdAt: '2026-09-04T00:00:00Z',
    href: '/api/v1/knowledge/kv-content-1',
  };
  validate('KnowledgeLineage.schema.json', {
    target: version,
    nodes: [version],
    edges: [],
    relations: { runs: [], evaluations: [], corrections: [], publications: [], provenance: [] },
    sampledAt: '2026-09-04T00:00:00Z',
  });
  validate('KnowledgeDiff.schema.json', {
    against: version,
    target: { ...version, versionId: 'kv-content-2', parentVersionId: 'kv-content-1' },
    hunks: [{
      oldStart: 1, oldCount: 1, newStart: 1, newCount: 1,
      lines: [
        { type: 'REMOVE', oldLine: 1, newLine: null, text: '# Before' },
        { type: 'ADD', oldLine: null, newLine: 1, text: '# After' },
      ],
    }],
    changedSections: ['# After'],
    rangeValidation: {
      status: 'PASS', scope: 'FULL_DOCUMENT', oldLines: 1, newLines: 1,
      algorithm: 'LCS', validated: true,
    },
    sampledAt: '2026-09-04T00:00:00Z',
  });
  validate('EvaluationSummary.schema.json', {
    evaluationId: 'evaluation-1', runId: 'run-1', moduleId: 'content', versionId: 'kv-content-1',
    status: 'PASSED', gate: 'PASS', reasonCodes: ['ALL_DETERMINISTIC_GATES_PASSED'],
    tests: { passed: 2, total: 2, criticalFailures: 0 }, stability: 1,
    toolchainFingerprint: 'node-22', ruleRef: { ruleId: 'publication-gate', revision: 1 },
    ruleBinding: { status: 'BOUND', reasonCode: 'RULE_REVISION_BOUND' },
    createdAt: '2026-09-04T00:00:00Z', links: {},
  });
  const legacyEvaluation = {
    evaluationId: 'legacy-evaluation-1', runId: 'legacy-run-1', moduleId: 'content', versionId: 'kv-content-1',
    status: 'FAILED', gate: 'ITERATE', reasonCodes: ['QUALITY_THRESHOLD_NOT_MET'],
    tests: { passed: 1, total: 2, criticalFailures: 0 }, stability: 0.5,
    toolchainFingerprint: 'legacy-toolchain', ruleRef: null,
    ruleBinding: { status: 'UNBOUND', reasonCode: 'RULE_REVISION_NOT_PROVABLE' },
    createdAt: '2026-08-01T00:00:00Z', links: {},
  };
  validate('EvaluationSummary.schema.json', legacyEvaluation);
  expectInvalid('EvaluationSummary.schema.json', {
    ...legacyEvaluation,
    ruleBinding: { status: 'BOUND', reasonCode: 'RULE_REVISION_BOUND' },
  }, 'bound evaluation must identify its immutable rule revision');
  validate('EvaluationRule.schema.json', {
    ruleId: 'publication-gate', revision: 1, scope: { kind: 'GLOBAL' },
    config: { policyId: 'local-v1', minimumStability: 1, requireAllTests: true, maxIterations: 3 },
    enabled: true, createdAt: '2026-09-04T00:00:00Z', createdBy: 'system',
    changeReason: 'Initial deterministic publication gate', auditId: 'audit-1',
  });
  validate('Source.schema.json', {
    sourceId: `src_${'a'.repeat(24)}`, kind: 'FILE', project: 'default', displayName: 'Source',
    locator: 'knowledge/inbox/source.md', revision: `sha256:${'b'.repeat(64)}`,
    observedRevision: `sha256:${'b'.repeat(64)}`, status: 'ACTIVE', credentialConfigured: false,
    accessPolicyRef: 'configured-acquisition-roots', recordRevision: 1,
    lastSyncAt: '2026-09-04T00:00:00Z', lastErrorCode: null, drift: null,
    knowledge: { total: 1, verified: 1, candidate: 0, lowConfidence: 0, superseded: 0 },
    createdAt: '2026-09-04T00:00:00Z', updatedAt: '2026-09-04T00:00:00Z',
  });
  const metric = {
    status: 'available', value: 1, numerator: 1, denominator: 1, unit: 'ratio',
    window: '30d', sampledAt: '2026-09-04T00:00:00Z', ruleVersion: 'knowledge-health-v1',
  };
  validate('KnowledgeHealth.schema.json', {
    window: { key: '30d', start: '2026-08-05T00:00:00Z', end: '2026-09-04T00:00:00Z' },
    sampledAt: '2026-09-04T00:00:00Z', ruleVersion: 'knowledge-health-v1',
    overall: { status: 'available', value: 100, unit: 'score-out-of-100' },
    metrics: { freshness: metric, coverage: metric, quality: metric },
  });
  const invalidHealth = {
    window: { key: '30d', start: '2026-08-05T00:00:00Z', end: '2026-09-04T00:00:00Z' },
    sampledAt: '2026-09-04T00:00:00Z', ruleVersion: 'knowledge-health-v1',
    overall: { status: 'unavailable', value: 0, unit: 'score-out-of-100' },
    metrics: { freshness: { ...metric, status: 'unavailable', denominator: null }, coverage: metric, quality: metric },
  };
  expectInvalid('KnowledgeHealth.schema.json', invalidHealth, 'unavailable health must not look like zero or one');
}

const [commands, results] = validateAgentContracts();
validateEvaluation();
validateSupporting();
validateContentGovernance();
process.stdout.write(`CONTRACT_VALIDATION_OK schemas=${Object.keys(schemas).length} commands=${commands} results=${results}\n`);
