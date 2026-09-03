import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AssociationDomainService,
  EvalRunnerDomainService,
  FlywheelDomainService,
} from '../../src/domain/services/index.ts';

test('FlywheelDomainService owns lifecycle rules and keeps generation capabilities explicit', () => {
  const domain = new FlywheelDomainService();
  const created = domain.createRun('module-a', 'policy-a', '2026-09-03T00:00:00.000Z');
  const planned = domain.transition(created, 'PLANNED', '2026-09-03T00:00:01.000Z');
  assert.equal(planned.state, 'PLANNED');
  assert.deepEqual(domain.generationCapabilities(), ['doc-gen', 'test-gen', 'code']);
});

test('EvalRunnerDomainService exposes deterministic EvaluationAgent capability', () => {
  const flywheel = new FlywheelDomainService();
  const evaluator = new EvalRunnerDomainService();
  const run = flywheel.createRun('module-a', 'policy-a', '2026-09-03T00:00:00.000Z');
  const decision = evaluator.decide(run, {
    reportId: 'report-a', runId: run.runId, versionId: 'version-a', inputRefs: [], evidenceRefs: [],
    toolchainFingerprint: 'fixture@1', criticalFailures: 0, testsPassed: 1, testsTotal: 1,
    stability: 1, infrastructureFailure: false, createdAt: '2026-09-03T00:00:01.000Z',
  }, {
    policyId: 'policy-a', minimumStability: 1, requireAllTests: true, maxIterations: 1,
  }, '2026-09-03T00:00:02.000Z');
  assert.equal(decision.outcome, 'PASS');
});

test('AssociationDomainService composes extractor and reverse mapper without infrastructure dependencies', () => {
  const association = new AssociationDomainService();
  const result = association.associate({
    content: 'OrderService emits OrderCreated.',
    source: 'docs/order.md',
    targets: [{ targetId: 'order-service', aliases: ['OrderService'] }],
    extractor: {
      extract: ({ source }) => [{
        factId: 'fact-1', source, subject: 'OrderService', predicate: 'emits', object: 'OrderCreated',
      }],
    },
    reverseMapper: {
      map: ({ facts }) => [{
        factId: facts[0].factId, targetId: 'order-service', confidence: 1, reason: 'Exact service name',
      }],
    },
  });
  assert.equal(result.facts.length, 1);
  assert.equal(result.links[0].targetId, 'order-service');
});
