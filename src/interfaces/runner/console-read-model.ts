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
    return {
      run,
      versions: versions.filter((version) => version.moduleId === run.moduleId),
      evaluations,
      checkpoints: this.listCheckpoints(runId),
      workflowNodes: this.listWorkflowNodes(runId),
      events: this.listSequencedEvents(runId),
      publications: this.listPublications(runId),
      latestDecision: evaluations.at(-1)?.decision ?? null,
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
