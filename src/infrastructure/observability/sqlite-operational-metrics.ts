import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  OperationalMetricsPort,
  ProviderInvocationRecord,
  RunConfigurationSnapshot,
} from '../../application/ports/index.ts';

type MetricsWindow = '24h' | '7d' | '30d';

interface RunRow {
  runId: string;
  state: string;
  iteration: number;
  createdAt: string;
  updatedAt: string;
  provider: string;
  model: string;
}

interface NodeSample {
  runId: string;
  agentId: string;
  durationMs: number;
  queueDurationMs: number | null;
  attempt: number;
}

function parse<T>(value: unknown): T {
  return JSON.parse(String(value)) as T;
}

function windowMilliseconds(window: MetricsWindow): number {
  return window === '24h' ? 24 * 60 * 60_000
    : window === '7d' ? 7 * 24 * 60 * 60_000 : 30 * 24 * 60 * 60_000;
}

function percentile(values: number[], quantile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.max(0, Math.ceil(quantile * sorted.length) - 1);
  return sorted[rank] ?? null;
}

function distribution(values: number[]) {
  return { sampleSize: values.length, p50: percentile(values, 0.5), p95: percentile(values, 0.95) };
}

function rate(numerator: number, denominator: number) {
  return {
    sampleSize: denominator,
    numerator,
    denominator,
    value: denominator === 0 ? null : numerator / denominator,
  };
}

function average(values: number[]) {
  return {
    sampleSize: values.length,
    numerator: null,
    denominator: null,
    value: values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length,
  };
}

function safeTimestamp(raw: unknown): number | null {
  const value = Date.parse(String(raw));
  return Number.isFinite(value) ? value : null;
}

function cohort(runs: RunRow[], invocationCount: number): Record<string, unknown> {
  const kinds = new Set(runs.map((run) => run.provider === 'fixture' ? 'FIXTURE'
    : run.provider === 'unknown' ? 'UNKNOWN' : 'REAL'));
  const kind = runs.length === 0 ? 'EMPTY'
    : kinds.has('UNKNOWN') || kinds.size > 1 ? 'MIXED' : [...kinds][0];
  return {
    kind,
    isFixture: kind === 'FIXTURE' ? true : kind === 'REAL' ? false : null,
    runCount: runs.length,
    providerInvocationCount: invocationCount,
  };
}

/** Registry-backed aggregate projection. It stores only numeric usage and controlled error codes. */
export class SQLiteOperationalMetrics implements OperationalMetricsPort {
  readonly database: DatabaseSync;
  readonly clock: () => Date;

  constructor(database: DatabaseSync, clock: () => Date = () => new Date()) {
    this.database = database;
    this.clock = clock;
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS provider_invocations (
        invocation_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        status TEXT NOT NULL,
        retry_count INTEGER NOT NULL,
        input_tokens INTEGER,
        output_tokens INTEGER,
        cache_read_tokens INTEGER,
        cache_write_tokens INTEGER,
        estimated_cost_usd REAL,
        fixture INTEGER NOT NULL,
        error_code TEXT
      );
      CREATE INDEX IF NOT EXISTS provider_invocations_started
        ON provider_invocations(started_at, provider, model);
      CREATE INDEX IF NOT EXISTS provider_invocations_run
        ON provider_invocations(run_id, agent_id);
    `);
  }

  recordProviderInvocation(record: ProviderInvocationRecord): void {
    if (!record.runId || !record.agentId || !record.provider || !record.model) return;
    const nonNegative = (value: number | null) => value === null
      || (Number.isSafeInteger(value) && value >= 0);
    if (![record.durationMs, record.retryCount, record.inputTokens, record.outputTokens,
      record.cacheReadTokens, record.cacheWriteTokens].every(nonNegative)) {
      throw new Error('METRICS_RECORD_INVALID: numeric values must be non-negative integers');
    }
    if (record.estimatedCostUsd !== null
      && (!Number.isFinite(record.estimatedCostUsd) || record.estimatedCostUsd < 0)) {
      throw new Error('METRICS_RECORD_INVALID: estimated cost must be non-negative');
    }
    if (!['SUCCEEDED', 'FAILED'].includes(record.status)
      || safeTimestamp(record.startedAt) === null || safeTimestamp(record.completedAt) === null) {
      throw new Error('METRICS_RECORD_INVALID: status and timestamps are invalid');
    }
    const errorCode = record.errorCode?.match(/^[A-Z0-9_]{1,128}$/)?.[0] ?? null;
    this.database.prepare(`
      INSERT OR IGNORE INTO provider_invocations(
        invocation_id, run_id, agent_id, provider, model, started_at, completed_at,
        duration_ms, status, retry_count, input_tokens, output_tokens,
        cache_read_tokens, cache_write_tokens, estimated_cost_usd, fixture, error_code
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.invocationId || `pinv_${randomUUID()}`,
      record.runId,
      record.agentId,
      record.provider,
      record.model,
      record.startedAt,
      record.completedAt,
      record.durationMs,
      record.status,
      record.retryCount,
      record.inputTokens,
      record.outputTokens,
      record.cacheReadTokens,
      record.cacheWriteTokens,
      record.estimatedCostUsd,
      record.fixture ? 1 : 0,
      errorCode,
    );
  }

