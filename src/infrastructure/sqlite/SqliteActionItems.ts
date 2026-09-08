/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：提供SqliteActionItems的基础设施实现与外部系统接入。
 */
import type { DatabaseSync } from 'node:sqlite';
import { sha256 } from '../../domain/Domain.ts';

/** 定义ActionItemAction的数据结构与类型约束。 */
export type ActionItemAction = 'ACKNOWLEDGE' | 'RESOLVE' | 'RETRY' | 'REGENERATE';

/** 定义ActionItemObservation的数据结构与类型约束。 */
export interface ActionItemObservation {
  /** 提供类型信息，供调用方读取或传入。 */
  type: 'RUN_FAILED' | 'LOW_CONFIDENCE' | 'GATE_STOPPED' | 'COMPONENT_UNAVAILABLE'
    | 'SOURCE_DRIFT' | 'SOURCE_UNAVAILABLE';
  /** 提供severity信息，供调用方读取或传入。 */
  severity: 'MEDIUM' | 'HIGH';
  /** 提供subject信息，供调用方读取或传入。 */
  subject: { kind: 'RUN' | 'SOURCE'; id: string };
  /** 提供运行标识信息，供调用方读取或传入。 */
  runId: string | null;
  /** 提供原因Code信息，供调用方读取或传入。 */
  reasonCode: string;
  /** 提供summary信息，供调用方读取或传入。 */
  summary: string;
  /** 提供event标识信息，供调用方读取或传入。 */
  eventId: string;
  /** 提供occurred时间信息，供调用方读取或传入。 */
  occurredAt: string;
  /** 提供allowedActions信息，供调用方读取或传入。 */
  allowedActions: ActionItemAction[];
}

/** Persist one deterministic observation. The caller owns the surrounding SQLite transaction. */
/** 提供 projectActionItemObservation 对应的projectActionItemObservation操作。 */
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
