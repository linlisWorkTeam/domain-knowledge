import type { DatabaseSync } from 'node:sqlite';
import type {
  DomainEvent,
  EvaluationReport,
  FlywheelRun,
  GateDecision,
  KnowledgeVersion,
} from '../../domain/index.ts';
import type { NodeCheckpoint } from '../../application/ports/index.ts';
import type { AgentId, WorkflowNodeProjection } from '../../application/ports/index.ts';

export interface RunEvaluationRecord {
  report: EvaluationReport;
  decision: GateDecision;
}

export interface SequencedDomainEvent {
  eventSeq: number;
  event: DomainEvent;
}

function parse<T>(value: unknown): T {
  return JSON.parse(String(value)) as T;
}

function opaqueActivityCursor(value: number): string {
  return `act_${Buffer.from(String(value), 'utf8').toString('base64url')}`;
}

function runFromRow(row: Record<string, unknown>): FlywheelRun {
  return {
    runId: String(row.run_id),
    moduleId: String(row.module_id),
    policyId: String(row.policy_id),
    state: String(row.state) as FlywheelRun['state'],
    iteration: Number(row.iteration),
    bestVersionId: row.best_version_id === null ? null : String(row.best_version_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function checkpointFromRow(row: Record<string, unknown>): NodeCheckpoint {
  return {
    generationKey: String(row.generation_key),
    runId: String(row.run_id),
    nodeId: String(row.node_id),
    status: String(row.status) as NodeCheckpoint['status'],
    inputRefs: parse<NodeCheckpoint['inputRefs']>(row.input_refs_json),
    outputRefs: parse<NodeCheckpoint['outputRefs']>(row.output_refs_json),
    retryCount: Number(row.retry_count),
    updatedAt: String(row.updated_at),
  };
}

/** Runner-owned read projection for the product console. It has no write authority. */
export class ConsoleReadModel {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  listRunSummaries(states?: string[]): Record<string, unknown>[] {
    const rows = this.database.prepare(`
      SELECT runs.*,
        (SELECT decision_json FROM gate_decisions AS decision
          WHERE decision.run_id = runs.run_id
          ORDER BY decision.rowid DESC LIMIT 1) AS latest_decision_json
      FROM runs ORDER BY updated_at DESC, rowid DESC
    `).all() as Record<string, unknown>[];
    return rows
      .filter((row) => !states?.length || states.includes(String(row.state)))
      .map((row) => ({
        ...runFromRow(row),
        latestDecision: row.latest_decision_json === null
          ? null
          : parse<GateDecision>(row.latest_decision_json),
      }));
  }

  getRunSnapshot(
    runId: string,
    versions: KnowledgeVersion[],
  ): Record<string, unknown> | null {
    const row = this.database.prepare('SELECT * FROM runs WHERE run_id = ?').get(runId) as Record<string, unknown> | undefined;
    if (!row) return null;
    const run = runFromRow(row);
    const evaluations = this.listEvaluations(runId);
    const configurationRow = this.database.prepare(`
      SELECT snapshot_json FROM run_configuration_snapshots WHERE run_id = ?
    `).get(runId) as Record<string, unknown> | undefined;
    const configuration = configurationRow
      ? parse<{ governanceTrigger?: unknown }>(configurationRow.snapshot_json)
      : null;
    return {
      run,
      governanceTrigger: configuration?.governanceTrigger ?? null,
      versions: versions.filter((version) => version.moduleId === run.moduleId),
      evaluations,
      checkpoints: this.listCheckpoints(runId),
      workflowNodes: this.listWorkflowNodes(runId),
      events: this.listSequencedEvents(runId),
      publications: this.listPublications(runId),
      latestDecision: evaluations.at(-1)?.decision ?? null,
    };
  }

  listActionItems(filters: Record<string, string> = {}): Record<string, unknown>[] {
    const rows = this.database.prepare(`
      SELECT * FROM action_items ORDER BY updated_at DESC, action_item_id DESC
    `).all() as Record<string, unknown>[];
    return rows.map((row) => this.actionItemFromRow(row)).filter((item) => (
      (!filters.status || item.status === filters.status)
      && (!filters.severity || item.severity === filters.severity)
      && (!filters.type || item.type === filters.type)
      && (!filters.runId || item.runId === filters.runId)
    ));
  }

  getActionItem(actionItemId: string): Record<string, unknown> | null {
    const row = this.database.prepare('SELECT * FROM action_items WHERE action_item_id = ?')
      .get(actionItemId) as Record<string, unknown> | undefined;
    if (!row) return null;
    const sources = this.database.prepare(`
      SELECT event_id, observed_at FROM action_item_sources
      WHERE action_item_id = ? ORDER BY observed_at, event_id
    `).all(actionItemId) as Record<string, unknown>[];
    const history = this.database.prepare(`
      SELECT audit_id, action, reason, command_run_id, from_status, to_status,
        revision, occurred_at, actor FROM action_item_history
      WHERE action_item_id = ? ORDER BY occurred_at, audit_id
    `).all(actionItemId) as Record<string, unknown>[];
    return {
      ...this.actionItemFromRow(row),
      observedSources: sources.map((source) => ({
        eventId: String(source.event_id), observedAt: String(source.observed_at),
      })),
      history: history.map((entry) => ({
        auditId: String(entry.audit_id),
        action: String(entry.action),
        reason: String(entry.reason),
        commandRunId: entry.command_run_id === null ? null : String(entry.command_run_id),
        fromStatus: String(entry.from_status),
        toStatus: String(entry.to_status),
        revision: Number(entry.revision),
        occurredAt: String(entry.occurred_at),
        actor: String(entry.actor),
      })),
    };
  }

  getRunProgress(runId: string): Record<string, unknown> | null {
    const run = this.database.prepare('SELECT * FROM runs WHERE run_id = ?').get(runId) as Record<string, unknown> | undefined;
    if (!run) return null;
    const rows = this.database.prepare(`
      SELECT node_id, agent_id, iteration, status, attempt, updated_at FROM workflow_node_projections
      WHERE run_id = ? ORDER BY iteration, node_id, attempt DESC, updated_at DESC
    `).all(runId) as Record<string, unknown>[];
    const latest = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      const key = `${row.iteration}:${row.node_id}`;
      if (!latest.has(key)) latest.set(key, row);
    }
    const units = [...latest.values()];
    const configurationRow = this.database.prepare(`
      SELECT snapshot_json FROM run_configuration_snapshots WHERE run_id = ?
    `).get(runId) as Record<string, unknown> | undefined;
    const configuration = configurationRow
      ? parse<{ agents?: { agentId: string }[] }>(configurationRow.snapshot_json)
      : null;
    const frozenAgents = new Set((configuration?.agents ?? []).map((agent) => agent.agentId));
    const determinate = frozenAgents.size > 0;
    const completed = new Set(units.filter((row) => (
      row.status === 'COMPLETED' && row.agent_id !== null && frozenAgents.has(String(row.agent_id))
    )).map((row) => `${row.iteration}:${row.agent_id}`)).size;
    const total = determinate ? frozenAgents.size * (Number(run.iteration) + 1) : null;
    const active = units.find((row) => row.status === 'RUNNING');
    return {
      runId,
      mode: determinate ? 'DETERMINATE' : 'INDETERMINATE',
      completedUnits: determinate ? completed : null,
      totalUnits: total,
      ratio: total ? Math.min(1, completed / total) : null,
      currentStage: active ? String(active.node_id) : String(run.state),
      iteration: Number(run.iteration),
      retrying: units.some((row) => Number(row.attempt) > 1 && row.status === 'RUNNING'),
      sampledAt: new Date().toISOString(),
    };
  }

  listActivities(filters: Record<string, string> = {}): Record<string, unknown>[] {
    const rows = this.database.prepare(`
      SELECT rowid AS activity_cursor, event_id, run_id, event_type, occurred_at, event_json
      FROM events ORDER BY rowid DESC
    `).all() as Record<string, unknown>[];
    return rows.map((row) => {
      const event = parse<DomainEvent>(row.event_json);
      return {
        activityId: `activity_${event.eventId}`,
        cursor: opaqueActivityCursor(Number(row.activity_cursor)),
        type: event.eventType,
        occurredAt: event.occurredAt,
        runId: event.runId,
        subject: { kind: event.runId.startsWith('catalog:') ? 'KNOWLEDGE' : 'RUN', id: event.runId },
        summary: event.eventType,
        severity: event.eventType === 'NodeFailed' ? 'HIGH' : 'INFO',
        eventId: event.eventId,
        links: event.runId.startsWith('catalog:') ? [] : [{ rel: 'run', href: `/api/v1/runs/${encodeURIComponent(event.runId)}` }],
      };
    }).filter((item) => (
      (!filters.type || item.type === filters.type)
      && (!filters.runId || item.runId === filters.runId)
      && (!filters.severity || item.severity === filters.severity)
      && (!filters.occurredAfter || String(item.occurredAt) > filters.occurredAfter)
    ));
  }

  private actionItemFromRow(row: Record<string, unknown>): Record<string, unknown> {
    const status = String(row.status);
    const configuredActions = parse<string[]>(row.allowed_actions_json);
    const allowedActions = status === 'RESOLVED'
      ? []
      : status === 'ACKNOWLEDGED' ? configuredActions.filter((action) => action !== 'ACKNOWLEDGE') : configuredActions;
    return {
      actionItemId: String(row.action_item_id),
      type: String(row.type),
      severity: String(row.severity),
      status,
      subject: { kind: String(row.subject_kind), id: String(row.subject_id) },
      runId: row.run_id === null ? null : String(row.run_id),
      reasonCode: String(row.reason_code),
      summary: String(row.summary),
      sourceEventId: String(row.source_event_id),
      fingerprint: String(row.fingerprint),
      allowedActions,
      revision: Number(row.revision),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      resolvedAt: row.resolved_at === null ? null : String(row.resolved_at),
      resolution: row.resolution_json === null ? null : parse<unknown>(row.resolution_json),
      previousOccurrenceId: row.previous_occurrence_id === null ? null : String(row.previous_occurrence_id),
    };
  }

  private listPublications(runId: string): Record<string, unknown>[] {
    return this.database.prepare(`
      SELECT publication.publication_key, publication.module_id, publication.version_id,
        publication.policy_id, publication.decision_id, publication.published_at
      FROM publications AS publication
      INNER JOIN gate_decisions AS decision ON decision.decision_id = publication.decision_id
      WHERE decision.run_id = ? ORDER BY publication.published_at, publication.publication_key
    `).all(runId).map((row) => {
      const value = row as Record<string, unknown>;
      return {
        publicationKey: String(value.publication_key),
        moduleId: String(value.module_id),
        versionId: String(value.version_id),
        policyId: String(value.policy_id),
        decisionId: String(value.decision_id),
        publishedAt: String(value.published_at),
      };
    });
  }

  private listEvaluations(runId: string): RunEvaluationRecord[] {
    const rows = this.database.prepare(`
      SELECT report_json,
        (SELECT decision_json FROM gate_decisions AS decision
          WHERE decision.run_id = evaluation.run_id AND decision.version_id = evaluation.version_id
          ORDER BY decision.rowid DESC LIMIT 1) AS decision_json
      FROM evaluations AS evaluation WHERE run_id = ? ORDER BY rowid
    `).all(runId) as Record<string, unknown>[];
    return rows
      .filter((row) => row.decision_json !== null)
      .map((row) => ({
        report: parse<EvaluationReport>(row.report_json),
        decision: parse<GateDecision>(row.decision_json),
      }));
  }

  private listSequencedEvents(runId: string): SequencedDomainEvent[] {
    const rows = this.database.prepare(`
      SELECT event_seq, event_json FROM events WHERE run_id = ? ORDER BY event_seq
    `).all(runId) as Record<string, unknown>[];
    return rows.map((row) => ({
      eventSeq: Number(row.event_seq),
      event: parse<DomainEvent>(row.event_json),
    }));
  }

  private listCheckpoints(runId: string): NodeCheckpoint[] {
    const rows = this.database.prepare(`
      SELECT * FROM checkpoints WHERE run_id = ? ORDER BY updated_at, rowid
    `).all(runId) as Record<string, unknown>[];
    return rows.map(checkpointFromRow);
  }

  private listWorkflowNodes(runId: string): WorkflowNodeProjection[] {
    const rows = this.database.prepare(`
      SELECT * FROM workflow_node_projections
      WHERE run_id = ? ORDER BY iteration, updated_at, node_id, attempt
    `).all(runId) as Record<string, unknown>[];
    return rows.map((row) => ({
      runId: String(row.run_id),
      nodeId: String(row.node_id),
      agentId: row.agent_id === null ? null : String(row.agent_id) as AgentId,
      status: String(row.status) as WorkflowNodeProjection['status'],
      iteration: Number(row.iteration),
      attempt: Number(row.attempt),
      detail: String(row.detail),
      error: row.error === null ? null : String(row.error),
      startedAt: row.started_at === null ? null : String(row.started_at),
      completedAt: row.completed_at === null ? null : String(row.completed_at),
      updatedAt: String(row.updated_at),
    }));
  }
}