  runs(window: MetricsWindow): Record<string, unknown> {
    const bounds = this.bounds(window);
    const runs = this.runRows(bounds.from);
    const nodes = this.nodeSamples(bounds.from);
    const invocations = this.invocations(bounds.from);
    const terminalStates = new Set(['VERIFIED', 'LOW_CONFIDENCE', 'FAILED', 'CANCELLED']);
    const runDurations = runs.flatMap((run) => {
      if (!terminalStates.has(run.state)) return [];
      const start = safeTimestamp(run.createdAt);
      const end = safeTimestamp(run.updatedAt);
      return start === null || end === null || end < start ? [] : [end - start];
    });
    const tokenSamples = invocations.filter((record) => record.inputTokens !== null && record.outputTokens !== null);
    const costSamples = invocations.filter((record) => record.estimatedCostUsd !== null);
    const queueDurations = nodes.flatMap((node) => (
      node.queueDurationMs === null ? [] : [node.queueDurationMs]
    ));
    const workflowRetries = nodes.filter((node) => node.attempt > 1).length;
    const providers = new Map<string, typeof invocations>();
    for (const invocation of invocations) {
      const key = `${invocation.provider}\0${invocation.model}`;
      const values = providers.get(key) ?? [];
      values.push(invocation);
      providers.set(key, values);
    }
    const nodeGroups = new Map<string, NodeSample[]>();
    for (const node of nodes) {
      const values = nodeGroups.get(node.agentId) ?? [];
      values.push(node);
      nodeGroups.set(node.agentId, values);
    }
    return {
      ...bounds,
      sampledAt: bounds.to,
      cohort: cohort(runs, invocations.length),
      definitions: {
        runDurationMs: 'terminal run updatedAt minus createdAt',
        nodeDurationMs: 'completedAt minus startedAt for completed or failed node attempts',
        queueDurationMs: 'node startedAt minus the scheduler-recorded readyAt for the same attempt; legacy rows without readyAt are excluded',
        providerRetries: 'additional Provider attempts after an invalid model response; independent of workflow node recovery attempts',
        workflowNodeRetries: 'workflow node attempts whose persisted attempt number is greater than one',
        estimatedCostUsd: 'reported Provider usage multiplied by configured model pricing; unavailable when pricing is unknown',
      },
      runDurationMs: distribution(runDurations),
      nodeDurationMs: distribution(nodes.map((node) => node.durationMs)),
      queueDurationMs: distribution(queueDurations),
      providerCalls: {
        sampleSize: invocations.length,
        total: invocations.length,
        succeeded: invocations.filter((record) => record.status === 'SUCCEEDED').length,
        failed: invocations.filter((record) => record.status === 'FAILED').length,
        retries: invocations.reduce((sum, record) => sum + record.retryCount, 0),
      },
      workflowNodeRetries: {
        sampleSize: nodes.length,
        total: workflowRetries,
      },
      tokens: {
        sampleSize: tokenSamples.length,
        input: tokenSamples.length
          ? tokenSamples.reduce((sum, record) => sum + Number(record.inputTokens), 0) : null,
        output: tokenSamples.length
          ? tokenSamples.reduce((sum, record) => sum + Number(record.outputTokens), 0) : null,
        total: tokenSamples.length ? tokenSamples.reduce((sum, record) => sum
          + Number(record.inputTokens) + Number(record.outputTokens)
          + Number(record.cacheReadTokens ?? 0) + Number(record.cacheWriteTokens ?? 0), 0) : null,
      },
      estimatedCostUsd: {
        sampleSize: costSamples.length,
        total: costSamples.length
          ? costSamples.reduce((sum, record) => sum + Number(record.estimatedCostUsd), 0) : null,
      },
      nodes: [...nodeGroups.entries()].sort(([left], [right]) => left.localeCompare(right))
        .map(([agentId, samples]) => {
          const calls = invocations.filter((record) => record.agentId === agentId);
          const usage = calls.filter((record) => record.inputTokens !== null && record.outputTokens !== null);
          const costs = calls.filter((record) => record.estimatedCostUsd !== null);
          return {
            agentId,
            sampleSize: samples.length,
            durationMs: distribution(samples.map((sample) => sample.durationMs)),
            queueDurationMs: distribution(samples.flatMap((sample) => (
              sample.queueDurationMs === null ? [] : [sample.queueDurationMs]
            ))),
            calls: calls.length,
            providerRetries: calls.reduce((sum, record) => sum + record.retryCount, 0),
            workflowRetries: samples.filter((sample) => sample.attempt > 1).length,
            tokens: usage.length ? usage.reduce((sum, record) => sum
              + Number(record.inputTokens) + Number(record.outputTokens)
              + Number(record.cacheReadTokens ?? 0) + Number(record.cacheWriteTokens ?? 0), 0) : null,
            costUsd: costs.length ? costs.reduce((sum, record) => sum + Number(record.estimatedCostUsd), 0) : null,
          };
        }),
      providers: [...providers.entries()].sort(([left], [right]) => left.localeCompare(right))
        .map(([key, samples]) => {
          const [provider, model] = key.split('\0');
          const usage = samples.filter((record) => record.inputTokens !== null && record.outputTokens !== null);
          const costs = samples.filter((record) => record.estimatedCostUsd !== null);
          return {
            provider,
            model,
            sampleSize: samples.length,
            calls: samples.length,
            retries: samples.reduce((sum, record) => sum + record.retryCount, 0),
            tokens: usage.length ? usage.reduce((sum, record) => sum
              + Number(record.inputTokens) + Number(record.outputTokens)
              + Number(record.cacheReadTokens ?? 0) + Number(record.cacheWriteTokens ?? 0), 0) : null,
            costUsd: costs.length ? costs.reduce((sum, record) => sum + Number(record.estimatedCostUsd), 0) : null,
          };
        }),
    };
  }

