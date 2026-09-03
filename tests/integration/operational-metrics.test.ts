import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { SQLiteOperationalMetrics } from '../../src/infrastructure/observability/sqlite-operational-metrics.ts';
import { SQLiteFlywheelRepository } from '../../src/infrastructure/persistence/sqlite-cas/index.ts';

test('operational metrics expose mixed cohorts, percentile units, usage, and governance denominators', () => {
  const directory = mkdtempSync(join(tmpdir(), 'operational-metrics-'));
  const repository = new SQLiteFlywheelRepository(join(directory, 'registry.sqlite'));
  try {
    repository.initialize();
    const database = repository.database;
    const metrics = new SQLiteOperationalMetrics(database, () => new Date('2026-09-04T12:00:00.000Z'));
    const insertRun = database.prepare(`
      INSERT INTO runs(run_id, module_id, policy_id, state, iteration, best_version_id, created_at, updated_at)
      VALUES (?, 'module', 'policy', ?, ?, NULL, ?, ?)
    `);
    insertRun.run('run-real', 'VERIFIED', 2, '2026-09-04T10:00:00.000Z', '2026-09-04T10:10:00.000Z');
    insertRun.run('run-fixture', 'FAILED', 1, '2026-09-04T11:00:00.000Z', '2026-09-04T11:20:00.000Z');
    const insertConfiguration = database.prepare(`
      INSERT INTO run_configuration_snapshots(run_id, snapshot_json, captured_at) VALUES (?, ?, ?)
    `);
    insertConfiguration.run('run-real', JSON.stringify({ provider: { kind: 'pi-agent', model: 'model-a' } }), '2026-09-04T10:00:00.000Z');
    insertConfiguration.run('run-fixture', JSON.stringify({ provider: { kind: 'fixture', model: 'fixture-v1' } }), '2026-09-04T11:00:00.000Z');
    const insertNode = database.prepare(`
      INSERT INTO workflow_node_projections(
        run_id, node_id, agent_id, status, iteration, attempt, detail,
        error, ready_at, started_at, completed_at, updated_at
      ) VALUES (?, ?, ?, 'COMPLETED', ?, ?, '', NULL, ?, ?, ?, ?)
    `);
    insertNode.run('run-real', 'doc_gen', 'doc-gen', 1, 1,
      '2026-09-04T10:00:00.000Z',
      '2026-09-04T10:01:00.000Z', '2026-09-04T10:03:00.000Z', '2026-09-04T10:03:00.000Z');
    insertNode.run('run-real', 'review', 'review', 1, 1,
      '2026-09-04T10:03:00.000Z',
      '2026-09-04T10:05:00.000Z', '2026-09-04T10:06:00.000Z', '2026-09-04T10:06:00.000Z');
    insertNode.run('run-fixture', 'doc_gen', 'doc-gen', 1, 2,
      '2026-09-04T11:00:00.000Z',
      '2026-09-04T11:02:00.000Z', '2026-09-04T11:06:00.000Z', '2026-09-04T11:06:00.000Z');

    metrics.recordProviderInvocation({
      invocationId: 'invoke-1', runId: 'run-real', agentId: 'doc-gen', provider: 'pi-agent', model: 'model-a',
      startedAt: '2026-09-04T10:01:00.000Z', completedAt: '2026-09-04T10:02:00.000Z',
      durationMs: 60_000, status: 'SUCCEEDED', retryCount: 0,
      inputTokens: 100, outputTokens: 50, cacheReadTokens: 10, cacheWriteTokens: 0,
      estimatedCostUsd: 0.01, fixture: false, errorCode: null,
    });
    metrics.recordProviderInvocation({
      invocationId: 'invoke-2', runId: 'run-real', agentId: 'review', provider: 'pi-agent', model: 'model-a',
      startedAt: '2026-09-04T10:05:00.000Z', completedAt: '2026-09-04T10:05:30.000Z',
      durationMs: 30_000, status: 'FAILED', retryCount: 1,
      inputTokens: 20, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0,
      estimatedCostUsd: 0.02, fixture: false, errorCode: 'UPSTREAM_TIMEOUT',
    });

    const insertDecision = database.prepare(`
      INSERT INTO gate_decisions(decision_id, run_id, version_id, outcome, decision_json, created_at)
      VALUES (?, ?, 'version', ?, '{}', ?)
    `);
    insertDecision.run('decision-1', 'run-real', 'ITERATE', '2026-09-04T10:04:00.000Z');
    insertDecision.run('decision-2', 'run-real', 'PASS', '2026-09-04T10:08:00.000Z');
    insertDecision.run('decision-3', 'run-fixture', 'STOPPED', '2026-09-04T11:10:00.000Z');
    const insertItem = database.prepare(`
      INSERT INTO action_items(
        action_item_id, type, severity, status, subject_kind, subject_id, run_id,
        reason_code, summary, source_event_id, fingerprint, allowed_actions_json,
        revision, created_at, updated_at, resolved_at, resolution_json, previous_occurrence_id
      ) VALUES (?, 'TEST', 'HIGH', 'RESOLVED', 'RUN', ?, ?, 'TEST', '', ?, ?, '[]', 1, ?, ?, ?, '{}', ?)
    `);
    insertItem.run('item-1', 'run-real', 'run-real', 'event-1', 'fingerprint-1',
      '2026-09-04T10:00:00.000Z', '2026-09-04T10:10:00.000Z', '2026-09-04T10:10:00.000Z', null);
    insertItem.run('item-2', 'run-fixture', 'run-fixture', 'event-2', 'fingerprint-2',
      '2026-09-04T11:00:00.000Z', '2026-09-04T11:30:00.000Z', '2026-09-04T11:30:00.000Z', 'item-1');
    database.prepare(`
      INSERT INTO action_item_history(
        audit_id, action_item_id, action, reason, feedback, command_run_id,
        from_status, to_status, revision, occurred_at, actor
      ) VALUES ('audit-1', 'item-1', 'RESOLVE', '', NULL, NULL, 'OPEN', 'RESOLVED', 1, ?, 'operator')
    `).run('2026-09-04T10:10:00.000Z');

    const runs = metrics.runs('24h') as any;
    assert.deepEqual(runs.cohort, {
      kind: 'MIXED', isFixture: null, runCount: 2, providerInvocationCount: 2,
    });
    assert.deepEqual(runs.runDurationMs, { sampleSize: 2, p50: 600_000, p95: 1_200_000 });
    assert.deepEqual(runs.nodeDurationMs, { sampleSize: 3, p50: 120_000, p95: 240_000 });
    assert.deepEqual(runs.queueDurationMs, { sampleSize: 3, p50: 120_000, p95: 120_000 });
    assert.deepEqual(runs.providerCalls, { sampleSize: 2, total: 2, succeeded: 1, failed: 1, retries: 1 });
    assert.deepEqual(runs.workflowNodeRetries, { sampleSize: 3, total: 1 });
    assert.deepEqual(runs.tokens, { sampleSize: 2, input: 120, output: 55, total: 185 });
    assert.deepEqual(runs.estimatedCostUsd, { sampleSize: 2, total: 0.03 });
    assert.equal(runs.nodes.find((node: any) => node.agentId === 'doc-gen').tokens, 160);
    assert.equal(runs.providers[0].provider, 'pi-agent');

    const governance = metrics.governance('24h') as any;
    assert.equal(governance.cohort.kind, 'MIXED');
    assert.deepEqual(governance.firstRevisionPassRate, {
      sampleSize: 1, numerator: 1, denominator: 1, value: 1,
    });
    assert.deepEqual(governance.threeIterationConvergenceRate, {
      sampleSize: 2, numerator: 1, denominator: 2, value: 0.5,
    });
    assert.deepEqual(governance.humanInterventionRate, {
      sampleSize: 2, numerator: 1, denominator: 2, value: 0.5,
    });
    assert.equal(governance.meanResolutionTimeMs.sampleSize, 2);
    assert.equal(governance.meanResolutionTimeMs.value, 1_200_000);
    assert.deepEqual(governance.shortTermRecurrenceRate, {
      sampleSize: 2, numerator: 1, denominator: 2, value: 0.5,
    });
  } finally {
    repository.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('queue metrics use recorded scheduler readiness across parallel DAG branches', () => {
  const directory = mkdtempSync(join(tmpdir(), 'operational-metrics-parallel-'));
  const repository = new SQLiteFlywheelRepository(join(directory, 'registry.sqlite'));
  try {
    repository.initialize();
    const database = repository.database;
    const metrics = new SQLiteOperationalMetrics(database, () => new Date('2026-09-04T12:00:00.000Z'));
    database.prepare(`
      INSERT INTO runs(run_id, module_id, policy_id, state, iteration, best_version_id, created_at, updated_at)
      VALUES ('parallel-run', 'module', 'policy', 'VERIFIED', 0, NULL, ?, ?)
    `).run('2026-09-04T09:59:00.000Z', '2026-09-04T10:11:00.000Z');
    database.prepare(`
      INSERT INTO run_configuration_snapshots(run_id, snapshot_json, captured_at) VALUES (?, ?, ?)
    `).run('parallel-run', JSON.stringify({ provider: { kind: 'fixture', model: 'fixture-v1' } }),
      '2026-09-04T09:59:00.000Z');
    const insert = database.prepare(`
      INSERT INTO workflow_node_projections(
        run_id, node_id, agent_id, status, iteration, attempt, detail, error,
        ready_at, started_at, completed_at, updated_at
      ) VALUES ('parallel-run', ?, ?, 'COMPLETED', 0, 1, '', NULL, ?, ?, ?, ?)
    `);
    insert.run('orchestrator', 'orchestrator', '2026-09-04T09:59:00.000Z',
      '2026-09-04T10:00:00.000Z', '2026-09-04T10:01:00.000Z', '2026-09-04T10:01:00.000Z');
    // Both siblings became eligible together. Their queue times must not depend
    // on which sibling happened to complete first.
    insert.run('fast_branch', 'test-gen', '2026-09-04T10:01:00.000Z',
      '2026-09-04T10:02:00.000Z', '2026-09-04T10:03:00.000Z', '2026-09-04T10:03:00.000Z');
    insert.run('slow_branch', 'doc-gen', '2026-09-04T10:01:00.000Z',
      '2026-09-04T10:05:00.000Z', '2026-09-04T10:09:00.000Z', '2026-09-04T10:09:00.000Z');
    insert.run('join', 'review', '2026-09-04T10:09:00.000Z',
      '2026-09-04T10:10:00.000Z', '2026-09-04T10:11:00.000Z', '2026-09-04T10:11:00.000Z');

    const result = metrics.runs('24h') as any;
    assert.deepEqual(result.queueDurationMs, { sampleSize: 4, p50: 60_000, p95: 240_000 });
    assert.deepEqual(result.nodes.find((node: any) => node.agentId === 'doc-gen').queueDurationMs,
      { sampleSize: 1, p50: 240_000, p95: 240_000 });
  } finally {
    repository.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('workflow readiness migration leaves unprovable legacy queue samples empty', () => {
  const directory = mkdtempSync(join(tmpdir(), 'operational-metrics-migration-'));
  const path = join(directory, 'registry.sqlite');
  const legacy = new DatabaseSync(path);
  legacy.exec(`
    CREATE TABLE workflow_node_projections (
      run_id TEXT NOT NULL, node_id TEXT NOT NULL, agent_id TEXT, status TEXT NOT NULL,
      iteration INTEGER NOT NULL, attempt INTEGER NOT NULL, detail TEXT NOT NULL, error TEXT,
      started_at TEXT, completed_at TEXT, updated_at TEXT NOT NULL,
      PRIMARY KEY(run_id, node_id, iteration, attempt)
    );
  `);
  legacy.close();
  const repository = new SQLiteFlywheelRepository(path);
  try {
    repository.initialize();
    const columns = repository.database.prepare(
      'PRAGMA table_info(workflow_node_projections)',
    ).all() as Array<{ name: string }>;
    assert.ok(columns.some((column) => column.name === 'ready_at'));
    repository.database.prepare(`
      INSERT INTO runs(run_id, module_id, policy_id, state, iteration, best_version_id, created_at, updated_at)
      VALUES ('legacy-run', 'module', 'policy', 'VERIFIED', 0, NULL, ?, ?)
    `).run('2026-09-04T10:00:00.000Z', '2026-09-04T10:02:00.000Z');
    repository.database.prepare(`
      INSERT INTO workflow_node_projections(
        run_id, node_id, agent_id, status, iteration, attempt, detail, error,
        started_at, completed_at, updated_at
      ) VALUES ('legacy-run', 'doc_gen', 'doc-gen', 'COMPLETED', 0, 1, '', NULL, ?, ?, ?)
    `).run('2026-09-04T10:00:00.000Z', '2026-09-04T10:02:00.000Z', '2026-09-04T10:02:00.000Z');
    const result = new SQLiteOperationalMetrics(
      repository.database, () => new Date('2026-09-04T12:00:00.000Z'),
    ).runs('24h') as any;
    assert.deepEqual(result.nodeDurationMs, { sampleSize: 1, p50: 120_000, p95: 120_000 });
    assert.deepEqual(result.queueDurationMs, { sampleSize: 0, p50: null, p95: null });
  } finally {
    repository.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
