/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：持久协调跨库删除，各库提交本地回执后允许文件清理，重启不重复移除记录。
 */
import type { DatabaseSync } from 'node:sqlite';
import { sha256 } from '../../domain/Domain.ts';
import type { BatchDeletionPlan } from '../../domain/workbench/BatchDeletion.ts';

export interface DeletionParticipant {
  name: string; contract: string; database: DatabaseSync;
  /** 在意图首次持久化前冻结行定位与摘要；恢复不得从剩余数据重新推断删除范围。 */
  capture(plan: BatchDeletionPlan): unknown;
  /** 已冻结且二次确认的服务端清单；调用期间由本连接持有写事务。 */
  remove(plan: BatchDeletionPlan, witness: unknown): void;
}
interface RecoveryIntent {
  contract: 'deletion-recovery-v2'; plan: BatchDeletionPlan;
  participants: Array<{ name: string; contract: string }>;
  witnesses: Record<string, unknown>;
}
export type DeletionRecoveryPhase = 'PREPARED' | 'RECORDS_COMMITTED' | 'COMPLETE';
export interface DeletionRecoveryRecord { intent: RecoveryIntent; fingerprint: string; phase: DeletionRecoveryPhase }

/**
 * 这不是跨库原子事务。调用者须在 prepare 前冻结写入，启动服务前先恢复 pending。
 * 记录可能跨多个提交，期间维护屏障不得放行其他读写；文件清理完成才解除屏障。
 */
