/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：结合真实工作流状态及检查点执行者，冻结旧运行的删除资格。
 */
import type { DatabaseSync } from 'node:sqlite';
import type { WorkflowExecutionView } from '../../application/ports/ApplicationPorts.ts';
import { sha256 } from '../../domain/Domain.ts';
import { checkpointOwnerState } from './CheckpointOwner.ts';
import { visibleExecutionSql } from './DeletionTombstones.ts';

type Row = Record<string, unknown>;
const terminalBusiness = new Set(['VERIFIED', 'LOW_CONFIDENCE', 'FAILED', 'CANCELLED']);
const terminalExecution = new Set(['COMPLETED', 'FAILED', 'STOPPED', 'CANCELLED']);
function records(database: DatabaseSync) {
  const runs = database.prepare(`SELECT * FROM runs WHERE ${visibleExecutionSql(database, 'runs', 'runs.run_id')} ORDER BY run_id LIMIT 100001`).all();
  const checkpoints = database.prepare('SELECT * FROM checkpoints ORDER BY generation_key LIMIT 100001').all();
  const owners = database.prepare('SELECT * FROM checkpoint_owners ORDER BY generation_key LIMIT 100001').all();
  if ([runs, checkpoints, owners].some(rows => rows.length > 100000)) throw new Error('DELETION_INVENTORY_TOO_LARGE');
  return { runs, checkpoints, owners };
}

/** 仅供持有维护屏障的调用者使用；不是跨进程写锁，也不能缓存到下一次请求。 */
export class SqliteDeletionRunStates {
  private readonly database: DatabaseSync;
  private readonly fingerprint: string;
  private readonly unknownOwners: boolean;
  private readonly states: ReadonlyMap<string, { revision: string; active: boolean }>;
  private constructor(database: DatabaseSync, fingerprint: string, states: ReadonlyMap<string, { revision: string; active: boolean }>, unknownOwners: boolean) {
    this.database = database; this.fingerprint = fingerprint; this.states = states; this.unknownOwners = unknownOwners;
  }

  static async inspect(database: DatabaseSync, status: (runId: string) => Promise<WorkflowExecutionView>): Promise<SqliteDeletionRunStates> {
    const before = records(database), fingerprint = sha256(JSON.stringify(before));
    const owners = new Map(before.owners.map(owner => [String(owner.generation_key), owner.owner_json]));
    const blocked = new Set<string>();
    let unknownOwners = false;
    for (const checkpoint of before.checkpoints) {
      if (['COMMITTED', 'FAILED'].includes(String(checkpoint.status))) continue;
      let exited = false;
      if (checkpoint.status === 'RUNNING') {
        let ownerState: 'EXITED' | 'RUNNING' | 'UNKNOWN' = 'UNKNOWN';
        try { ownerState = checkpointOwnerState(JSON.parse(String(owners.get(String(checkpoint.generation_key))))); }
        catch { /* 缺少或损坏的进程身份不能证明已退出。 */ }
        exited = ownerState === 'EXITED';
        unknownOwners ||= ownerState === 'UNKNOWN';
      }
      if (!exited) blocked.add(String(checkpoint.run_id));
    }
    const runIds = new Set(before.runs.map(row => String(row.run_id)));
    if ([...blocked].some(runId => !runIds.has(runId))) throw new Error('DELETION_EXECUTION_UNTRACKED');
    const states = new Map<string, { revision: string; active: boolean }>();
    for (const row of before.runs) {
      const runId = String(row.run_id); let active = true;
      try {
        const execution = await status(runId);
        active = execution.runId !== runId || !terminalExecution.has(execution.executionStatus);
      } catch (error) {
        // 旧非工作流运行只在业务已结束时可删除。状态读取失败不等于没有工作流。
        if (error instanceof Error && error.message === `WORKFLOW_NOT_FOUND: ${runId}`) active = !terminalBusiness.has(String(row.state));
      }
      states.set(runId, { revision: sha256(JSON.stringify(row)), active: active || blocked.has(runId) });
    }
    const snapshot = new SqliteDeletionRunStates(database, fingerprint, states, unknownOwners);
    snapshot.assertCurrent(database);
    return snapshot;
  }

  assertCurrent(database: DatabaseSync): void {
    if (database !== this.database || sha256(JSON.stringify(records(database))) !== this.fingerprint) throw new Error('DELETION_EXECUTION_CHANGED');
  }
  get hasUnknownCheckpointOwners(): boolean { this.assertCurrent(this.database); return this.unknownOwners; }
  get idle(): boolean { this.assertCurrent(this.database); return [...this.states.values()].every(state => !state.active); }
  active(row: Row): boolean {
    const state = this.states.get(String(row.run_id));
    if (!state || state.revision !== sha256(JSON.stringify(row))) throw new Error('DELETION_EXECUTION_CHANGED');
    return state.active;
  }
}
