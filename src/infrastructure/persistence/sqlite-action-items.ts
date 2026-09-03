import type { DatabaseSync } from 'node:sqlite';
import { sha256 } from '../../domain/index.ts';

export type ActionItemAction = 'ACKNOWLEDGE' | 'RESOLVE' | 'RETRY' | 'REGENERATE';

export interface ActionItemObservation {
  type: 'RUN_FAILED' | 'LOW_CONFIDENCE' | 'GATE_STOPPED' | 'COMPONENT_UNAVAILABLE'
    | 'SOURCE_DRIFT' | 'SOURCE_UNAVAILABLE';
  severity: 'MEDIUM' | 'HIGH';
  subject: { kind: 'RUN' | 'SOURCE'; id: string };
  runId: string | null;
  reasonCode: string;
  summary: string;
  eventId: string;
  occurredAt: string;
  allowedActions: ActionItemAction[];
}

/** Persist one deterministic observation. The caller owns the surrounding SQLite transaction. */
export function projectActionItemObservation(
  database: DatabaseSync,
  observation: ActionItemObservation,
): void {
  const fingerprint = `sha256:${sha256([
    observation.type,
    observation.subject.kind,
    observation.subject.id,
    observation.reasonCode,
  ].join('\0'))}`;
  const actionItemId = `ai_${sha256(`${fingerprint}\0${observation.eventId}`).slice(0, 24)}`;
  const previous = database.prepare(`
    SELECT action_item_id FROM action_items
    WHERE fingerprint = ? AND status = 'RESOLVED'
    ORDER BY resolved_at DESC, action_item_id DESC LIMIT 1
  `).get(fingerprint) as Record<string, unknown> | undefined;
  database.prepare(`
    INSERT INTO action_items(
      action_item_id, type, severity, status, subject_kind, subject_id, run_id,
      reason_code, summary, source_event_id, fingerprint, allowed_actions_json,
      revision, created_at, updated_at, resolved_at, resolution_json, previous_occurrence_id
    ) VALUES (?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL, NULL, ?)
    ON CONFLICT DO NOTHING
  `).run(
    actionItemId,
    observation.type,
    observation.severity,
    observation.subject.kind,
    observation.subject.id,
    observation.runId,
    observation.reasonCode,
    observation.summary,
    observation.eventId,
    fingerprint,
    JSON.stringify(observation.allowedActions),
    observation.occurredAt,
    observation.occurredAt,
    previous ? String(previous.action_item_id) : null,
  );
  const active = database.prepare(`
    SELECT action_item_id FROM action_items WHERE fingerprint = ? AND status <> 'RESOLVED'
  `).get(fingerprint) as Record<string, unknown> | undefined;
  if (active) {
    database.prepare(`
      INSERT OR IGNORE INTO action_item_sources(action_item_id, event_id, observed_at)
      VALUES (?, ?, ?)
    `).run(String(active.action_item_id), observation.eventId, observation.occurredAt);
  }
}
