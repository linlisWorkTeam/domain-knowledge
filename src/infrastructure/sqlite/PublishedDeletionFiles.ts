/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：核验并清理已确认的发布/索引文件，保留未知目录成员及存储标记。
 */
import { fsyncSync } from 'node:fs';
import { sha256 } from '../../domain/Domain.ts';
import type { BatchDeletionPlan, DeletionNode } from '../../domain/workbench/BatchDeletion.ts';
import { DeletionFileRoot } from './DeletionFileRoot.ts';
import type { PublishedDeletionFile } from './PublishedDeletionManifest.ts';
interface Entry extends PublishedDeletionFile { present: boolean }
interface Witness { contract: 'published-deletion-files-v1'; planId: string; scope: string; files: Entry[] }
class PublishedRoot extends DeletionFileRoot {
  inspect(entry: PublishedDeletionFile, remove: boolean, present = true): true | null {
    this.assertScope();
    return this.visitRelative(entry.path.split('/'), entry.sha256, 32 * 1024 * 1024, file => {
      if (!present || file.bytes.length !== entry.size) throw new Error('DELETION_ARTIFACT_CHANGED');
      if (remove) this.removeFile(file);
      return true as const;
    }, remove ? parent => fsyncSync(parent) : undefined);
  }
}
/** 记录提交后才可clean，且调用方须维持完整写入排他；不执行递归目录删除或Git同步。 */
export class PublishedDeletionFiles {
  readonly contract = 'published-deletion-files-v1';
  readonly scope: string;
  private readonly roots: Map<string, PublishedRoot>;
  constructor(roots: Record<string, string>) {
    this.roots = new Map(Object.entries(roots).sort(([a], [b]) => a.localeCompare(b)).map(([name, path]) => {
      if (!/^[a-z][a-z0-9_-]{0,63}$/.test(name)) throw new Error('DELETION_PUBLICATION_ROOT_UNAUTHORIZED');
      return [name, new PublishedRoot(path)];
    }));
    this.scope = sha256(JSON.stringify([...this.roots].map(([name, root]) => [name, root.scope])));
  }
  private root(file: PublishedDeletionFile): PublishedRoot {
    const root = this.roots.get(file.root);
    if (!root || typeof file.path !== 'string' || file.id !== `published-files/${sha256(JSON.stringify([file.root, file.path]))}`
      || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > 32 * 1024 * 1024) throw new Error('DELETION_PUBLICATION_FILE_INVALID');
    return root;
  }
  observe(files: PublishedDeletionFile[]): DeletionNode[] {
    if (files.length > 100000 || new Set(files.map(file => file.id)).size !== files.length) throw new Error('DELETION_INVENTORY_INVALID');
    return files.map(file => {
      const present = this.root(file).inspect(file, false) !== null;
      return { id: file.id, kind: 'artifact', revision: present ? file.sha256 : `missing:${file.sha256}`,
        bytes: present ? file.size : 0, ownedBy: [...file.ownedBy], references: [] };
    });
  }
  capture(plan: BatchDeletionPlan, manifest: PublishedDeletionFile[], nodes: DeletionNode[]): Witness {
    const byId = new Map(manifest.map(file => [file.id, file])), byNode = new Map(nodes.map(node => [node.id, node]));
    const files = plan.deleteIds.filter(id => id.startsWith('published-files/')).sort().map(id => {
      const file = byId.get(id), node = byNode.get(id);
      if (!file || !node || node.kind !== 'artifact' || ![file.sha256, `missing:${file.sha256}`].includes(node.revision)) throw new Error('DELETION_FILE_WITNESS_INVALID');
      const present = node.revision === file.sha256;
      if (node.bytes !== (present ? file.size : 0)) throw new Error('DELETION_FILE_WITNESS_INVALID');
      const found = this.root(file).inspect(file, false, present);
      if (present && found === null) throw new Error('DELETION_ARTIFACT_CHANGED');
      return { ...file, ownedBy: [...file.ownedBy], present };
    });
    const witness: Witness = { contract: this.contract, planId: plan.planId, scope: this.scope, files };
    this.validate(plan, witness); return witness;
  }
  private validate(plan: BatchDeletionPlan, input: unknown): Witness {
    const witness = input as Witness;
    if (plan.schemaVersion !== 'batch-deletion-v2' || !witness || witness.contract !== this.contract || witness.planId !== plan.planId
      || witness.scope !== this.scope || !Array.isArray(witness.files) || witness.files.length > 100000
      || witness.files.some(file => !file || typeof file.present !== 'boolean')
      || new Set(witness.files.map(file => file.id)).size !== witness.files.length
      || JSON.stringify(witness.files.map(file => file.id).sort()) !== JSON.stringify(plan.deleteIds.filter(id => id.startsWith('published-files/')).sort())) throw new Error('DELETION_FILE_WITNESS_INVALID');
    for (const file of witness.files) this.root(file);
    return witness;
  }
  clean(plan: BatchDeletionPlan, input: unknown): void {
    const witness = this.validate(plan, input);
    for (const file of witness.files) this.root(file).inspect(file, false, file.present);
    for (const file of witness.files) this.root(file).inspect(file, true, file.present);
  }
}
