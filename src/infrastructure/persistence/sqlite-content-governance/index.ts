import {
  lstatSync, readFileSync, realpathSync, statSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { fetch as undiciFetch, type Dispatcher } from 'undici';
import type {
  ContentCommand, ContentGovernancePort,
} from '../../../application/apps/content-governance-app.ts';
import type {
  ArtifactStore, ProviderEndpointPolicy,
} from '../../../application/ports/index.ts';
import type {
  ArtifactRef, EvaluationReport, GateDecision, KnowledgeVersion, ProvenanceRef,
} from '../../../domain/index.ts';
import { assertInvariant, sha256 } from '../../../domain/index.ts';
import { structuredMarkdownDiff } from '../../../domain/services/markdown-diff.ts';
import {
  createPinnedHttpsDispatcher, PublicHttpsEndpointPolicy,
} from '../../security/public-https.ts';
import { projectActionItemObservation } from '../sqlite-action-items.ts';

type Row = Record<string, unknown>;

interface SourceAccess {
  locator: string;
  observedRevision: string;
  size: number;
  modifiedAt: string | null;
}

type SourceHttpsDispatcherFactory = (
  endpoint: { url: URL; addresses: readonly string[] },
  maxResponseSize: number,
) => Dispatcher;

interface SourceRow {
  source_id: string;
  kind: string;
  project_id: string;
  display_name: string;
  locator: string;
  pinned_revision: string;
  observed_revision: string;
  status: string;
  credential_ref: string | null;
  access_policy_ref: string;
  record_revision: number;
  last_sync_at: string | null;
  last_error_code: string | null;
  drift_json: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

function parse<T>(value: unknown): T {
  return JSON.parse(String(value)) as T;
}

function plainObject(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`ARGUMENT_INVALID: ${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertKeys(value: Record<string, unknown>, allowed: string[], name: string): void {
  const denied = Object.keys(value).filter((key) => !allowed.includes(key));
  if (denied.length) throw new Error(`ARGUMENT_INVALID: unsupported ${name} fields: ${denied.join(', ')}`);
}

function requiredString(value: unknown, name: string, maximum = 512): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum) {
    throw new Error(`ARGUMENT_INVALID: ${name} must be a non-empty string up to ${maximum} characters`);
  }
  return value.trim();
}

function optionalString(value: unknown, name: string, maximum = 512): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, name, maximum);
}

function safeIdentifier(value: unknown, name: string): string {
  const result = requiredString(value, name, 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(result)) {
    throw new Error(`ARGUMENT_INVALID: ${name} is invalid`);
  }
  return result;
}

function evaluationStatus(report: EvaluationReport, decision: GateDecision): 'PASSED' | 'FAILED' | 'ERROR' {
  if (report.infrastructureFailure) return 'ERROR';
  return decision.outcome === 'PASS' ? 'PASSED' : 'FAILED';
}

function windowMilliseconds(value: string): number {
  if (value === '24h') return 24 * 60 * 60 * 1_000;
  if (value === '7d') return 7 * 24 * 60 * 60 * 1_000;
  if (value === '30d') return 30 * 24 * 60 * 60 * 1_000;
  throw new Error('ARGUMENT_INVALID: window must be 24h, 7d, or 30d');
}

function errorCode(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const code = raw.split(':', 1)[0] ?? '';
  return /^[A-Z][A-Z0-9_]{1,63}$/.test(code) ? code : 'SOURCE_ACCESS_FAILED';
}

function sourcePathMatches(locator: string, provenance: ProvenanceRef): boolean {
  return provenance.path.replaceAll('\\', '/') === locator || provenance.url === locator;
}

/**
 * SQLite-backed DEV-008 read/write model. It shares the Registry transaction boundary but never
 * changes immutable knowledge, evaluation, gate, or publication rows.
 */
export class SQLiteContentGovernance implements ContentGovernancePort {
  private readonly database: DatabaseSync;
  private readonly artifacts: ArtifactStore;
  private readonly repositoryRoot: string;
  private readonly configuredRoots: string[];
  private readonly allowedRemoteHosts: Set<string>;
  private readonly remoteEndpointPolicy: ProviderEndpointPolicy;
  private readonly sourceHttpsDispatcherFactory: SourceHttpsDispatcherFactory;
  private readonly defaultRule: Record<string, unknown>;
  private readonly clock: () => string;

  constructor(input: {
    database: DatabaseSync;
    artifacts: ArtifactStore;
    repositoryRoot: string;
    configuredRoots: string[];
    allowedRemoteHosts?: string[];
    remoteEndpointPolicy?: ProviderEndpointPolicy;
    sourceHttpsDispatcherFactory?: SourceHttpsDispatcherFactory;
    defaultRule: Record<string, unknown>;
    clock?: () => string;
  }) {
    this.database = input.database;
    this.artifacts = input.artifacts;
    this.repositoryRoot = realpathSync(input.repositoryRoot);
    this.configuredRoots = input.configuredRoots.map((root) => (
      isAbsolute(root) ? resolve(root) : resolve(this.repositoryRoot, root)
    ));
    this.allowedRemoteHosts = new Set((input.allowedRemoteHosts ?? []).map((host) => host.toLowerCase()));
    this.remoteEndpointPolicy = input.remoteEndpointPolicy ?? new PublicHttpsEndpointPolicy();
    this.sourceHttpsDispatcherFactory = input.sourceHttpsDispatcherFactory
      ?? createPinnedHttpsDispatcher;
    this.defaultRule = structuredClone(input.defaultRule);
    this.clock = input.clock ?? (() => new Date().toISOString());
  }

  initialize(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS evaluation_rules (
        rule_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        scope_json TEXT NOT NULL,
        config_json TEXT NOT NULL,
        enabled INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        created_by TEXT NOT NULL,
        change_reason TEXT NOT NULL,
        audit_id TEXT NOT NULL UNIQUE,
        PRIMARY KEY(rule_id, revision)
      );
      CREATE TABLE IF NOT EXISTS evaluation_rule_bindings (
        report_id TEXT PRIMARY KEY,
        rule_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        bound_at TEXT NOT NULL,
        FOREIGN KEY(report_id) REFERENCES evaluations(report_id),
        FOREIGN KEY(rule_id, revision) REFERENCES evaluation_rules(rule_id, revision)
      );
      CREATE TABLE IF NOT EXISTS sources (
        source_id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        project_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        locator TEXT NOT NULL,
        pinned_revision TEXT NOT NULL,
        observed_revision TEXT NOT NULL,
        status TEXT NOT NULL,
        credential_ref TEXT,
        access_policy_ref TEXT NOT NULL,
        record_revision INTEGER NOT NULL,
        last_sync_at TEXT,
        last_error_code TEXT,
        drift_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS sources_active_identity
        ON sources(project_id, kind, locator) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS sources_updated
        ON sources(updated_at DESC, source_id DESC);
      CREATE TABLE IF NOT EXISTS source_refresh_jobs (
        job_id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        status TEXT NOT NULL,
        previous_revision TEXT NOT NULL,
        observed_revision TEXT,
        reason_code TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        actor TEXT NOT NULL,
        FOREIGN KEY(source_id) REFERENCES sources(source_id)
      );
      CREATE TABLE IF NOT EXISTS source_audit (
        audit_id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        action TEXT NOT NULL,
        from_revision INTEGER,
        to_revision INTEGER NOT NULL,
        reason TEXT NOT NULL,
        actor TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        changes_json TEXT NOT NULL,
        FOREIGN KEY(source_id) REFERENCES sources(source_id)
      );
      CREATE INDEX IF NOT EXISTS source_audit_item
        ON source_audit(source_id, occurred_at, audit_id);
      CREATE TABLE IF NOT EXISTS content_command_receipts (
        scope TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        response_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(scope, idempotency_key)
      );
    `);
    const now = this.clock();
    this.database.prepare(`
      INSERT OR IGNORE INTO evaluation_rules(
        rule_id, revision, scope_json, config_json, enabled,
        created_at, created_by, change_reason, audit_id
      ) VALUES ('publication-gate', 1, ?, ?, 1, ?, 'system', 'Initial deterministic publication gate', ?)
    `).run(json({ kind: 'GLOBAL' }), json(this.defaultRule), now, `audit_${randomUUID()}`);
    this.database.exec(`
      DROP TRIGGER IF EXISTS evaluations_bind_active_rule;
      CREATE TRIGGER evaluations_bind_active_rule
      AFTER INSERT ON evaluations
      BEGIN
        INSERT OR IGNORE INTO evaluation_rule_bindings(report_id, rule_id, revision, bound_at)
        SELECT NEW.report_id, rule_id, revision, NEW.created_at
        FROM evaluation_rules
        WHERE rule_id = 'publication-gate'
          AND json_extract(config_json, '$.policyId') = (
            SELECT policy_id FROM runs WHERE run_id = NEW.run_id
          )
        ORDER BY revision DESC LIMIT 1;
      END;
      DELETE FROM evaluation_rule_bindings
      WHERE report_id IN (
        SELECT binding.report_id
        FROM evaluation_rule_bindings AS binding
        INNER JOIN evaluations AS evaluation ON evaluation.report_id = binding.report_id
        INNER JOIN runs AS run ON run.run_id = evaluation.run_id
        INNER JOIN evaluation_rules AS rule
          ON rule.rule_id = binding.rule_id AND rule.revision = binding.revision
        WHERE json_extract(rule.config_json, '$.policyId') <> run.policy_id
          OR julianday(rule.created_at) IS NULL
          OR julianday(evaluation.created_at) IS NULL
          OR julianday(rule.created_at) > julianday(evaluation.created_at)
      );
      INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (8, datetime('now'));
    `);
  }

  getKnowledgeLineage(versionId: string): Record<string, unknown> | null {
    const targetRow = this.database.prepare('SELECT * FROM knowledge_versions WHERE version_id = ?')
      .get(versionId) as Row | undefined;
    if (!targetRow) return null;
    const target = this.versionFromRow(targetRow);
    const rows = this.database.prepare(`
      SELECT * FROM knowledge_versions WHERE module_id = ? ORDER BY created_at, rowid
    `).all(target.moduleId) as Row[];
    const versions = rows.map((row) => this.versionFromRow(row));
    const byId = new Map(versions.map((version) => [version.versionId, version]));
    const relevant = new Set<string>([target.versionId]);
    let parentId = target.parentVersionId;
    while (parentId && byId.has(parentId) && !relevant.has(parentId)) {
      relevant.add(parentId);
      parentId = byId.get(parentId)?.parentVersionId ?? null;
    }
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const version of versions) {
        if (version.parentVersionId && relevant.has(version.parentVersionId) && !relevant.has(version.versionId)) {
          relevant.add(version.versionId);
          expanded = true;
        }
      }
    }
    const lineageVersions = versions.filter((version) => relevant.has(version.versionId));
    const evaluationRows = this.database.prepare(`
      SELECT evaluation.report_json, decision.decision_json, binding.rule_id, binding.revision
      FROM evaluations AS evaluation
      LEFT JOIN gate_decisions AS decision
        ON decision.run_id = evaluation.run_id AND decision.version_id = evaluation.version_id
      LEFT JOIN evaluation_rule_bindings AS binding ON binding.report_id = evaluation.report_id
      WHERE evaluation.version_id IN (
        SELECT version_id FROM knowledge_versions WHERE module_id = ?
      ) ORDER BY evaluation.created_at, evaluation.report_id
    `).all(target.moduleId) as Row[];
    const evaluations = evaluationRows.map((row) => {
      const report = parse<EvaluationReport>(row.report_json);
      const decision = row.decision_json === null ? null : parse<GateDecision>(row.decision_json);
      return {
        evaluationId: report.reportId,
        runId: report.runId,
        versionId: report.versionId,
        gate: decision?.outcome ?? null,
        ruleRef: row.rule_id === null ? null : { ruleId: String(row.rule_id), revision: Number(row.revision) },
        ruleBinding: row.rule_id === null
          ? { status: 'UNBOUND', reasonCode: 'RULE_REVISION_NOT_PROVABLE' }
          : { status: 'BOUND', reasonCode: 'RULE_REVISION_BOUND' },
        href: `/api/v1/evaluations/${encodeURIComponent(report.reportId)}`,
      };
    }).filter((entry) => relevant.has(entry.versionId));
    const runIds = [...new Set(evaluations.map((entry) => entry.runId))];
    const lineageBodyIds = new Set(lineageVersions.map((version) => version.bodyRef.artifactId));
    for (const row of this.database.prepare('SELECT run_id, output_refs_json FROM checkpoints').all() as Row[]) {
      const refs = parse<ArtifactRef[]>(row.output_refs_json);
      if (refs.some((ref) => lineageBodyIds.has(ref.artifactId))) runIds.push(String(row.run_id));
    }
    const uniqueRunIds = [...new Set(runIds)];
    const runs = uniqueRunIds.map((runId) => {
      const row = this.database.prepare('SELECT state, iteration, updated_at FROM runs WHERE run_id = ?')
        .get(runId) as Row | undefined;
      return row ? {
        runId,
        state: String(row.state),
        iteration: Number(row.iteration),
        updatedAt: String(row.updated_at),
        href: `/api/v1/runs/${encodeURIComponent(runId)}`,
      } : null;
    }).filter((value) => value !== null);
    const publications = (this.database.prepare(`
      SELECT publication_key, version_id, policy_id, decision_id, published_at
      FROM publications WHERE module_id = ? ORDER BY published_at, publication_key
    `).all(target.moduleId) as Row[]).map((row) => ({
      publicationKey: String(row.publication_key),
      versionId: String(row.version_id),
      policyId: String(row.policy_id),
      decisionId: String(row.decision_id),
      publishedAt: String(row.published_at),
    })).filter((entry) => relevant.has(entry.versionId));
    const corrections = lineageVersions.flatMap((version) => {
      const correctionIds = [
        ...(typeof version.metadata.correctionId === 'string' ? [version.metadata.correctionId] : []),
        ...(Array.isArray(version.metadata.correctionIds)
          ? version.metadata.correctionIds.filter((value): value is string => typeof value === 'string')
          : []),
      ].filter((value, index, values) => values.indexOf(value) === index);
      return correctionIds.map((correctionId) => ({
        correctionId,
        fromVersionId: version.parentVersionId,
        toVersionId: version.versionId,
        evidenceRefs: Array.isArray(version.metadata.correctionEvidenceRefs)
          ? version.metadata.correctionEvidenceRefs
          : [],
      }));
    });
    return {
      target: this.versionSummary(target),
      nodes: lineageVersions.map((version) => this.versionSummary(version)),
      edges: lineageVersions.filter((version) => version.parentVersionId && relevant.has(version.parentVersionId))
        .map((version) => ({
          type: 'PARENT_OF', fromVersionId: version.parentVersionId, toVersionId: version.versionId,
        })),
      relations: {
        runs,
        evaluations,
        corrections,
        publications,
        provenance: target.provenance,
      },
      sampledAt: this.clock(),
    };
  }

  async getKnowledgeDiff(versionId: string, againstVersionId: string): Promise<Record<string, unknown> | null> {
    const targetRow = this.database.prepare('SELECT * FROM knowledge_versions WHERE version_id = ?')
      .get(versionId) as Row | undefined;
    if (!targetRow) return null;
    const againstRow = this.database.prepare('SELECT * FROM knowledge_versions WHERE version_id = ?')
      .get(againstVersionId) as Row | undefined;
    if (!againstRow) throw new Error(`KNOWLEDGE_VERSION_NOT_FOUND: ${againstVersionId}`);
    const target = this.versionFromRow(targetRow);
    const against = this.versionFromRow(againstRow);
    if (target.moduleId !== against.moduleId) {
      throw new Error('DIFF_SCOPE_INVALID: versions must belong to the same module');
    }
    const [beforeBytes, afterBytes] = await Promise.all([
      this.artifacts.get(against.bodyRef),
      this.artifacts.get(target.bodyRef),
    ]);
    const diff = structuredMarkdownDiff(
      Buffer.from(beforeBytes).toString('utf8'),
      Buffer.from(afterBytes).toString('utf8'),
    );
    return {
      against: this.versionSummary(against),
      target: this.versionSummary(target),
      ...diff,
      sampledAt: this.clock(),
    };
  }

  listEvaluations(filters: Record<string, string> = {}): Record<string, unknown>[] {
    const rows = this.database.prepare(`
      SELECT evaluation.report_json, decision.decision_json,
        knowledge.module_id, binding.rule_id, binding.revision AS rule_revision
      FROM evaluations AS evaluation
      INNER JOIN knowledge_versions AS knowledge ON knowledge.version_id = evaluation.version_id
      LEFT JOIN gate_decisions AS decision
        ON decision.run_id = evaluation.run_id AND decision.version_id = evaluation.version_id
      LEFT JOIN evaluation_rule_bindings AS binding ON binding.report_id = evaluation.report_id
      ORDER BY evaluation.created_at DESC, evaluation.report_id DESC
    `).all() as Row[];
    return rows.flatMap((row) => {
      const report = parse<EvaluationReport>(row.report_json);
      if (row.decision_json === null) return [];
      const decision = parse<GateDecision>(row.decision_json);
      const item = this.evaluationSummary(report, decision, String(row.module_id), row);
      return (
        (!filters.runId || item.runId === filters.runId)
        && (!filters.moduleId || item.moduleId === filters.moduleId)
        && (!filters.gate || item.gate === filters.gate)
        && (!filters.status || item.status === filters.status)
        && (!filters.from || item.createdAt >= filters.from)
        && (!filters.to || item.createdAt <= filters.to)
      ) ? [item] : [];
    });
  }

  getEvaluation(evaluationId: string): Record<string, unknown> | null {
    const row = this.evaluationRow(evaluationId);
    if (!row || row.decision_json === null) return null;
    const report = parse<EvaluationReport>(row.report_json);
    const decision = parse<GateDecision>(row.decision_json);
    return {
      ...this.evaluationSummary(report, decision, String(row.module_id), row),
      report,
      decision,
      immutable: true,
    };
  }

  listEvaluationArtifacts(evaluationId: string, downloadsAuthorized: boolean): Record<string, unknown> | null {
    const row = this.evaluationRow(evaluationId);
    if (!row) return null;
    const report = parse<EvaluationReport>(row.report_json);
    return {
      evaluationId,
      items: report.evidenceRefs.map((ref) => ({
        relation: 'EVIDENCE',
        ref,
        contentAddressed: ref.artifactId === `sha256:${ref.sha256}`,
        downloadUrl: downloadsAuthorized
          ? `/api/v1/evaluations/${encodeURIComponent(evaluationId)}/artifacts/${encodeURIComponent(ref.artifactId)}`
          : null,
      })),
      sampledAt: this.clock(),
    };
  }

  async getEvaluationArtifact(
    evaluationId: string,
    artifactId: string,
  ): Promise<{ ref: ArtifactRef; bytes: Uint8Array } | null> {
    const row = this.evaluationRow(evaluationId);
    if (!row) return null;
    const report = parse<EvaluationReport>(row.report_json);
    const ref = report.evidenceRefs.find((candidate) => candidate.artifactId === artifactId);
    if (!ref) return null;
    return { ref, bytes: await this.artifacts.get(ref) };
  }

  listEvaluationRules(): Record<string, unknown>[] {
    const rows = this.database.prepare(`
      SELECT rule.* FROM evaluation_rules AS rule
      INNER JOIN (
        SELECT rule_id, MAX(revision) AS revision FROM evaluation_rules GROUP BY rule_id
      ) AS head ON head.rule_id = rule.rule_id AND head.revision = rule.revision
      ORDER BY rule.rule_id
    `).all() as Row[];
    return rows.map((row) => this.ruleFromRow(row));
  }

  getEvaluationRule(ruleId: string): Record<string, unknown> | null {
    const rows = this.database.prepare(`
      SELECT * FROM evaluation_rules WHERE rule_id = ? ORDER BY revision DESC
    `).all(ruleId) as Row[];
    if (!rows.length) return null;
    return {
      current: this.ruleFromRow(rows[0] as Row),
      history: rows.map((row) => this.ruleFromRow(row)),
    };
  }

  updateEvaluationRule(
    ruleId: string,
    input: Record<string, unknown>,
    command: ContentCommand,
  ): Record<string, unknown> {
    const scope = `evaluation-rule:${ruleId}`;
    const replay = this.receipt(scope, command);
    if (replay) return replay;
    assertKeys(input, ['expectedRevision', 'reason', 'scope', 'config', 'enabled'], 'evaluation rule');
    const expectedRevision = Number(input.expectedRevision);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
      throw new Error('ARGUMENT_INVALID: expectedRevision must be a positive integer');
    }
    const reason = requiredString(input.reason, 'reason', 1_000);
    const currentRow = this.database.prepare(`
      SELECT * FROM evaluation_rules WHERE rule_id = ? ORDER BY revision DESC LIMIT 1
    `).get(ruleId) as Row | undefined;
    if (!currentRow) throw new Error(`EVALUATION_RULE_NOT_FOUND: ${ruleId}`);
    if (Number(currentRow.revision) !== expectedRevision) {
      throw new Error('REVISION_CONFLICT: evaluation rule changed');
    }
    const current = this.ruleFromRow(currentRow);
    const nextScope = input.scope === undefined ? current.scope : plainObject(input.scope, 'scope');
    const nextConfig = input.config === undefined ? current.config : plainObject(input.config, 'config');
    this.assertPublicationRule(nextScope, nextConfig, String(current.config.policyId ?? ''));
    if (Buffer.byteLength(json(nextScope)) > 16_384 || Buffer.byteLength(json(nextConfig)) > 16_384) {
      throw new Error('ARGUMENT_INVALID: evaluation rule configuration is too large');
    }
    const enabled = input.enabled === undefined ? current.enabled : input.enabled;
    if (typeof enabled !== 'boolean') throw new Error('ARGUMENT_INVALID: enabled must be boolean');
    const now = this.clock();
    const nextRevision = expectedRevision + 1;
    const value = this.transaction(() => {
      const latest = this.database.prepare(`
        SELECT revision FROM evaluation_rules WHERE rule_id = ? ORDER BY revision DESC LIMIT 1
      `).get(ruleId) as Row | undefined;
      if (Number(latest?.revision) !== expectedRevision) throw new Error('REVISION_CONFLICT: evaluation rule changed');
      const auditId = `audit_${randomUUID()}`;
      this.database.prepare(`
        INSERT INTO evaluation_rules(
          rule_id, revision, scope_json, config_json, enabled,
          created_at, created_by, change_reason, audit_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(ruleId, nextRevision, json(nextScope), json(nextConfig), enabled ? 1 : 0,
        now, command.actor, reason, auditId);
      const rule = this.ruleFromRow(this.database.prepare(`
        SELECT * FROM evaluation_rules WHERE rule_id = ? AND revision = ?
      `).get(ruleId, nextRevision) as Row);
      const result = {
        resourceId: ruleId,
        eventId: auditId,
        revision: nextRevision,
        acceptedAt: now,
        rule,
        replayed: false,
      };
      this.saveReceipt(scope, command, result, now);
      return result;
    });
    return value;
  }

  listSources(filters: Record<string, string> = {}): Record<string, unknown>[] {
    const rows = this.database.prepare(`
      SELECT * FROM sources ORDER BY updated_at DESC, source_id DESC
    `).all() as unknown as SourceRow[];
    return rows.filter((row) => row.deleted_at === null).map((row) => this.sourceFromRow(row)).filter((source) => (
      (!filters.kind || source.kind === filters.kind)
      && (!filters.type || source.kind === filters.type)
      && (!filters.status || source.status === filters.status)
      && (!filters.project || source.project === filters.project)
    ));
  }

  getSource(sourceId: string): Record<string, unknown> | null {
    const row = this.sourceRow(sourceId);
    if (!row) return null;
    const jobs = (this.database.prepare(`
      SELECT job_id, status, previous_revision, observed_revision, reason_code,
        started_at, completed_at, actor FROM source_refresh_jobs
      WHERE source_id = ? ORDER BY started_at DESC, job_id DESC LIMIT 20
    `).all(sourceId) as Row[]).map((entry) => ({
      jobId: String(entry.job_id),
      status: String(entry.status),
      previousRevision: String(entry.previous_revision),
      observedRevision: entry.observed_revision === null ? null : String(entry.observed_revision),
      reasonCode: entry.reason_code === null ? null : String(entry.reason_code),
      startedAt: String(entry.started_at),
      completedAt: String(entry.completed_at),
      actor: String(entry.actor),
    }));
    const audit = (this.database.prepare(`
      SELECT audit_id, action, from_revision, to_revision, reason, actor, occurred_at, changes_json
      FROM source_audit WHERE source_id = ? ORDER BY occurred_at, audit_id
    `).all(sourceId) as Row[]).map((entry) => ({
      auditId: String(entry.audit_id),
      action: String(entry.action),
      fromRevision: entry.from_revision === null ? null : Number(entry.from_revision),
      toRevision: Number(entry.to_revision),
      reason: String(entry.reason),
      actor: String(entry.actor),
      occurredAt: String(entry.occurred_at),
      changes: parse<Record<string, unknown>>(entry.changes_json),
    }));
    return { ...this.sourceFromRow(row), refreshJobs: jobs, audit };
  }

  async createSource(
    input: Record<string, unknown>,
    command: ContentCommand,
  ): Promise<Record<string, unknown>> {
    const scope = 'source:create';
    const replay = this.receipt(scope, command);
    if (replay) return replay;
    assertKeys(input, ['kind', 'type', 'locator', 'displayName', 'project', 'credentialRef', 'revision'], 'source');
    const kind = requiredString(input.kind ?? input.type, 'kind').toUpperCase();
    if (!['FILE', 'HTTPS'].includes(kind)) throw new Error(`SOURCE_KIND_UNSUPPORTED: ${kind}`);
    const project = input.project === undefined ? 'default' : safeIdentifier(input.project, 'project');
    const credentialRef = optionalString(input.credentialRef, 'credentialRef', 256);
    this.validateCredentialRef(kind, credentialRef);
    const access = await this.validateSourceAccess(
      kind, requiredString(input.locator, 'locator', 2_048), credentialRef,
    );
    const requestedRevision = optionalString(input.revision, 'revision', 256);
    if (requestedRevision && requestedRevision !== access.observedRevision) {
      throw new Error('SOURCE_REVISION_INVALID: requested revision does not match observed content');
    }
    const displayName = optionalString(input.displayName, 'displayName', 200)
      ?? access.locator.split('/').at(-1)
      ?? access.locator;
    const now = this.clock();
    return this.transaction(() => {
      if (this.receipt(scope, command)) return this.receipt(scope, command) as Record<string, unknown>;
      const duplicate = this.database.prepare(`
        SELECT source_id FROM sources
        WHERE project_id = ? AND kind = ? AND locator = ? AND deleted_at IS NULL
      `).get(project, kind, access.locator) as Row | undefined;
      if (duplicate) throw new Error(`SOURCE_ALREADY_EXISTS: ${String(duplicate.source_id)}`);
      const sourceId = `src_${randomUUID().replaceAll('-', '').slice(0, 24)}`;
      this.database.prepare(`
        INSERT INTO sources(
          source_id, kind, project_id, display_name, locator, pinned_revision,
          observed_revision, status, credential_ref, access_policy_ref,
          record_revision, last_sync_at, last_error_code, drift_json,
          created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?,
          1, ?, NULL, NULL, ?, ?, NULL)
      `).run(sourceId, kind, project, displayName, access.locator,
        requestedRevision ?? access.observedRevision, access.observedRevision,
        credentialRef ?? null,
        kind === 'FILE' ? 'configured-acquisition-roots' : 'remote-host-allowlist',
        now, now, now);
      const auditId = this.insertSourceAudit(sourceId, 'CREATE', null, 1, 'Source registered after access validation',
        command.actor, now, { kind, locator: access.locator, observedRevision: access.observedRevision });
      const result = {
        resourceId: sourceId,
        eventId: auditId,
        revision: 1,
        acceptedAt: now,
        source: this.getSource(sourceId),
        replayed: false,
      };
      this.saveReceipt(scope, command, result, now);
      return result;
    });
  }

  async updateSource(
    sourceId: string,
    input: Record<string, unknown>,
    command: ContentCommand,
  ): Promise<Record<string, unknown>> {
    const scope = `source:update:${sourceId}`;
    const replay = this.receipt(scope, command);
    if (replay) return replay;
    assertKeys(input, ['expectedRevision', 'reason', 'displayName', 'enabled', 'locator', 'revision', 'credentialRef'], 'source update');
    const expectedRevision = Number(input.expectedRevision);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
      throw new Error('ARGUMENT_INVALID: expectedRevision must be a positive integer');
    }
    const reason = requiredString(input.reason, 'reason', 1_000);
    const current = this.sourceRow(sourceId);
    if (!current) throw new Error(`SOURCE_NOT_FOUND: ${sourceId}`);
    if (current.deleted_at !== null) throw new Error('SOURCE_DELETED: source is archived');
    if (current.record_revision !== expectedRevision) throw new Error('REVISION_CONFLICT: source changed');
    const displayName = optionalString(input.displayName, 'displayName', 200) ?? current.display_name;
    const enabled = input.enabled === undefined ? current.status !== 'DISABLED' : input.enabled;
    if (typeof enabled !== 'boolean') throw new Error('ARGUMENT_INVALID: enabled must be boolean');
    let access: SourceAccess | null = null;
    const requestedLocator = input.locator === undefined
      ? current.locator
      : requiredString(input.locator, 'locator', 2_048);
    const requestedPinned = optionalString(input.revision, 'revision', 256);
    const credentialRef = input.credentialRef === undefined
      ? current.credential_ref
      : input.credentialRef === null ? null : requiredString(input.credentialRef, 'credentialRef', 256);
    this.validateCredentialRef(current.kind, credentialRef ?? undefined);
    const enabling = input.enabled === true && current.status === 'DISABLED';
    if (input.locator !== undefined || requestedPinned !== undefined
      || input.credentialRef !== undefined || enabling) {
      access = await this.validateSourceAccess(current.kind, requestedLocator, credentialRef ?? undefined);
      if (requestedPinned && requestedPinned !== access.observedRevision) {
        throw new Error('SOURCE_REVISION_INVALID: revision must match currently observed content');
      }
    }
    const now = this.clock();
    const nextRevision = expectedRevision + 1;
    return this.transaction(() => {
      const concurrentReplay = this.receipt(scope, command);
      if (concurrentReplay) return concurrentReplay;
      const latest = this.sourceRow(sourceId);
      if (!latest) throw new Error(`SOURCE_NOT_FOUND: ${sourceId}`);
      if (latest.record_revision !== expectedRevision) throw new Error('REVISION_CONFLICT: source changed');
      const observedRevision = access?.observedRevision ?? latest.observed_revision;
      const pinnedRevision = requestedPinned
        ?? (input.locator !== undefined ? observedRevision : latest.pinned_revision);
      const stale = pinnedRevision !== observedRevision;
      const status = !enabled
        ? 'DISABLED'
        : access === null ? latest.status
          : stale ? 'STALE' : 'ACTIVE';
      const drift = access === null
        ? latest.drift_json
        : stale ? json({
            detected: true,
            pinnedRevision,
            observedRevision,
            detectedAt: now,
          }) : null;
      const lastErrorCode = access === null ? latest.last_error_code : null;
      this.database.prepare(`
        UPDATE sources SET display_name = ?, locator = ?, pinned_revision = ?,
          observed_revision = ?, status = ?, record_revision = ?, last_sync_at = ?,
          last_error_code = ?, drift_json = ?, credential_ref = ?, updated_at = ?
        WHERE source_id = ? AND record_revision = ?
      `).run(displayName, access?.locator ?? latest.locator, pinnedRevision,
        observedRevision, status, nextRevision, access ? now : latest.last_sync_at,
        lastErrorCode, drift, credentialRef, now, sourceId, expectedRevision);
      const auditId = this.insertSourceAudit(sourceId, 'UPDATE', expectedRevision, nextRevision, reason,
        command.actor, now, {
          displayName,
          enabled,
          locatorChanged: input.locator !== undefined,
          revisionChanged: requestedPinned !== undefined,
          credentialChanged: input.credentialRef !== undefined,
        });
      if (access !== null && status === 'STALE') {
        this.projectSourceActionItem(
          sourceId,
          'SOURCE_DRIFT',
          'MEDIUM',
          'SOURCE_REVISION_DRIFT',
          '来源内容与固定版本不一致，需要人工复核',
          auditId,
          now,
        );
      }
      const result = {
        resourceId: sourceId,
        eventId: auditId,
        revision: nextRevision,
        acceptedAt: now,
        source: this.getSource(sourceId),
        replayed: false,
      };
      this.saveReceipt(scope, command, result, now);
      return result;
    });
  }

  async refreshSource(sourceId: string, command: ContentCommand): Promise<Record<string, unknown>> {
    const scope = `source:refresh:${sourceId}`;
    const replay = this.receipt(scope, command);
    if (replay) return replay;
    const current = this.sourceRow(sourceId);
    if (!current) throw new Error(`SOURCE_NOT_FOUND: ${sourceId}`);
    if (current.deleted_at !== null) throw new Error('SOURCE_DELETED: source is archived');
    if (current.status === 'DISABLED') throw new Error('SOURCE_DISABLED: source is disabled');
    const startedAt = this.clock();
    let access: SourceAccess | null = null;
    let failure: string | null = null;
    try {
      access = await this.validateSourceAccess(
        current.kind, current.locator, current.credential_ref ?? undefined,
      );
    } catch (error) {
      failure = errorCode(error);
    }
    const completedAt = this.clock();
    return this.transaction(() => {
      const concurrentReplay = this.receipt(scope, command);
      if (concurrentReplay) return concurrentReplay;
      const latest = this.sourceRow(sourceId);
      if (!latest) throw new Error(`SOURCE_NOT_FOUND: ${sourceId}`);
      if (latest.record_revision !== current.record_revision) {
        throw new Error('REVISION_CONFLICT: source changed during refresh');
      }
      const nextRevision = latest.record_revision + 1;
      const jobId = `job_${sha256(`${sourceId}\0${command.idempotencyKey}`).slice(0, 24)}`;
      const observedRevision = access?.observedRevision ?? null;
      const stale = access !== null && access.observedRevision !== latest.pinned_revision;
      const status = failure ? 'DEGRADED' : stale ? 'STALE' : 'ACTIVE';
      const drift = stale ? {
        detected: true,
        pinnedRevision: latest.pinned_revision,
        observedRevision: access?.observedRevision,
        detectedAt: completedAt,
      } : null;
      this.database.prepare(`
        INSERT INTO source_refresh_jobs(
          job_id, source_id, status, previous_revision, observed_revision,
          reason_code, started_at, completed_at, actor
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(jobId, sourceId, failure ? 'FAILED' : 'SUCCEEDED', latest.observed_revision,
        observedRevision, failure, startedAt, completedAt, command.actor);
      this.database.prepare(`
        UPDATE sources SET observed_revision = ?, status = ?, record_revision = ?,
          last_sync_at = ?, last_error_code = ?, drift_json = ?, updated_at = ?
        WHERE source_id = ?
      `).run(observedRevision ?? latest.observed_revision, status, nextRevision,
        failure ? latest.last_sync_at : completedAt, failure,
        drift === null ? null : json(drift), completedAt, sourceId);
      const auditId = this.insertSourceAudit(sourceId, 'REFRESH', latest.record_revision, nextRevision,
        failure ? 'Source access validation failed' : 'Source refresh completed', command.actor,
        completedAt, { jobId, status: failure ? 'FAILED' : 'SUCCEEDED', reasonCode: failure,
          observedRevision });
      if (failure) {
        this.projectSourceActionItem(
          sourceId,
          'SOURCE_UNAVAILABLE',
          'HIGH',
          failure,
          '来源访问失败，需要检查访问边界或来源可用性',
          auditId,
          completedAt,
        );
      } else if (stale) {
        this.projectSourceActionItem(
          sourceId,
          'SOURCE_DRIFT',
          'MEDIUM',
          'SOURCE_REVISION_DRIFT',
          '来源内容与固定版本不一致，需要人工复核',
          auditId,
          completedAt,
        );
      }
      const result = {
        resourceId: sourceId,
        eventId: auditId,
        revision: nextRevision,
        acceptedAt: completedAt,
        jobId,
        status: failure ? 'FAILED' : 'SUCCEEDED',
        reasonCode: failure,
        source: this.getSource(sourceId),
        replayed: false,
      };
      this.saveReceipt(scope, command, result, completedAt);
      return result;
    });
  }

  getKnowledgeHealth(window: string): Record<string, unknown> {
    const duration = windowMilliseconds(window);
    const sampledAt = this.clock();
    const sampledMs = Date.parse(sampledAt);
    if (!Number.isFinite(sampledMs)) throw new Error('INTERNAL_ERROR: clock returned an invalid timestamp');
    const start = new Date(sampledMs - duration).toISOString();
    const sources = (this.database.prepare(`
      SELECT * FROM sources WHERE deleted_at IS NULL AND status <> 'DISABLED'
    `).all() as unknown as SourceRow[]).map((row) => this.sourceFromRow(row));
    const freshnessNumerator = sources.filter((source) => (
      source.status === 'ACTIVE' && typeof source.lastSyncAt === 'string' && source.lastSyncAt >= start
    )).length;
    const coverageNumerator = sources.filter((source) => {
      const knowledge = source.knowledge as { verified: number };
      return knowledge.verified > 0;
    }).length;
    const evaluationRows = this.database.prepare(`
      SELECT evaluation.report_json, decision.decision_json
      FROM evaluations AS evaluation
      INNER JOIN gate_decisions AS decision
        ON decision.run_id = evaluation.run_id AND decision.version_id = evaluation.version_id
      WHERE evaluation.created_at >= ? AND evaluation.created_at <= ?
    `).all(start, sampledAt) as Row[];
    const qualityNumerator = evaluationRows.filter((row) => (
      parse<GateDecision>(row.decision_json).outcome === 'PASS'
      && !parse<EvaluationReport>(row.report_json).infrastructureFailure
    )).length;
    const metric = (numerator: number, denominator: number) => denominator === 0 ? {
      status: 'unavailable', value: null, numerator: null, denominator: null,
      unit: 'ratio', window, sampledAt, ruleVersion: 'knowledge-health-v1',
    } : {
      status: 'available', value: Number((numerator / denominator).toFixed(4)),
      numerator, denominator, unit: 'ratio', window, sampledAt, ruleVersion: 'knowledge-health-v1',
    };
    const metrics = {
      freshness: metric(freshnessNumerator, sources.length),
      coverage: metric(coverageNumerator, sources.length),
      quality: metric(qualityNumerator, evaluationRows.length),
    };
    const available = Object.values(metrics).every((value) => value.status === 'available');
    const values = Object.values(metrics).map((value) => value.value).filter((value): value is number => value !== null);
    return {
      window: { key: window, start, end: sampledAt },
      sampledAt,
      ruleVersion: 'knowledge-health-v1',
      overall: available ? {
        status: 'available',
        value: Number((values.reduce((sum, value) => sum + value, 0) / values.length * 100).toFixed(1)),
        unit: 'score-out-of-100',
      } : { status: 'unavailable', value: null, unit: 'score-out-of-100' },
      metrics,
    };
  }

  private evaluationRow(evaluationId: string): Row | null {
    const row = this.database.prepare(`
      SELECT evaluation.report_json, decision.decision_json,
        knowledge.module_id, binding.rule_id, binding.revision AS rule_revision
      FROM evaluations AS evaluation
      INNER JOIN knowledge_versions AS knowledge ON knowledge.version_id = evaluation.version_id
      LEFT JOIN gate_decisions AS decision
        ON decision.run_id = evaluation.run_id AND decision.version_id = evaluation.version_id
      LEFT JOIN evaluation_rule_bindings AS binding ON binding.report_id = evaluation.report_id
      WHERE evaluation.report_id = ?
    `).get(evaluationId) as Row | undefined;
    return row ?? null;
  }

  private evaluationSummary(
    report: EvaluationReport,
    decision: GateDecision,
    moduleId: string,
    row: Row,
  ): Record<string, unknown> & {
    evaluationId: string; runId: string; moduleId: string; gate: string; status: string; createdAt: string;
  } {
    return {
      evaluationId: report.reportId,
      runId: report.runId,
      moduleId,
      versionId: report.versionId,
      status: evaluationStatus(report, decision),
      gate: decision.outcome,
      reasonCodes: decision.reasonCodes,
      tests: {
        passed: report.testsPassed,
        total: report.testsTotal,
        criticalFailures: report.criticalFailures,
      },
      stability: report.stability,
      toolchainFingerprint: report.toolchainFingerprint,
      ruleRef: row.rule_id === null ? null : {
        ruleId: String(row.rule_id), revision: Number(row.rule_revision),
      },
      ruleBinding: row.rule_id === null
        ? { status: 'UNBOUND', reasonCode: 'RULE_REVISION_NOT_PROVABLE' }
        : { status: 'BOUND', reasonCode: 'RULE_REVISION_BOUND' },
      createdAt: report.createdAt,
      links: {
        run: `/api/v1/runs/${encodeURIComponent(report.runId)}`,
        knowledge: `/api/v1/knowledge/${encodeURIComponent(report.versionId)}`,
        artifacts: `/api/v1/evaluations/${encodeURIComponent(report.reportId)}/artifacts`,
      },
    };
  }

  private versionFromRow(row: Row): KnowledgeVersion {
    return {
      versionId: String(row.version_id),
      moduleId: String(row.module_id),
      parentVersionId: row.parent_version_id === null ? null : String(row.parent_version_id),
      bodyRef: parse<ArtifactRef>(row.body_ref_json),
      provenance: parse<ProvenanceRef[]>(row.provenance_json),
      status: String(row.status) as KnowledgeVersion['status'],
      qualityOutcome: String(row.quality_outcome) as KnowledgeVersion['qualityOutcome'],
      qualityScore: Number(row.quality_score),
      gateDecisionId: row.gate_decision_id === null ? null : String(row.gate_decision_id),
      title: String(row.title),
      description: String(row.description),
      category: String(row.category),
      tags: parse<string[]>(row.tags_json),
      metadata: parse<Record<string, unknown>>(row.metadata_json),
      createdAt: String(row.created_at),
    };
  }

  private versionSummary(version: KnowledgeVersion): Record<string, unknown> {
    return {
      versionId: version.versionId,
      moduleId: version.moduleId,
      parentVersionId: version.parentVersionId,
      status: version.status,
      qualityOutcome: version.qualityOutcome,
      qualityScore: version.qualityScore,
      gateDecisionId: version.gateDecisionId,
      bodyRef: version.bodyRef,
      createdAt: version.createdAt,
      href: `/api/v1/knowledge/${encodeURIComponent(version.versionId)}`,
    };
  }

  private ruleFromRow(row: Row): Record<string, unknown> & {
    scope: Record<string, unknown>; config: Record<string, unknown>; enabled: boolean;
  } {
    return {
      ruleId: String(row.rule_id),
      revision: Number(row.revision),
      scope: parse<Record<string, unknown>>(row.scope_json),
      config: parse<Record<string, unknown>>(row.config_json),
      enabled: Number(row.enabled) === 1,
      createdAt: String(row.created_at),
      createdBy: String(row.created_by),
      changeReason: String(row.change_reason),
      auditId: String(row.audit_id),
    };
  }

  private sourceRow(sourceId: string): SourceRow | null {
    const row = this.database.prepare('SELECT * FROM sources WHERE source_id = ?')
      .get(sourceId) as unknown as SourceRow | undefined;
    return row ?? null;
  }

  private sourceFromRow(row: SourceRow): Record<string, unknown> & {
    kind: string; project: string; status: string; lastSyncAt: string | null;
    knowledge: Record<string, number>;
  } {
    return {
      sourceId: row.source_id,
      kind: row.kind,
      project: row.project_id,
      displayName: row.display_name,
      locator: row.locator,
      revision: row.pinned_revision,
      observedRevision: row.observed_revision,
      status: row.status,
      credentialConfigured: row.credential_ref !== null,
      accessPolicyRef: row.access_policy_ref,
      recordRevision: row.record_revision,
      lastSyncAt: row.last_sync_at,
      lastErrorCode: row.last_error_code,
      drift: row.drift_json === null ? null : parse<Record<string, unknown>>(row.drift_json),
      knowledge: this.sourceKnowledgeStats(row.locator),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private sourceKnowledgeStats(locator: string): Record<string, number> {
    const versions = (this.database.prepare(`
      SELECT version_id, status, provenance_json FROM knowledge_versions
    `).all() as Row[]).filter((row) => (
      parse<ProvenanceRef[]>(row.provenance_json).some((value) => sourcePathMatches(locator, value))
    ));
    return {
      total: versions.length,
      verified: versions.filter((row) => row.status === 'VERIFIED').length,
      candidate: versions.filter((row) => row.status === 'CANDIDATE').length,
      lowConfidence: versions.filter((row) => row.status === 'LOW_CONFIDENCE').length,
      superseded: versions.filter((row) => row.status === 'SUPERSEDED').length,
    };
  }

  private async validateSourceAccess(
    kind: string,
    rawLocator: string,
    credentialRef?: string,
  ): Promise<SourceAccess> {
    if (kind === 'FILE') return this.validateFileAccess(rawLocator);
    if (kind === 'HTTPS') return this.validateHttpsAccess(rawLocator, credentialRef);
    throw new Error(`SOURCE_KIND_UNSUPPORTED: ${kind}`);
  }

  private validateFileAccess(rawLocator: string): SourceAccess {
    if (isAbsolute(rawLocator)) throw new Error('SOURCE_ACCESS_DENIED: absolute locators are not accepted');
    const requested = resolve(this.repositoryRoot, rawLocator);
    let actual: string;
    try {
      actual = realpathSync(requested);
    } catch {
      throw new Error('SOURCE_NOT_FOUND: configured source does not exist');
    }
    const allowed = this.configuredRoots.some((configuredRoot) => {
      let root: string;
      try {
        root = realpathSync(configuredRoot);
      } catch {
        return false;
      }
      const scoped = relative(root, actual);
      return scoped === '' || (!scoped.startsWith(`..${sep}`) && scoped !== '..' && !isAbsolute(scoped));
    });
    if (!allowed) throw new Error('SOURCE_ACCESS_DENIED: locator is outside configured acquisition roots');
    if (lstatSync(requested).isSymbolicLink()) throw new Error('SOURCE_ACCESS_DENIED: symbolic link sources are not accepted');
    const info = statSync(actual);
    if (!info.isFile()) throw new Error('SOURCE_ACCESS_DENIED: FILE source must resolve to a regular file');
    const bytes = readFileSync(actual);
    if (bytes.byteLength > 10 * 1024 * 1024) throw new Error('SOURCE_ACCESS_DENIED: source exceeds 10 MiB');
    return {
      locator: relative(this.repositoryRoot, actual).replaceAll('\\', '/'),
      observedRevision: `sha256:${sha256(bytes)}`,
      size: bytes.byteLength,
      modifiedAt: info.mtime.toISOString(),
    };
  }

  private async validateHttpsAccess(rawLocator: string, credentialRef?: string): Promise<SourceAccess> {
    let locator: URL;
    try {
      locator = new URL(rawLocator);
    } catch {
      throw new Error('SOURCE_URL_INVALID: locator must be a valid URL');
    }
    if (locator.protocol !== 'https:' || locator.username || locator.password
      || locator.hash || locator.search) {
      throw new Error('SOURCE_ACCESS_DENIED: only credential-free HTTPS locators without query or fragment are accepted');
    }
    if (!this.allowedRemoteHosts.has(locator.hostname.toLowerCase())) {
      throw new Error('SOURCE_ACCESS_DENIED: remote host is not in WP_SOURCE_ALLOWED_HOSTS');
    }
    let addresses: readonly string[];
    try {
      addresses = (await this.remoteEndpointPolicy.validate(locator.toString())).addresses;
    } catch (error) {
      const code = error instanceof Error ? error.message.split(':', 1)[0] : '';
      if (code === 'PROVIDER_URL_UNREACHABLE') {
        throw new Error('SOURCE_ACCESS_FAILED: HTTPS source host cannot be resolved');
      }
      throw new Error('SOURCE_ACCESS_DENIED: HTTPS source resolves to a restricted target');
    }
    const dispatcher = this.sourceHttpsDispatcherFactory(
      { url: locator, addresses },
      10 * 1024 * 1024,
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    timeout.unref();
    try {
      const secret = credentialRef ? this.resolveCredential(credentialRef) : null;
      const response = await undiciFetch(locator, {
        method: 'GET', redirect: 'manual', signal: controller.signal, dispatcher,
        headers: {
          accept: 'text/markdown,text/plain;q=0.9,application/json;q=0.5',
          ...(secret ? { authorization: `Bearer ${secret}` } : {}),
        },
      });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        throw new Error('SOURCE_ACCESS_DENIED: HTTPS source redirects are forbidden');
      }
      if (!response.ok) throw new Error(`SOURCE_ACCESS_FAILED: upstream returned ${response.status}`);
      const advertised = Number(response.headers.get('content-length') ?? 0);
      if (advertised > 10 * 1024 * 1024) throw new Error('SOURCE_ACCESS_DENIED: source exceeds 10 MiB');
      if (!response.body) throw new Error('SOURCE_ACCESS_FAILED: upstream body is unavailable');
      const chunks: Uint8Array[] = [];
      let size = 0;
      const reader = response.body.getReader();
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > 10 * 1024 * 1024) {
          await reader.cancel();
          throw new Error('SOURCE_ACCESS_DENIED: source exceeds 10 MiB');
        }
        chunks.push(next.value);
      }
      const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), size);
      return {
        locator: locator.toString(),
        observedRevision: `sha256:${sha256(bytes)}`,
        size,
        modifiedAt: response.headers.get('last-modified'),
      };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('SOURCE_')) throw error;
      throw new Error('SOURCE_ACCESS_FAILED: HTTPS source could not be read');
    } finally {
      clearTimeout(timeout);
      await dispatcher.close().catch(() => undefined);
    }
  }

  private assertPublicationRule(
    scope: Record<string, unknown>,
    config: Record<string, unknown>,
    expectedPolicyId: string,
  ): void {
    assertKeys(scope, ['kind'], 'evaluation rule scope');
    if (scope.kind !== 'GLOBAL') throw new Error('ARGUMENT_INVALID: publication-gate scope must be GLOBAL');
    assertKeys(config, ['policyId', 'minimumStability', 'requireAllTests', 'maxIterations'], 'evaluation rule config');
    if (config.policyId !== expectedPolicyId || !expectedPolicyId) {
      throw new Error('ARGUMENT_INVALID: evaluation rule policyId is immutable');
    }
    const minimumStability = Number(config.minimumStability);
    const maxIterations = Number(config.maxIterations);
    if (!Number.isFinite(minimumStability) || minimumStability < 0 || minimumStability > 1) {
      throw new Error('ARGUMENT_INVALID: minimumStability must be 0..1');
    }
    if (typeof config.requireAllTests !== 'boolean') {
      throw new Error('ARGUMENT_INVALID: requireAllTests must be boolean');
    }
    if (!Number.isSafeInteger(maxIterations) || maxIterations < 0) {
      throw new Error('ARGUMENT_INVALID: maxIterations must be a non-negative integer');
    }
  }

  private validateCredentialRef(kind: string, credentialRef?: string): void {
    if (!credentialRef) return;
    if (kind !== 'HTTPS') throw new Error('SOURCE_CREDENTIAL_REF_INVALID: FILE sources cannot use credentials');
    if (!/^secret:\/\/env\/[A-Z][A-Z0-9_]{0,127}$/.test(credentialRef)) {
      throw new Error('SOURCE_CREDENTIAL_REF_INVALID: use secret://env/VARIABLE_NAME');
    }
    this.resolveCredential(credentialRef);
  }

  private resolveCredential(credentialRef: string): string {
    const name = credentialRef.slice('secret://env/'.length);
    const secret = process.env[name];
    if (!secret) throw new Error('SOURCE_CREDENTIAL_UNAVAILABLE: referenced credential is not configured');
    return secret;
  }

  private insertSourceAudit(
    sourceId: string,
    action: string,
    fromRevision: number | null,
    toRevision: number,
    reason: string,
    actor: string,
    occurredAt: string,
    changes: Record<string, unknown>,
  ): string {
    const auditId = `audit_${randomUUID()}`;
    this.database.prepare(`
      INSERT INTO source_audit(
        audit_id, source_id, action, from_revision, to_revision,
        reason, actor, occurred_at, changes_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(auditId, sourceId, action, fromRevision, toRevision,
      reason, actor, occurredAt, json(changes));
    return auditId;
  }

  private projectSourceActionItem(
    sourceId: string,
    type: 'SOURCE_DRIFT' | 'SOURCE_UNAVAILABLE',
    severity: 'MEDIUM' | 'HIGH',
    reasonCode: string,
    summary: string,
    eventId: string,
    occurredAt: string,
  ): void {
    projectActionItemObservation(this.database, {
      type,
      severity,
      subject: { kind: 'SOURCE', id: sourceId },
      runId: null,
      reasonCode,
      summary,
      eventId,
      occurredAt,
      allowedActions: ['ACKNOWLEDGE', 'RESOLVE'],
    });
  }

  private receipt(scope: string, command: ContentCommand): Record<string, unknown> | null {
    const row = this.database.prepare(`
      SELECT fingerprint, response_json FROM content_command_receipts
      WHERE scope = ? AND idempotency_key = ?
    `).get(scope, command.idempotencyKey) as Row | undefined;
    if (!row) return null;
    if (String(row.fingerprint) !== command.fingerprint) {
      throw new Error('IDEMPOTENCY_CONFLICT: key reused with different command');
    }
    const value = parse<Record<string, unknown>>(row.response_json);
    return { ...value, replayed: true };
  }

  private saveReceipt(scope: string, command: ContentCommand, value: unknown, createdAt: string): void {
    this.database.prepare(`
      INSERT INTO content_command_receipts(
        scope, idempotency_key, fingerprint, response_json, created_at
      ) VALUES (?, ?, ?, ?, ?)
    `).run(scope, command.idempotencyKey, command.fingerprint, json(value), createdAt);
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
}