export class SqliteDeletionRecovery {
  private readonly journal: DatabaseSync;
  private readonly participants: DeletionParticipant[];
  constructor(journal: DatabaseSync, participants: DeletionParticipant[]) {
    if (!participants.length || new Set(participants.map(item => item.name)).size !== participants.length
      || new Set([journal, ...participants.map(item => item.database)]).size !== participants.length + 1
      || participants.some(item => !/^[a-z][a-z0-9_-]{0,63}$/.test(item.name) || !item.contract || typeof item.capture !== 'function')) throw new Error('DELETION_PARTICIPANTS_INVALID');
    const files: string[] = [];
    for (const database of [journal, ...participants.map(item => item.database)]) {
      const stores = database.prepare('PRAGMA database_list').all().filter(row => row.name !== 'temp');
      if (stores.length !== 1 || stores[0]!.name !== 'main') throw new Error('DELETION_PARTICIPANTS_INVALID');
      if (stores[0]!.file) files.push(String(stores[0]!.file));
    }
    if (new Set(files).size !== files.length) throw new Error('DELETION_PARTICIPANTS_INVALID');
    this.journal = journal; this.participants = [...participants].sort((a, b) => a.name.localeCompare(b.name));
    journal.exec(`PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS deletion_recovery_intents(plan_id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,intent TEXT NOT NULL,phase TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS deletion_single_pending ON deletion_recovery_intents((1)) WHERE phase <> 'COMPLETE'`);
    for (const participant of this.participants) participant.database.exec(`PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS deletion_participant_receipts(plan_id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,contract TEXT NOT NULL)`);
  }
  get(planId: string): DeletionRecoveryRecord | null {
    const row = this.journal.prepare('SELECT * FROM deletion_recovery_intents WHERE plan_id=?').get(planId);
    if (!row) return null;
    const intent = JSON.parse(String(row.intent)) as RecoveryIntent;
    if (sha256(String(row.intent)) !== row.fingerprint || intent.contract !== 'deletion-recovery-v2'
      || intent.plan.planId !== planId || !intent.witnesses || typeof intent.witnesses !== 'object'
      || intent.participants.some(participant => !Object.hasOwn(intent.witnesses, participant.name))
      || !['PREPARED', 'RECORDS_COMMITTED', 'COMPLETE'].includes(String(row.phase))) throw new Error('DELETION_RECOVERY_CORRUPT');
    return { intent, fingerprint: String(row.fingerprint), phase: row.phase as DeletionRecoveryPhase };
  }
  pending(): DeletionRecoveryRecord[] {
    return this.journal.prepare("SELECT plan_id FROM deletion_recovery_intents WHERE phase <> 'COMPLETE' ORDER BY plan_id").all()
      .map(row => this.get(String(row.plan_id))!);
  }
  assertAvailable(): void { if (this.pending().length) throw new Error('DELETION_RECOVERY_REQUIRED'); }
  /** 只能在应用层重新校验引用图和二次确认后调用，不提供客户端直接写清单的接口。 */
  prepare(plan: BatchDeletionPlan): DeletionRecoveryRecord {
    const frozen: BatchDeletionPlan = { schemaVersion: plan.schemaVersion, planId: plan.planId, targetId: plan.targetId,
      deleteIds: [...plan.deleteIds].sort(), preservedIds: [...plan.preservedIds].sort(),
      counts: Object.fromEntries(Object.entries(plan.counts).sort(([a], [b]) => a.localeCompare(b))), reclaimableBytes: plan.reclaimableBytes };
    const participants = this.participants.map(({ name, contract }) => ({ name, contract }));
    this.journal.exec('BEGIN IMMEDIATE');
    try {
      const prior = this.get(plan.planId);
      if (prior) {
        if (JSON.stringify(prior.intent.plan) !== JSON.stringify(frozen)
          || JSON.stringify(prior.intent.participants) !== JSON.stringify(participants)) throw new Error('DELETION_RECOVERY_CONTRACT_CHANGED');
      }
      else {
        this.assertAvailable();
        const witnesses = Object.fromEntries(this.participants.map(participant => {
          const witness = participant.capture(JSON.parse(JSON.stringify(frozen)) as BatchDeletionPlan);
          if (witness === undefined || witness && typeof witness === 'object' && 'then' in witness) throw new Error('DELETION_WITNESS_INVALID');
          return [participant.name, witness];
        }));
        const intent: RecoveryIntent = { contract: 'deletion-recovery-v2', plan: frozen, participants, witnesses };
        const text = JSON.stringify(intent), fingerprint = sha256(text);
        this.journal.prepare("INSERT INTO deletion_recovery_intents VALUES(?,?,?,'PREPARED')").run(plan.planId, fingerprint, text);
      }
      this.journal.exec('COMMIT'); return this.get(plan.planId)!;
    } catch (error) { this.journal.exec('ROLLBACK'); throw error; }
  }
  /** 每库数据变更和本地回执同事务；中央进度丢失后以本地回执判断，不再次删除。 */
  applyRecords(planId: string): DeletionRecoveryRecord {
    const record = this.get(planId); if (!record) throw new Error('DELETION_RECEIPT_NOT_FOUND');
    if (record.phase === 'COMPLETE') return record;
    const contracts = this.participants.map(({ name, contract }) => ({ name, contract }));
    if (JSON.stringify(contracts) !== JSON.stringify(record.intent.participants)) throw new Error('DELETION_RECOVERY_CONTRACT_CHANGED');
    for (const participant of this.participants) {
      const db = participant.database;
      if (db.prepare('PRAGMA database_list').all().filter(row => row.name !== 'temp').length !== 1) throw new Error('DELETION_PARTICIPANTS_INVALID');
      db.exec('BEGIN IMMEDIATE');
      try {
        const receipt = db.prepare('SELECT fingerprint,contract FROM deletion_participant_receipts WHERE plan_id=?').get(planId);
        if (receipt) {
          if (receipt.fingerprint !== record.fingerprint || receipt.contract !== participant.contract) throw new Error('DELETION_RECOVERY_CORRUPT');
        } else {
          // 若全库提交后本地回执丢失，不得猜测或对新数据再次执行删除。
          if (record.phase !== 'PREPARED') throw new Error('DELETION_RECOVERY_RECEIPT_MISSING');
          participant.remove(JSON.parse(JSON.stringify(record.intent.plan)) as BatchDeletionPlan,
            JSON.parse(JSON.stringify(record.intent.witnesses[participant.name])));
          db.prepare('INSERT INTO deletion_participant_receipts VALUES(?,?,?)').run(planId, record.fingerprint, participant.contract);
        }
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    }
    this.journal.prepare("UPDATE deletion_recovery_intents SET phase='RECORDS_COMMITTED' WHERE plan_id=? AND phase='PREPARED'").run(planId);
    return this.get(planId)!;
  }
  /** 文件适配器确认清理成功后才可调用；失败/重启时保留 RECORDS_COMMITTED。 */
  completeAfterFiles(planId: string): DeletionRecoveryRecord {
    const record = this.get(planId); if (!record) throw new Error('DELETION_RECEIPT_NOT_FOUND');
    if (record.phase === 'COMPLETE') return record;
    if (record.phase !== 'RECORDS_COMMITTED') throw new Error('DELETION_RECORDS_NOT_COMMITTED');
    this.applyRecords(planId); // 再核对各库回执，不能仅凭中央标记解除恢复屏障。
    this.journal.prepare("UPDATE deletion_recovery_intents SET phase='COMPLETE' WHERE plan_id=?").run(planId);
    return this.get(planId)!;
  }
}