  governance(window: MetricsWindow): Record<string, unknown> {
    const bounds = this.bounds(window);
    const runs = this.runRows(bounds.from);
    const runIds = new Set(runs.map((run) => run.runId));
    const decisionsByRun = new Map<string, string[]>();
    const decisionRows = this.database.prepare(`
      SELECT decision.run_id, decision.outcome
      FROM gate_decisions AS decision
      JOIN runs AS run ON run.run_id = decision.run_id
      WHERE run.updated_at >= ?
      ORDER BY decision.created_at, decision.rowid
    `).all(bounds.from) as Record<string, unknown>[];
    for (const row of decisionRows) {
      const runId = String(row.run_id);
      if (!runIds.has(runId)) continue;
      const values = decisionsByRun.get(runId) ?? [];
      values.push(String(row.outcome));
      decisionsByRun.set(runId, values);
    }
    const revised = [...decisionsByRun.values()].filter((values) => values.length >= 2);
    const decided = [...decisionsByRun.values()].filter((values) => values.length >= 1);
    const historyRows = this.database.prepare(`
      SELECT DISTINCT item.run_id AS run_id
      FROM action_item_history AS history
      JOIN action_items AS item ON item.action_item_id = history.action_item_id
      WHERE history.occurred_at >= ? AND item.run_id IS NOT NULL
    `).all(bounds.from) as Record<string, unknown>[];
    const intervened = new Set(historyRows.map((row) => String(row.run_id)).filter((runId) => runIds.has(runId)));
    const actionRows = this.database.prepare(`
      SELECT action_item_id, previous_occurrence_id, created_at, resolved_at
      FROM action_items WHERE resolved_at >= ? AND resolved_at <= ?
    `).all(bounds.from, bounds.to) as Record<string, unknown>[];
    const resolved = actionRows;
    const resolutionDurations = resolved.flatMap((row) => {
      const created = safeTimestamp(row.created_at);
      const resolvedAt = safeTimestamp(row.resolved_at);
      return created === null || resolvedAt === null || resolvedAt < created ? [] : [resolvedAt - created];
    });
    const occurrences = this.database.prepare(`
      SELECT previous.action_item_id AS previous_id,
        current.created_at AS current_created, previous.resolved_at AS previous_resolved
      FROM action_items AS current
      JOIN action_items AS previous ON previous.action_item_id = current.previous_occurrence_id
      WHERE previous.resolved_at >= ? AND previous.resolved_at <= ? AND current.created_at <= ?
    `).all(bounds.from, bounds.to, bounds.to) as Record<string, unknown>[];
    const recurred = new Set(occurrences.filter((row) => {
      const current = safeTimestamp(row.current_created);
      const previous = safeTimestamp(row.previous_resolved);
      return current !== null && previous !== null && current >= previous
        && current - previous <= 7 * 24 * 60 * 60_000;
    }).map((row) => String(row.previous_id)));
    const invocationCount = this.invocations(bounds.from).length;
    return {
      ...bounds,
      sampledAt: bounds.to,
      cohort: cohort(runs, invocationCount),
      definitions: {
        firstRevisionPassRate: 'second Gate decision is PASS among runs with at least two decisions',
        threeIterationConvergenceRate: 'a PASS occurs within the first three Gate decisions',
        humanInterventionRate: 'a governance action was recorded for the run',
        meanResolutionTimeMs: 'resolvedAt minus createdAt for resolved action items',
        shortTermRecurrenceRate: 'a new item references a resolved prior occurrence within seven days',
      },
      firstRevisionPassRate: rate(
        revised.filter((values) => values[1] === 'PASS').length,
        revised.length,
      ),
      threeIterationConvergenceRate: rate(
        decided.filter((values) => values.slice(0, 3).includes('PASS')).length,
        decided.length,
      ),
      humanInterventionRate: rate(intervened.size, runs.length),
      meanResolutionTimeMs: average(resolutionDurations),
      shortTermRecurrenceRate: rate(recurred.size, resolved.length),
    };
  }

