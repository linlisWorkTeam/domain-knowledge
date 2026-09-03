import assert from 'node:assert/strict';
import test from 'node:test';
import {
  artifactIdFor, createArtifactRef, createRun, decideGate, GATE_OUTCOMES, transitionRun,
} from '../../src/domain/index.ts';

test('artifact ID is bound to content digest', () => {
  const ref = createArtifactRef(Buffer.from('hello'), 'text/plain');
  assert.equal(ref.artifactId, artifactIdFor(ref.sha256));
  assert.equal(ref.size, 5);
});

test('run transitions are monotonic and reject illegal jumps', () => {
  const created = createRun('module-a', 'policy-a', '2026-08-31T00:00:00.000Z');
  const planned = transitionRun(created, 'PLANNED', '2026-08-31T00:00:01.000Z');
  const generating = transitionRun(planned, 'GENERATING', '2026-08-31T00:00:02.000Z');
  const evaluating = transitionRun(generating, 'EVALUATING', '2026-08-31T00:00:03.000Z');
  const reviewing = transitionRun(evaluating, 'REVIEWING', '2026-08-31T00:00:04.000Z');
  const publishing = transitionRun(reviewing, 'PUBLISHING', '2026-08-31T00:00:05.000Z');
  assert.equal(evaluating.iteration, 0);
  assert.equal(publishing.state, 'PUBLISHING');
  assert.throws(() => transitionRun(evaluating, 'VERIFIED', '2026-08-31T00:00:06.000Z'), /illegal run transition/);
  assert.throws(() => transitionRun(evaluating, 'PUBLISHING', '2026-08-31T00:00:06.000Z'), /illegal run transition/);
});

test('a generation-quality rejection may iterate before behavioral evaluation', () => {
  const created = createRun('mentions', 'local-v1', '2026-08-31T00:00:00.000Z');
  const planned = transitionRun(created, 'PLANNED', '2026-08-31T00:00:01.000Z');
  const generating = transitionRun(planned, 'GENERATING', '2026-08-31T00:00:02.000Z');
  const iterating = transitionRun(generating, 'ITERATING', '2026-08-31T00:00:03.000Z');

  assert.equal(iterating.iteration, 1);
  assert.equal(iterating.state, 'ITERATING');
});

test('gate outcomes expose only implemented deterministic routes', () => {
  assert.deepEqual(GATE_OUTCOMES, ['PASS', 'ITERATE', 'STOPPED']);
});

test('deterministic gate passes only complete and stable evidence', () => {
  let run = createRun('module-a', 'policy-a', '2026-08-31T00:00:00.000Z');
  run = transitionRun(run, 'PLANNED', '2026-08-31T00:00:01.000Z');
  run = transitionRun(run, 'GENERATING', '2026-08-31T00:00:02.000Z');
  run = transitionRun(run, 'EVALUATING', '2026-08-31T00:00:03.000Z');
  const decision = decideGate(run, {
    reportId: 'report', runId: run.runId, versionId: 'version', inputRefs: [], evidenceRefs: [],
    toolchainFingerprint: 'fake@1', criticalFailures: 0, testsPassed: 10, testsTotal: 10,
    stability: 1, infrastructureFailure: false, createdAt: '2026-08-31T00:00:04.000Z',
  }, { policyId: 'policy-a', minimumStability: 1, requireAllTests: true, maxIterations: 3 }, '2026-08-31T00:00:05.000Z');
  assert.equal(decision.outcome, 'PASS');
  assert.deepEqual(decision.reasonCodes, ['ALL_DETERMINISTIC_GATES_PASSED']);
});

test('deterministic gate iterates on behavioral failure', () => {
  let run = createRun('module-a', 'policy-a', '2026-08-31T00:00:00.000Z');
  run = transitionRun(run, 'PLANNED', '2026-08-31T00:00:01.000Z');
  run = transitionRun(run, 'GENERATING', '2026-08-31T00:00:02.000Z');
  run = transitionRun(run, 'EVALUATING', '2026-08-31T00:00:03.000Z');
  const decision = decideGate(run, {
    reportId: 'report', runId: run.runId, versionId: 'version', inputRefs: [], evidenceRefs: [],
    toolchainFingerprint: 'fake@1', criticalFailures: 1, testsPassed: 9, testsTotal: 10,
    stability: 0.8, infrastructureFailure: false, createdAt: '2026-08-31T00:00:04.000Z',
  }, { policyId: 'policy-a', minimumStability: 1, requireAllTests: true, maxIterations: 3 }, '2026-08-31T00:00:05.000Z');
  assert.equal(decision.outcome, 'ITERATE');
  assert.ok(decision.reasonCodes.includes('CRITICAL_TEST_FAILURE'));
});

test('check and review blockers participate in the deterministic gate', () => {
  const run = createRun('module-a', 'policy-a', '2026-08-31T00:00:00.000Z');
  const decision = decideGate(run, {
    reportId: 'report', runId: run.runId, versionId: 'version', inputRefs: [], evidenceRefs: [],
    toolchainFingerprint: 'fake@1', criticalFailures: 0, testsPassed: 10, testsTotal: 10,
    stability: 1, infrastructureFailure: false, checkBlocking: true, reviewBlocking: true,
    createdAt: '2026-08-31T00:00:01.000Z',
  }, { policyId: 'policy-a', minimumStability: 1, requireAllTests: true, maxIterations: 3 }, '2026-08-31T00:00:02.000Z');
  assert.equal(decision.outcome, 'ITERATE');
  assert.ok(decision.reasonCodes.includes('CHECK_BLOCKING'));
  assert.ok(decision.reasonCodes.includes('REVIEW_BLOCKING'));
  assert.equal(decision.reasonCodes.includes('ALL_DETERMINISTIC_GATES_PASSED'), false);
  const stopped = decideGate({ ...run, iteration: 3 }, {
    reportId: 'report-at-limit', runId: run.runId, versionId: 'version', inputRefs: [], evidenceRefs: [],
    toolchainFingerprint: 'fake@1', criticalFailures: 0, testsPassed: 10, testsTotal: 10,
    stability: 1, infrastructureFailure: false, checkBlocking: false, reviewBlocking: true,
    createdAt: '2026-08-31T00:00:03.000Z',
  }, { policyId: 'policy-a', minimumStability: 1, requireAllTests: true, maxIterations: 3 }, '2026-08-31T00:00:04.000Z');
  assert.equal(stopped.outcome, 'STOPPED');
});

test('infrastructure failure remains STOPPED when behavioral checks also fail', () => {
  const run = createRun('module-a', 'policy-a', '2026-08-31T00:00:00.000Z');
  const decision = decideGate(run, {
    reportId: 'report', runId: run.runId, versionId: 'version', inputRefs: [], evidenceRefs: [],
    toolchainFingerprint: 'fake@1', criticalFailures: 1, testsPassed: 0, testsTotal: 1,
    stability: 0, infrastructureFailure: true, createdAt: '2026-08-31T00:00:01.000Z',
  }, { policyId: 'policy-a', minimumStability: 1, requireAllTests: true, maxIterations: 3 }, '2026-08-31T00:00:02.000Z');
  assert.equal(decision.outcome, 'STOPPED');
  assert.ok(decision.reasonCodes.includes('INFRASTRUCTURE_FAILURE'));
});
