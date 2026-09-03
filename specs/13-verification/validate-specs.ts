#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020Import from 'ajv/dist/2020.js';
import addFormatsImport from 'ajv-formats';
import { createArtifactRef, createEvent } from '../../src/domain/index.ts';
import { AGENT_IDS, type AgentId } from '../../src/application/ports/index.ts';
import { validateTraceabilityMatrix } from './traceability-validator.ts';

const specRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schemaRoot = join(specRoot, 'schemas');

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function markdownFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? markdownFiles(path) : path.endsWith('.md') ? [path] : [];
  });
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
    command('orchestrator', { policyRef: refA, moduleRefs: [refB] }),
    command('doc-gen', { moduleId: 'example', sourceRefs: [refA], publicInterfaceRefs: [refB] }),
    command('doc-worker', { moduleId: 'example', sourceRefs: [refA], publicInterfaceRefs: [refB] }),
    command('test-gen', { moduleId: 'example', sourceSnapshotRef: refA, publicInterfaceRefs: [refB], languageId: 'cpp', testPolicyRef: refA }),
    command('code', { knowledgeRef: refA, publicInterfaceRefs: [refB], languageId: 'cpp', buildContractRef: refA }),
    command('check', { diffRef: refA, criteriaRef: refB, publicInterfaceRefs: [refA] }),
    command('review', { knowledgeRef: refA, evaluationReportRef: refB, criteriaRef: refA }),
  ];
  invariant(AGENT_IDS.every((agentId) => commands.some((fixture) => fixture.agentType === agentId)), 'Agent command fixtures must cover AGENT_IDS');
  for (const fixture of commands) {
    validate('agent-command.schema.json', fixture);
    const invalid = clone(fixture);
    (invalid.payload as Record<string, unknown>).unexpected = true;
    expectInvalid('agent-command.schema.json', invalid, `${fixture.agentType} command extra field`);
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
    validate('agent-result.schema.json', fixture);
    const invalid = clone(fixture);
    (invalid.payload as Record<string, unknown>).unexpected = true;
    expectInvalid('agent-result.schema.json', invalid, `${fixture.agentType} result extra field`);
  }
  const mismatch = clone(results[0]);
  mismatch.agentType = 'code';
  expectInvalid('agent-result.schema.json', mismatch, 'result kind must match agent type');
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
  validate('evaluation-report.schema.json', report);
  const missing = clone(report) as Record<string, unknown>;
  delete missing.pluginFingerprint;
  expectInvalid('evaluation-report.schema.json', missing, 'evaluation provenance is required');
  const extra = clone(report);
  (extra.repetitions[0] as Record<string, unknown>).unexpected = true;
  expectInvalid('evaluation-report.schema.json', extra, 'repetition fields are closed');
}

function validateSupporting(): void {
  const ref = artifact('a');
  validate('artifact-ref.schema.json', ref);
  validate('correction.schema.json', {
    correctionId: 'COR-0001', knowledgePath: 'modules/example/behavior', criterion: 'AC-FLOW-002',
    evidenceRefs: [ref], risk: 'Incorrect behavior remains published',
  });
  const event = createEvent('run-1', 'RunCreated', {}, '2026-08-31T09:22:00Z');
  validate('event.schema.json', event);
  const invalid = clone(event) as unknown as Record<string, unknown>;
  delete invalid.causationId;
  expectInvalid('event.schema.json', invalid, 'event causation is required');
}

function validateMarkdown(): number {
  const blocker = /\b(?:TBD|TODO)\b|待定/i;
  const link = /\[[^\]]+\]\(([^)]+)\)/g;
  for (const path of markdownFiles(specRoot)) {
    const text = readFileSync(path, 'utf8');
    invariant(!blocker.test(text), `Blocking placeholder in ${path.slice(specRoot.length + 1)}`);
    for (const match of text.matchAll(link)) {
      const target = match[1].split('#', 1)[0];
      if (!target || target.includes('://') || target.startsWith('mailto:')) continue;
      let decodedTarget: string;
      try {
        decodedTarget = decodeURIComponent(target);
      } catch {
        throw new Error(`Invalid encoded link in ${path.slice(specRoot.length + 1)}: ${match[1]}`);
      }
      invariant(statSafe(resolve(dirname(path), decodedTarget)), `Broken link in ${path.slice(specRoot.length + 1)}: ${match[1]}`);
    }
  }
  const requirements: string[] = [];
  const pattern = /^\| ((?:KF-SYS|NFR)-\d+) \| P0 \|/gm;
  for (const name of ['system-requirements.md', 'non-functional-requirements.md']) {
    const text = readFileSync(join(specRoot, '01-requirements', name), 'utf8');
    requirements.push(...[...text.matchAll(pattern)].map((match) => match[1]));
  }
  const trace = readFileSync(join(specRoot, '13-verification', 'traceability-matrix.md'), 'utf8');
  validateTraceabilityMatrix(trace, resolve(specRoot, '..'));
  for (const requirement of requirements) {
    const count = trace.split('\n').filter((line) => line.startsWith(`| ${requirement} |`)).length;
    invariant(count === 1, `${requirement} must appear exactly once in traceability matrix; got ${count}`);
  }
  return requirements.length;
}

function statSafe(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

const [commands, results] = validateAgentContracts();
validateEvaluation();
validateSupporting();
const requirements = validateMarkdown();
process.stdout.write(`SPEC_VALIDATION_OK schemas=${Object.keys(schemas).length} commands=${commands} results=${results} p0=${requirements}\n`);