  private bounds(window: MetricsWindow): { window: MetricsWindow; from: string; to: string } {
    const to = this.clock();
    const from = new Date(to.getTime() - windowMilliseconds(window));
    return { window, from: from.toISOString(), to: to.toISOString() };
  }

  private runRows(from: string): RunRow[] {
    const rows = this.database.prepare(`
      SELECT run.run_id, run.state, run.iteration, run.created_at, run.updated_at,
        configuration.snapshot_json
      FROM runs AS run
      LEFT JOIN run_configuration_snapshots AS configuration ON configuration.run_id = run.run_id
      WHERE run.updated_at >= ? ORDER BY run.created_at, run.run_id
    `).all(from) as Record<string, unknown>[];
    return rows.map((row) => {
      const snapshot = row.snapshot_json === null
        ? null : parse<RunConfigurationSnapshot>(row.snapshot_json);
      return {
        runId: String(row.run_id),
        state: String(row.state),
        iteration: Number(row.iteration),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
        provider: snapshot?.provider.kind ?? 'unknown',
        model: snapshot?.provider.model ?? 'unknown',
      };
    });
  }

  private invocations(from: string): Array<ProviderInvocationRecord> {
    const rows = this.database.prepare(`
      SELECT * FROM provider_invocations WHERE started_at >= ? ORDER BY started_at, invocation_id
    `).all(from) as Record<string, unknown>[];
    return rows.map((row) => ({
      invocationId: String(row.invocation_id),
      runId: String(row.run_id),
      agentId: String(row.agent_id),
      provider: String(row.provider),
      model: String(row.model),
      startedAt: String(row.started_at),
      completedAt: String(row.completed_at),
      durationMs: Number(row.duration_ms),
      status: String(row.status) as ProviderInvocationRecord['status'],
      retryCount: Number(row.retry_count),
      inputTokens: row.input_tokens === null ? null : Number(row.input_tokens),
      outputTokens: row.output_tokens === null ? null : Number(row.output_tokens),
      cacheReadTokens: row.cache_read_tokens === null ? null : Number(row.cache_read_tokens),
      cacheWriteTokens: row.cache_write_tokens === null ? null : Number(row.cache_write_tokens),
      estimatedCostUsd: row.estimated_cost_usd === null ? null : Number(row.estimated_cost_usd),
      fixture: Number(row.fixture) === 1,
      errorCode: row.error_code === null ? null : String(row.error_code),
    }));
  }

  private nodeSamples(from: string): NodeSample[] {
    const rows = this.database.prepare(`
      SELECT run_id, agent_id, ready_at, started_at, completed_at, attempt
      FROM workflow_node_projections
      WHERE started_at >= ? AND completed_at IS NOT NULL AND agent_id IS NOT NULL
      ORDER BY run_id, started_at, node_id, attempt
    `).all(from) as Record<string, unknown>[];
    return rows.flatMap((row) => {
      const runId = String(row.run_id);
      const ready = row.ready_at === null ? null : safeTimestamp(row.ready_at);
      const started = safeTimestamp(row.started_at);
      const completed = safeTimestamp(row.completed_at);
      if (started === null || completed === null || completed < started) return [];
      return [{
        runId,
        agentId: String(row.agent_id),
        durationMs: completed - started,
        queueDurationMs: ready === null || ready > started ? null : started - ready,
        attempt: Number(row.attempt),
      }];
    });
  }
}
