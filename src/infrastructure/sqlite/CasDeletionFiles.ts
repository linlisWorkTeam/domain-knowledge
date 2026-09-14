/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：从确认清单冻结CAS文件，核验内容后清理，并支持部分清理后的恢复。
 */
import { fsyncSync } from 'node:fs';
import type { BatchDeletionPlan, DeletionNode } from '../../domain/workbench/BatchDeletion.ts';
import { DeletionFileRoot } from './DeletionFileRoot.ts';

interface FileEntry { id: string; present: boolean; size: number }
interface FileWitness { contract: 'cas-deletion-files-v1'; planId: string; files: FileEntry[] }
/** 仅在记录提交后、持有维护屏障及完整写入排他时清理；不接收文件路径。 */
export class CasDeletionFiles extends DeletionFileRoot {
  readonly contract = 'cas-deletion-files-v1';
  capture(plan: BatchDeletionPlan, nodes: DeletionNode[]): FileWitness {
    this.assertScope();
    if (plan.schemaVersion !== 'batch-deletion-v2') throw new Error('DELETION_CONTRACT_INCOMPATIBLE');
    const byId = new Map(nodes.map(node => [node.id, node]));
    const files = plan.deleteIds.filter(id => id.startsWith('cas/')).sort().map(id => {
      const node = byId.get(id), digest = id.slice('cas/sha256:'.length);
      if (!/^cas\/sha256:[a-f0-9]{64}$/.test(id) || !node || node.kind !== 'artifact'
        || !Number.isSafeInteger(node.bytes) || node.bytes! < 0 || node.bytes! > 32 * 1024 * 1024
        || ![digest, `missing:${digest}`].includes(node.revision)
        || node.revision.startsWith('missing:') && node.bytes !== 0) throw new Error('DELETION_FILE_WITNESS_INVALID');
      return { id, present: node.revision === digest, size: node.bytes! };
    });
    const witness: FileWitness = { contract: this.contract, planId: plan.planId, files };
    this.validate(plan, witness);
    for (const entry of files) {
      const found = this.inspect(entry, false);
      if (entry.present && found === null) throw new Error('DELETION_ARTIFACT_CHANGED');
    }
    return witness;
  }
  clean(plan: BatchDeletionPlan, witness: unknown): void {
    this.assertScope();
    const frozen = this.validate(plan, witness);
    // 在清理任何文件前检查全部剩余文件；损坏或已出现的新文件不能被当成成功。
    for (const entry of frozen.files) this.inspect(entry, false);
    for (const entry of frozen.files) this.inspect(entry, true);
  }
  private validate(plan: BatchDeletionPlan, witness: unknown): FileWitness {
    const frozen = witness as FileWitness;
    if (plan.schemaVersion !== 'batch-deletion-v2' || !frozen || frozen.contract !== this.contract || frozen.planId !== plan.planId
      || !Array.isArray(frozen.files) || frozen.files.length > 100000
      || frozen.files.some(file => !file || !/^cas\/sha256:[a-f0-9]{64}$/.test(file.id)
        || typeof file.present !== 'boolean' || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > 32 * 1024 * 1024 || !file.present && file.size !== 0)
      || new Set(frozen.files.map(file => file.id)).size !== frozen.files.length
      || JSON.stringify(frozen.files.map(file => file.id).sort()) !== JSON.stringify(plan.deleteIds.filter(id => id.startsWith('cas/')).sort())) throw new Error('DELETION_FILE_WITNESS_INVALID');
    return frozen;
  }
  private inspect(entry: FileEntry, remove: boolean): true | null {
    return this.visit(entry.id.slice(4), 32 * 1024 * 1024, file => {
      if (!entry.present || file.bytes.byteLength !== entry.size) throw new Error('DELETION_ARTIFACT_CHANGED');
      if (remove) this.removeFile(file);
      return true as const;
    }, remove ? parent => fsyncSync(parent) : undefined);
  }
}
