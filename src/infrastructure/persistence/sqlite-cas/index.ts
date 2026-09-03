import {
  chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync,
  renameSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  assertArtifactRef, assertInvariant, createArtifactRef, sha256,
} from '../../../domain/index.ts';
import type {
  ArtifactRef, DomainEvent, EvaluationReport, FlywheelRun, GateDecision,
  GatePolicy, KnowledgeStatus, KnowledgeVersion,
} from '../../../domain/index.ts';
import type {
  AgentId, AgentPromptConfiguration, ArtifactStore, CandidateInput, FlywheelRepository,
  NodeCheckpoint, RunConfigurationSnapshot, WorkflowNodeProjection,
} from '../../../application/ports/index.ts';
import {
  projectActionItemObservation, type ActionItemObservation,
} from '../sqlite-action-items.ts';

function json(value: unknown): string {
  return JSON.stringify(value);
}

function parse<T>(value: unknown): T {
  return JSON.parse(String(value)) as T;
}

function ensureParent(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

function syncParentDirectory(path: string): void {
  if (process.platform === 'win32') return;
  const handle = openSync(dirname(path), 'r');
  try {
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
}

export class LocalCasArtifactStore implements ArtifactStore {
  readonly root: string;

  constructor(root: string) {
    this.root = root;
    mkdirSync(this.root, { recursive: true });
  }

  private pathFor(ref: ArtifactRef): string {
    assertArtifactRef(ref);
    return join(this.root, 'sha256', ref.sha256.slice(0, 2), ref.sha256);
  }

  async put(bytes: Uint8Array, mediaType: string): Promise<ArtifactRef> {
    const ref = createArtifactRef(bytes, mediaType);
    const target = this.pathFor(ref);
    if (existsSync(target)) {
      assertInvariant(await this.verify(ref), `existing CAS object is corrupt: ${ref.artifactId}`);
      return ref;
    }
    ensureParent(target);
    const temporary = `${target}.tmp-${randomUUID()}`;
    let handle: number | null = null;
    try {
      handle = openSync(temporary, 'wx');
      writeFileSync(handle, bytes);
      fsyncSync(handle);
      closeSync(handle);
      handle = null;
      try {
        renameSync(temporary, target);
      } catch (error) {
        if (!existsSync(target)) throw error;
        unlinkSync(temporary);
      }
      if (process.platform !== 'win32') chmodSync(target, 0o400);
      syncParentDirectory(target);
      assertInvariant(await this.verify(ref), `CAS verification failed after commit: ${ref.artifactId}`);
      return ref;
    } finally {
      if (handle !== null) closeSync(handle);
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  }

  async get(ref: ArtifactRef): Promise<Uint8Array> {
    const path = this.pathFor(ref);
    assertInvariant(existsSync(path), `artifact not found: ${ref.artifactId}`);
    const bytes = readFileSync(path);
    assertInvariant(bytes.byteLength === ref.size, `artifact size mismatch: ${ref.artifactId}`);
    assertInvariant(sha256(bytes) === ref.sha256, `artifact digest mismatch: ${ref.artifactId}`);
    return bytes;
  }

  async verify(ref: ArtifactRef): Promise<boolean> {
    try {
      await this.get(ref);
      return true;
    } catch {
      return false;
    }
  }
}

export class SQLiteFlywheelRepository implements FlywheelRepository {
  readonly databasePath: string;
  readonly database: DatabaseSync;
  readonly checkpointLeaseMs: number;

  constructor(databasePath: string, options: { checkpointLeaseMs?: number } = {}) {
    this.databasePath = databasePath;
    this.checkpointLeaseMs = options.checkpointLeaseMs ?? 900_000;
    assertInvariant(
      Number.isSafeInteger(this.checkpointLeaseMs) && this.checkpointLeaseMs > 0,
      'checkpoint lease must be a positive integer',
    );
    ensureParent(databasePath);
    this.database = new DatabaseSync(databasePath);
  }

  initialize(): void {
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS runs (
        run_id TEXT PRIMARY KEY,
        module_id TEXT NOT NULL,
        policy_id TEXT NOT NULL,
        state TEXT NOT NULL,
        iteration INTEGER NOT NULL,
        best_version_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS knowledge_versions (
        version_id TEXT PRIMARY KEY,
        module_id TEXT NOT NULL,
        parent_version_id TEXT,
        body_ref_json TEXT NOT NULL,
        provenance_json TEXT NOT NULL,
        status TEXT NOT NULL,
        quality_outcome TEXT NOT NULL,
        quality_score REAL NOT NULL,
        gate_decision_id TEXT,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(module_id, body_ref_json)
      );
      CREATE INDEX IF NOT EXISTS knowledge_module_created
        ON knowledge_versions(module_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS knowledge_status
        ON knowledge_versions(status);

      CREATE TABLE IF NOT EXISTS evaluations (
        report_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        version_id TEXT NOT NULL,
        report_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS gate_decisions (
        decision_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        version_id TEXT NOT NULL,
        outcome TEXT NOT NULL,
        decision_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS events (
        event_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        event_seq INTEGER,
        occurred_at TEXT NOT NULL,
        event_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS events_run_time ON events(run_id, occurred_at, event_id);

      CREATE TABLE IF NOT EXISTS publications (
        publication_key TEXT PRIMARY KEY,
        module_id TEXT NOT NULL,
        version_id TEXT NOT NULL,
        policy_id TEXT NOT NULL,
        decision_id TEXT NOT NULL,
        published_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS feedback (
        feedback_id TEXT PRIMARY KEY,
        version_id TEXT NOT NULL,
        action TEXT NOT NULL,
        rating REAL,
        note TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS checkpoints (
        generation_key TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        status TEXT NOT NULL,
        input_refs_json TEXT NOT NULL,
        output_refs_json TEXT NOT NULL,
        retry_count INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agent_prompt_configurations (
        agent_id TEXT PRIMARY KEY,
        prompt_addon TEXT NOT NULL,
        revision INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS run_configuration_snapshots (
        run_id TEXT PRIMARY KEY,
        snapshot_json TEXT NOT NULL,
        captured_at TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES runs(run_id)
      );

      CREATE TABLE IF NOT EXISTS workflow_node_projections (
        run_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        agent_id TEXT,
        status TEXT NOT NULL,
        iteration INTEGER NOT NULL,
        attempt INTEGER NOT NULL,
        detail TEXT NOT NULL,
        error TEXT,
        ready_at TEXT,
        started_at TEXT,
        completed_at TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(run_id, node_id, iteration, attempt)
      );
      CREATE INDEX IF NOT EXISTS workflow_nodes_run_updated
        ON workflow_node_projections(run_id, updated_at, node_id);

      CREATE TABLE IF NOT EXISTS action_items (
        action_item_id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        severity TEXT NOT NULL,
        status TEXT NOT NULL,
        subject_kind TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        run_id TEXT,
        reason_code TEXT NOT NULL,
        summary TEXT NOT NULL,
        source_event_id TEXT NOT NULL UNIQUE,
        fingerprint TEXT NOT NULL,
        allowed_actions_json TEXT NOT NULL,
        revision INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        resolved_at TEXT,
        resolution_json TEXT,
        previous_occurrence_id TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS action_items_active_fingerprint
        ON action_items(fingerprint) WHERE status <> 'RESOLVED';
      CREATE INDEX IF NOT EXISTS action_items_updated
        ON action_items(updated_at DESC, action_item_id DESC);
      CREATE TABLE IF NOT EXISTS action_item_sources (
        action_item_id TEXT NOT NULL,
        event_id TEXT NOT NULL UNIQUE,
        observed_at TEXT NOT NULL,
        PRIMARY KEY(action_item_id, event_id),
        FOREIGN KEY(action_item_id) REFERENCES action_items(action_item_id)
      );
      CREATE TABLE IF NOT EXISTS action_item_history (
        audit_id TEXT PRIMARY KEY,
        action_item_id TEXT NOT NULL,
        action TEXT NOT NULL,
        reason TEXT NOT NULL,
        feedback TEXT,
        command_run_id TEXT,
        from_status TEXT NOT NULL,
        to_status TEXT NOT NULL,
        revision INTEGER NOT NULL,
        occurred_at TEXT NOT NULL,
        actor TEXT NOT NULL,
        FOREIGN KEY(action_item_id) REFERENCES action_items(action_item_id)
      );
      CREATE INDEX IF NOT EXISTS action_item_history_item
        ON action_item_history(action_item_id, occurred_at, audit_id);
      CREATE TABLE IF NOT EXISTS command_receipts (
        scope TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        status INTEGER NOT NULL,
        response_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(scope, idempotency_key)
      );

      INSERT OR IGNORE INTO schema_migrations(version, applied_at)
      VALUES (1, datetime('now'));
    `);
    const eventColumns = this.database.prepare('PRAGMA table_info(events)').all() as Record<string, unknown>[];
    if (!eventColumns.some((column) => String(column.name) === 'event_seq')) {
      this.database.exec('ALTER TABLE events ADD COLUMN event_seq INTEGER');
    }
    const actionItemColumns = this.database.prepare('PRAGMA table_info(action_items)').all() as Record<string, unknown>[];
    if (!actionItemColumns.some((column) => String(column.name) === 'previous_occurrence_id')) {
      this.database.exec('ALTER TABLE action_items ADD COLUMN previous_occurrence_id TEXT');
    }
    const historyColumns = this.database.prepare('PRAGMA table_info(action_item_history)').all() as Record<string, unknown>[];
    if (!historyColumns.some((column) => String(column.name) === 'actor')) {
      this.database.exec("ALTER TABLE action_item_history ADD COLUMN actor TEXT NOT NULL DEFAULT 'local-admin'");
    }
    const workflowNodeColumns = this.database.prepare(
      'PRAGMA table_info(workflow_node_projections)',
    ).all() as Record<string, unknown>[];
    if (!workflowNodeColumns.some((column) => String(column.name) === 'ready_at')) {
      // Historical rows cannot be assigned a truthful scheduler-ready time, so
      // the nullable column is intentionally not backfilled.
      this.database.exec('ALTER TABLE workflow_node_projections ADD COLUMN ready_at TEXT');
    }
    this.database.exec(`
      UPDATE events SET event_seq = rowid WHERE event_seq IS NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS events_run_seq ON events(run_id, event_seq);
      INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (2, datetime('now'));
      INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (3, datetime('now'));
      INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (4, datetime('now'));
      INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (5, datetime('now'));
      INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (6, datetime('now'));
    `);
  }

  resolveEvaluationPolicy(policy: GatePolicy): GatePolicy {
    const table = this.database.prepare(`
      SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'evaluation_rules'
    `).get() as Record<string, unknown> | undefined;
    if (!table) return policy;
    const row = this.database.prepare(`
      SELECT config_json, enabled FROM evaluation_rules
      WHERE rule_id = 'publication-gate' ORDER BY revision DESC LIMIT 1
    `).get() as Record<string, unknown> | undefined;
    if (!row) return policy;
    if (Number(row.enabled) !== 1) throw new Error('EVALUATION_RULE_DISABLED: publication-gate');
    const config = parse<Record<string, unknown>>(row.config_json);
    // A named custom policy remains authoritative unless a matching managed rule exists.
    if (config.policyId !== policy.policyId) return policy;
    const minimumStability = Number(config.minimumStability);
    const maxIterations = Number(config.maxIterations);
    assertInvariant(minimumStability >= 0 && minimumStability <= 1, 'evaluation rule minimumStability must be 0..1');
    assertInvariant(Number.isSafeInteger(maxIterations) && maxIterations >= 0, 'evaluation rule maxIterations must be non-negative');
    assertInvariant(typeof config.requireAllTests === 'boolean', 'evaluation rule requireAllTests must be boolean');
    return {
      policyId: policy.policyId,
      minimumStability,
      requireAllTests: config.requireAllTests,
      maxIterations,
    };
  }

  applyActionItemAction(input: {
    actionItemId: string;
    action: 'ACKNOWLEDGE' | 'RESOLVE' | 'RETRY' | 'REGENERATE';
    expectedRevision: number;
    reason: string;
    feedback?: string;
    commandRunId?: string;
    auditId: string;
    occurredAt: string;
    actor: string;
  }): Record<string, unknown> {
    return this.transaction(() => {
      const row = this.database.prepare('SELECT * FROM action_items WHERE action_item_id = ?')
        .get(input.actionItemId) as Record<string, unknown> | undefined;
      if (!row) throw new Error(`ACTION_ITEM_NOT_FOUND: ${input.actionItemId}`);
      const status = String(row.status);
      const revision = Number(row.revision);
      if (revision !== input.expectedRevision) throw new Error('REVISION_CONFLICT: action item changed');
      if (status === 'RESOLVED') throw new Error('ACTION_ITEM_RESOLVED: action item is already resolved');
      const allowed = parse<string[]>(row.allowed_actions_json);
      if (!allowed.includes(input.action)) throw new Error(`ACTION_NOT_ALLOWED: ${input.action}`);
      if (input.action === 'ACKNOWLEDGE' && status !== 'OPEN') {
        throw new Error('ACTION_NOT_ALLOWED: acknowledge requires OPEN');
      }
      if ((input.action === 'RETRY' || input.action === 'REGENERATE') && !input.commandRunId) {
        throw new Error('ARGUMENT_REQUIRED: commandRunId');
      }
      const nextStatus = input.action === 'ACKNOWLEDGE'
        ? 'ACKNOWLEDGED'
        : input.action === 'RESOLVE' ? 'RESOLVED' : status;
      const nextRevision = revision + 1;
      const resolution = input.action === 'RESOLVE'
        ? json({ reason: input.reason, auditId: input.auditId })
        : row.resolution_json === null ? null : String(row.resolution_json);
      const resolvedAt = nextStatus === 'RESOLVED'
        ? input.occurredAt
        : row.resolved_at === null ? null : String(row.resolved_at);
      const result = this.database.prepare(`
        UPDATE action_items SET status = ?, revision = ?, updated_at = ?,
          resolved_at = ?, resolution_json = ?
        WHERE action_item_id = ? AND revision = ?
      `).run(
        nextStatus, nextRevision, input.occurredAt,
        resolvedAt,
        resolution, input.actionItemId, revision,
      );
      if (Number(result.changes) !== 1) throw new Error('REVISION_CONFLICT: action item changed');
      this.database.prepare(`
        INSERT INTO action_item_history(
          audit_id, action_item_id, action, reason, feedback, command_run_id,
          from_status, to_status, revision, occurred_at, actor
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        input.auditId, input.actionItemId, input.action, input.reason,
        input.feedback ?? null, input.commandRunId ?? null, status, nextStatus,
        nextRevision, input.occurredAt, input.actor,
      );
      return {
        actionItemId: input.actionItemId,
        resourceId: input.actionItemId,
        eventId: input.auditId,
        action: input.action,
        status: nextStatus,
        revision: nextRevision,
        commandRunId: input.commandRunId ?? null,
        occurredAt: input.occurredAt,
        acceptedAt: input.occurredAt,
      };
    });
  }

  getCommandReceipt(scope: string, idempotencyKey: string): {
    fingerprint: string; status: number; value: unknown;
  } | null {
    const row = this.database.prepare(`
      SELECT fingerprint, status, response_json FROM command_receipts
      WHERE scope = ? AND idempotency_key = ?
    `).get(scope, idempotencyKey) as Record<string, unknown> | undefined;
    return row ? {
      fingerprint: String(row.fingerprint),
      status: Number(row.status),
      value: parse<unknown>(row.response_json),
    } : null;
  }

  saveCommandReceipt(input: {
    scope: string; idempotencyKey: string; fingerprint: string; status: number;
    value: unknown; createdAt: string;
  }): void {
    try {
      this.database.prepare(`
        INSERT INTO command_receipts(
          scope, idempotency_key, fingerprint, status, response_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        input.scope, input.idempotencyKey, input.fingerprint, input.status,
        json(input.value), input.createdAt,
      );
    } catch (error) {
      const existing = this.getCommandReceipt(input.scope, input.idempotencyKey);
      if (!existing || existing.fingerprint !== input.fingerprint) {
        throw new Error('IDEMPOTENCY_CONFLICT: key reused with different command', { cause: error });
      }
    }
  }

  private transaction<T>(operation: () => T): T {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  private insertEvent(event: DomainEvent): void {
    const result = this.database.prepare(`
      INSERT OR IGNORE INTO events(event_id, run_id, event_type, event_seq, occurred_at, event_json)
      VALUES (?, ?, ?, COALESCE((SELECT MAX(event_seq) + 1 FROM events WHERE run_id = ?), 1), ?, ?)
    `).run(event.eventId, event.runId, event.eventType, event.runId, event.occurredAt, json(event));
    if (Number(result.changes) === 1) this.projectActionItem(event);
  }

  private projectActionItem(event: DomainEvent): void {
    let type: ActionItemObservation['type'] | null = null;
    let severity: ActionItemObservation['severity'] = 'HIGH';
    let reasonCode = '';
    let summary = '';
    let allowedActions: ActionItemObservation['allowedActions'] = [];
    if (event.eventType === 'RunStateChanged' && event.payload.to === 'FAILED') {
      type = 'RUN_FAILED';
      reasonCode = String(event.payload.reasonCode ?? 'RUN_FAILED');
      summary = '批次执行失败';
      allowedActions = ['ACKNOWLEDGE', 'RESOLVE', 'RETRY'];
    } else if (event.eventType === 'RunStateChanged' && event.payload.to === 'LOW_CONFIDENCE') {
      type = 'LOW_CONFIDENCE';
      severity = 'MEDIUM';
      reasonCode = String(event.payload.reasonCode ?? 'LOW_CONFIDENCE');
      summary = '批次可信度不足，需要人工判断';
      allowedActions = ['ACKNOWLEDGE', 'RESOLVE', 'REGENERATE'];
    } else if (event.eventType === 'GateDecided' && event.payload.outcome === 'STOPPED') {
      type = 'GATE_STOPPED';
      const reasons = Array.isArray(event.payload.reasonCodes) ? event.payload.reasonCodes.map(String) : [];
      reasonCode = reasons[0] ?? 'GATE_STOPPED';
      summary = '确定性门禁停止了本批次';
      allowedActions = ['ACKNOWLEDGE', 'RESOLVE', 'REGENERATE'];
    } else if (event.eventType === 'ComponentStatusChanged' && event.payload.status === 'UNAVAILABLE') {
      type = 'COMPONENT_UNAVAILABLE';
      reasonCode = String(event.payload.reasonCode ?? 'COMPONENT_UNAVAILABLE');
      summary = `${String(event.payload.component ?? '必需组件')}不可用，影响活动批次`;
      allowedActions = ['ACKNOWLEDGE', 'RESOLVE', 'RETRY'];
    }
    if (!type) return;
    projectActionItemObservation(this.database, {
      type,
      severity,
      subject: { kind: 'RUN', id: event.runId },
      runId: event.runId,
      reasonCode,
      summary,
      eventId: event.eventId,
      occurredAt: event.occurredAt,
      allowedActions,
    });
  }

  saveRun(run: FlywheelRun, event: DomainEvent): void {
    this.transaction(() => {
      this.database.prepare(`
        INSERT INTO runs(run_id, module_id, policy_id, state, iteration, best_version_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(run.runId, run.moduleId, run.policyId, run.state, run.iteration, run.bestVersionId, run.createdAt, run.updatedAt);
      this.insertEvent(event);
    });
  }

  getRun(runId: string): FlywheelRun | null {
    const row = this.database.prepare('SELECT * FROM runs WHERE run_id = ?').get(runId) as Record<string, unknown> | undefined;
    return row ? this.runFromRow(row) : null;
  }

  updateRun(run: FlywheelRun, event: DomainEvent): void {
    this.transaction(() => {
      const result = this.database.prepare(`
        UPDATE runs SET state = ?, iteration = ?, best_version_id = ?, updated_at = ? WHERE run_id = ?
      `).run(run.state, run.iteration, run.bestVersionId, run.updatedAt, run.runId);
      assertInvariant(Number(result.changes) === 1, `run not found: ${run.runId}`);
      this.insertEvent(event);
    });
  }

  saveCandidate(input: CandidateInput, event: DomainEvent): KnowledgeVersion {
    return this.transaction(() => {
      this.database.prepare(`
        INSERT INTO knowledge_versions(
          version_id, module_id, parent_version_id, body_ref_json, provenance_json,
          status, quality_outcome, quality_score, gate_decision_id, title,
          description, category, tags_json, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, 'CANDIDATE', ?, ?, NULL, ?, ?, ?, ?, ?, ?)
      `).run(
        input.versionId, input.moduleId, input.parentVersionId, json(input.bodyRef), json(input.provenance),
        input.qualityOutcome, input.qualityScore, input.title, input.description, input.category,
        json(input.tags), json(input.metadata), input.createdAt,
      );
      this.insertEvent(event);
      return this.requireKnowledgeVersion(input.versionId);
    });
  }

  getKnowledgeVersion(versionId: string): KnowledgeVersion | null {
    const row = this.database.prepare('SELECT * FROM knowledge_versions WHERE version_id = ?').get(versionId) as Record<string, unknown> | undefined;
    return row ? this.versionFromRow(row) : null;
  }

  findKnowledgeVersionByBody(moduleId: string, artifactId: string): KnowledgeVersion | null {
    const rows = this.database.prepare('SELECT * FROM knowledge_versions WHERE module_id = ? ORDER BY created_at DESC').all(moduleId) as Record<string, unknown>[];
    const row = rows.find((candidate) => parse<ArtifactRef>(candidate.body_ref_json).artifactId === artifactId);
    return row ? this.versionFromRow(row) : null;
  }

  latestKnowledgeVersion(moduleId: string): KnowledgeVersion | null {
    const row = this.database.prepare(`
      SELECT * FROM knowledge_versions WHERE module_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1
    `).get(moduleId) as Record<string, unknown> | undefined;
    return row ? this.versionFromRow(row) : null;
  }

  listKnowledgeVersions(statuses?: string[]): KnowledgeVersion[] {
    const rows = this.database.prepare('SELECT * FROM knowledge_versions ORDER BY created_at DESC, rowid DESC').all() as Record<string, unknown>[];
    return rows
      .map((row) => this.versionFromRow(row))
      .filter((version) => !statuses?.length || statuses.includes(version.status));
  }

  saveEvaluationAndDecision(
    report: EvaluationReport,
    decision: GateDecision,
    reviewingRun: FlywheelRun,
    gateEvent: DomainEvent,
    transitionEvent: DomainEvent,
  ): void {
    this.transaction(() => {
      this.database.prepare(`
        INSERT INTO evaluations(report_id, run_id, version_id, report_json, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(report.reportId, report.runId, report.versionId, json(report), report.createdAt);
      this.database.prepare(`
        INSERT INTO gate_decisions(decision_id, run_id, version_id, outcome, decision_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(decision.decisionId, decision.runId, decision.versionId, decision.outcome, json(decision), decision.createdAt);
      const updated = this.database.prepare(`
        UPDATE runs SET state = ?, iteration = ?, best_version_id = ?, updated_at = ?
        WHERE run_id = ? AND state = 'EVALUATING'
      `).run(
        reviewingRun.state, reviewingRun.iteration, reviewingRun.bestVersionId,
        reviewingRun.updatedAt, reviewingRun.runId,
      );
      assertInvariant(Number(updated.changes) === 1, `run is not EVALUATING: ${reviewingRun.runId}`);
      this.insertEvent(gateEvent);
      this.insertEvent(transitionEvent);
    });
  }

  getEvaluationAndDecision(runId: string, versionId: string): {
    report: EvaluationReport;
    decision: GateDecision;
  } | null {
    const reportRow = this.database.prepare(`
      SELECT report_json FROM evaluations
      WHERE run_id = ? AND version_id = ? ORDER BY rowid DESC LIMIT 1
    `).get(runId, versionId) as Record<string, unknown> | undefined;
    const decisionRow = this.database.prepare(`
      SELECT decision_json FROM gate_decisions
      WHERE run_id = ? AND version_id = ? ORDER BY rowid DESC LIMIT 1
    `).get(runId, versionId) as Record<string, unknown> | undefined;
    if (!reportRow || !decisionRow) return null;
    return {
      report: parse<EvaluationReport>(reportRow.report_json),
      decision: parse<GateDecision>(decisionRow.decision_json),
    };
  }

  getGateDecision(decisionId: string): GateDecision | null {
    const row = this.database.prepare('SELECT decision_json FROM gate_decisions WHERE decision_id = ?').get(decisionId) as Record<string, unknown> | undefined;
    return row ? parse<GateDecision>(row.decision_json) : null;
  }

  publish(
    publicationKey: string,
    run: FlywheelRun,
    version: KnowledgeVersion,
    decision: GateDecision,
    event: DomainEvent,
  ): { publicationKey: string; versionId: string; publishedAt: string; replayed: boolean } {
    return this.transaction(() => {
      assertInvariant(decision.outcome === 'PASS', 'repository publish requires a PASS gate decision');
      const existing = this.getPublication(publicationKey);
      if (existing) return { ...existing, replayed: true };
      this.database.prepare(`
        UPDATE knowledge_versions SET status = 'SUPERSEDED'
        WHERE module_id = ? AND status = 'VERIFIED' AND version_id <> ?
      `).run(version.moduleId, version.versionId);
      this.database.prepare(`
        UPDATE knowledge_versions SET status = 'VERIFIED', gate_decision_id = ? WHERE version_id = ?
      `).run(decision.decisionId, version.versionId);
      this.database.prepare(`
        UPDATE runs SET state = 'VERIFIED', best_version_id = ?, updated_at = ? WHERE run_id = ?
      `).run(version.versionId, event.occurredAt, run.runId);
      this.database.prepare(`
        INSERT INTO publications(publication_key, module_id, version_id, policy_id, decision_id, published_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(publicationKey, version.moduleId, version.versionId, run.policyId, decision.decisionId, event.occurredAt);
      this.insertEvent(event);
      return { publicationKey, versionId: version.versionId, publishedAt: event.occurredAt, replayed: false };
    });
  }

  getPublication(publicationKey: string): { publicationKey: string; versionId: string; publishedAt: string } | null {
    const row = this.database.prepare(`
      SELECT publication_key, version_id, published_at FROM publications WHERE publication_key = ?
    `).get(publicationKey) as Record<string, unknown> | undefined;
    return row ? {
      publicationKey: String(row.publication_key),
      versionId: String(row.version_id),
      publishedAt: String(row.published_at),
    } : null;
  }

  recordFeedback(versionId: string, action: string, rating: number | null, note: string, now: string): void {
    this.database.prepare(`
      INSERT INTO feedback(feedback_id, version_id, action, rating, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), versionId, action, rating, note, now);
  }

  listEvents(runId: string): DomainEvent[] {
    const rows = this.database.prepare(`
      SELECT event_json FROM events WHERE run_id = ? ORDER BY event_seq
    `).all(runId) as Record<string, unknown>[];
    return rows.map((row) => parse<DomainEvent>(row.event_json));
  }

  getCheckpoint(generationKey: string): NodeCheckpoint | null {
    const row = this.database.prepare('SELECT * FROM checkpoints WHERE generation_key = ?').get(generationKey) as Record<string, unknown> | undefined;
    return row ? this.checkpointFromRow(row) : null;
  }

  claimCheckpoint(checkpoint: NodeCheckpoint): NodeCheckpoint {
    return this.transaction(() => {
      const existing = this.getCheckpoint(checkpoint.generationKey);
      if (existing) {
        assertInvariant(existing.runId === checkpoint.runId && existing.nodeId === checkpoint.nodeId, 'generationKey scope collision');
        assertInvariant(
          existing.inputRefs.map((ref) => ref.artifactId).join('\0') === checkpoint.inputRefs.map((ref) => ref.artifactId).join('\0'),
          'generationKey input collision',
        );
        if (existing.status === 'COMMITTED') return existing;
        const existingUpdatedAt = Date.parse(existing.updatedAt);
        const requestedAt = Date.parse(checkpoint.updatedAt);
        const leaseExpired = existing.status === 'RUNNING'
          && Number.isFinite(existingUpdatedAt)
          && Number.isFinite(requestedAt)
          && requestedAt - existingUpdatedAt >= this.checkpointLeaseMs;
        assertInvariant(
          existing.status === 'FAILED' || leaseExpired,
          `checkpoint is already running: ${checkpoint.generationKey}`,
        );
        assertInvariant(
          checkpoint.retryCount === existing.retryCount + 1,
          `checkpoint retry fence is invalid: ${checkpoint.generationKey}`,
        );
        const result = this.database.prepare(`
          UPDATE checkpoints SET status = 'RUNNING', output_refs_json = '[]', retry_count = ?, updated_at = ?
          WHERE generation_key = ? AND status = ? AND retry_count = ? AND updated_at = ?
        `).run(
          checkpoint.retryCount, checkpoint.updatedAt, checkpoint.generationKey,
          existing.status, existing.retryCount, existing.updatedAt,
        );
        assertInvariant(Number(result.changes) === 1, `checkpoint claim conflict: ${checkpoint.generationKey}`);
      } else {
        assertInvariant(checkpoint.retryCount === 0, `new checkpoint retry fence is invalid: ${checkpoint.generationKey}`);
        this.database.prepare(`
          INSERT INTO checkpoints(
            generation_key, run_id, node_id, status, input_refs_json, output_refs_json, retry_count, updated_at
          ) VALUES (?, ?, ?, 'RUNNING', ?, '[]', ?, ?)
        `).run(
          checkpoint.generationKey, checkpoint.runId, checkpoint.nodeId,
          json(checkpoint.inputRefs), checkpoint.retryCount, checkpoint.updatedAt,
        );
      }
      return this.getCheckpoint(checkpoint.generationKey) as NodeCheckpoint;
    });
  }

  commitCheckpoint(
    generationKey: string, retryCount: number, outputRefs: ArtifactRef[], event: DomainEvent, now: string,
  ): NodeCheckpoint {
    return this.transaction(() => {
      const result = this.database.prepare(`
        UPDATE checkpoints SET status = 'COMMITTED', output_refs_json = ?, updated_at = ?
        WHERE generation_key = ? AND status = 'RUNNING' AND retry_count = ?
      `).run(json(outputRefs), now, generationKey, retryCount);
      assertInvariant(Number(result.changes) === 1, `checkpoint is not running: ${generationKey}`);
      this.insertEvent(event);
      return this.getCheckpoint(generationKey) as NodeCheckpoint;
    });
  }

  failCheckpoint(generationKey: string, retryCount: number, event: DomainEvent, now: string): NodeCheckpoint {
    return this.transaction(() => {
      const result = this.database.prepare(`
        UPDATE checkpoints SET status = 'FAILED', updated_at = ?
        WHERE generation_key = ? AND status = 'RUNNING' AND retry_count = ?
      `).run(now, generationKey, retryCount);
      assertInvariant(Number(result.changes) === 1, `checkpoint is not running: ${generationKey}`);
      this.insertEvent(event);
      return this.getCheckpoint(generationKey) as NodeCheckpoint;
    });
  }

  listAgentPromptConfigurations(): AgentPromptConfiguration[] {
    const rows = this.database.prepare(`
      SELECT agent_id, prompt_addon, revision, updated_at
      FROM agent_prompt_configurations ORDER BY agent_id
    `).all() as Record<string, unknown>[];
    return rows.map((row) => ({
      agentId: String(row.agent_id) as AgentId,
      promptAddon: String(row.prompt_addon),
      revision: Number(row.revision),
      updatedAt: String(row.updated_at),
    }));
  }

  saveAgentPromptConfiguration(
    configuration: AgentPromptConfiguration,
    event: DomainEvent,
  ): AgentPromptConfiguration {
    return this.transaction(() => {
      const current = this.database.prepare(`
        SELECT revision FROM agent_prompt_configurations WHERE agent_id = ?
      `).get(configuration.agentId) as { revision: number } | undefined;
      assertInvariant(
        configuration.revision === Number(current?.revision ?? 0) + 1,
        `agent prompt revision conflict: ${configuration.agentId}`,
      );
      this.database.prepare(`
        INSERT INTO agent_prompt_configurations(agent_id, prompt_addon, revision, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(agent_id) DO UPDATE SET
          prompt_addon = excluded.prompt_addon,
          revision = excluded.revision,
          updated_at = excluded.updated_at
      `).run(
        configuration.agentId,
        configuration.promptAddon,
        configuration.revision,
        configuration.updatedAt,
      );
      this.insertEvent(event);
      return structuredClone(configuration);
    });
  }

  saveRunConfiguration(
    snapshot: RunConfigurationSnapshot,
    event: DomainEvent,
  ): RunConfigurationSnapshot {
    return this.transaction(() => {
      assertInvariant(snapshot.runId === event.runId, 'run configuration event scope mismatch');
      const existing = this.getRunConfiguration(snapshot.runId);
      if (existing) {
        assertInvariant(json(existing) === json(snapshot), `run configuration is immutable: ${snapshot.runId}`);
        return existing;
      }
      this.database.prepare(`
        INSERT INTO run_configuration_snapshots(run_id, snapshot_json, captured_at)
        VALUES (?, ?, ?)
      `).run(snapshot.runId, json(snapshot), snapshot.capturedAt);
      this.insertEvent(event);
      return structuredClone(snapshot);
    });
  }

  getRunConfiguration(runId: string): RunConfigurationSnapshot | null {
    const row = this.database.prepare(`
      SELECT snapshot_json FROM run_configuration_snapshots WHERE run_id = ?
    `).get(runId) as Record<string, unknown> | undefined;
    return row ? parse<RunConfigurationSnapshot>(row.snapshot_json) : null;
  }

  recordWorkflowNodeProjection(projection: WorkflowNodeProjection, event: DomainEvent): void {
    this.transaction(() => {
      this.database.prepare(`
        INSERT INTO workflow_node_projections(
          run_id, node_id, agent_id, status, iteration, attempt, detail,
          error, ready_at, started_at, completed_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id, node_id, iteration, attempt) DO UPDATE SET
          agent_id = excluded.agent_id,
          status = excluded.status,
          detail = excluded.detail,
          error = excluded.error,
          ready_at = COALESCE(workflow_node_projections.ready_at, excluded.ready_at),
          started_at = COALESCE(workflow_node_projections.started_at, excluded.started_at),
          completed_at = excluded.completed_at,
          updated_at = excluded.updated_at
      `).run(
        projection.runId,
        projection.nodeId,
        projection.agentId,
        projection.status,
        projection.iteration,
        projection.attempt,
        projection.detail,
        projection.error,
        projection.readyAt,
        projection.startedAt,
        projection.completedAt,
        projection.updatedAt,
      );
      this.insertEvent(event);
    });
  }

  recordOperationalEvent(event: DomainEvent): void {
    this.transaction(() => this.insertEvent(event));
  }

  listWorkflowNodeProjections(runId: string): WorkflowNodeProjection[] {
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
      readyAt: row.ready_at === null ? null : String(row.ready_at),
      startedAt: row.started_at === null ? null : String(row.started_at),
      completedAt: row.completed_at === null ? null : String(row.completed_at),
      updatedAt: String(row.updated_at),
    }));
  }

  status(): Record<string, unknown> {
    const row = this.database.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'CANDIDATE' THEN 1 ELSE 0 END) AS candidates,
        SUM(CASE WHEN status = 'VERIFIED' THEN 1 ELSE 0 END) AS verified,
        SUM(CASE WHEN status = 'SUPERSEDED' THEN 1 ELSE 0 END) AS superseded,
        SUM(CASE WHEN quality_outcome = 'REJECTED' THEN 1 ELSE 0 END) AS quality_rejected
      FROM knowledge_versions
    `).get() as Record<string, unknown>;
    const feedback = this.database.prepare('SELECT COUNT(*) AS count FROM feedback').get() as Record<string, unknown>;
    const runs = this.database.prepare('SELECT COUNT(*) AS count FROM runs').get() as Record<string, unknown>;
    const publications = this.database.prepare('SELECT COUNT(*) AS count FROM publications').get() as Record<string, unknown>;
    return {
      ok: true,
      knowledgeTotal: Number(row.total ?? 0),
      candidates: Number(row.candidates ?? 0),
      verified: Number(row.verified ?? 0),
      superseded: Number(row.superseded ?? 0),
      qualityRejected: Number(row.quality_rejected ?? 0),
      feedbackEvents: Number(feedback.count ?? 0),
      runs: Number(runs.count ?? 0),
      publications: Number(publications.count ?? 0),
      database: this.databasePath,
    };
  }

  close(): void {
    this.database.close();
  }

  private requireKnowledgeVersion(versionId: string): KnowledgeVersion {
    const version = this.getKnowledgeVersion(versionId);
    assertInvariant(version !== null, `knowledge version not found: ${versionId}`);
    return version;
  }

  private runFromRow(row: Record<string, unknown>): FlywheelRun {
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

  private versionFromRow(row: Record<string, unknown>): KnowledgeVersion {
    return {
      versionId: String(row.version_id),
      moduleId: String(row.module_id),
      parentVersionId: row.parent_version_id === null ? null : String(row.parent_version_id),
      bodyRef: parse<ArtifactRef>(row.body_ref_json),
      provenance: parse(row.provenance_json),
      status: String(row.status) as KnowledgeStatus,
      qualityOutcome: String(row.quality_outcome) as KnowledgeVersion['qualityOutcome'],
      qualityScore: Number(row.quality_score),
      gateDecisionId: row.gate_decision_id === null ? null : String(row.gate_decision_id),
      title: String(row.title),
      description: String(row.description),
      category: String(row.category),
      tags: parse(row.tags_json),
      metadata: parse(row.metadata_json),
      createdAt: String(row.created_at),
    };
  }

  private checkpointFromRow(row: Record<string, unknown>): NodeCheckpoint {
    return {
      runId: String(row.run_id),
      nodeId: String(row.node_id),
      generationKey: String(row.generation_key),
      status: String(row.status) as NodeCheckpoint['status'],
      inputRefs: parse(row.input_refs_json),
      outputRefs: parse(row.output_refs_json),
      retryCount: Number(row.retry_count),
      updatedAt: String(row.updated_at),
    };
  }
}
