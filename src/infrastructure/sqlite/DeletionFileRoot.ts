/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：绑定删除目录身份并核验已打开文件后移除，供CAS与发布文件共用。
 */
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, openSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { sha256 } from '../../domain/Domain.ts';
import { CasDeletionReader, type DeletionFileHandle } from './CasDeletionReader.ts';
export class DeletionFileRoot extends CasDeletionReader {
  readonly scope: string;
  private readonly directory: string;
  constructor(root: string) { super(resolve(root)); this.directory = resolve(root); this.scope = this.currentScope(); }
  private currentScope(): string {
    const handle = openSync(this.directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { const stat = fstatSync(handle, { bigint: true });
      return sha256(JSON.stringify({ path: this.directory, device: String(stat.dev), inode: String(stat.ino) }));
    } finally { closeSync(handle); }
  }
  protected assertScope(): void { if (this.currentScope() !== this.scope) throw new Error('DELETION_FILE_SCOPE_CHANGED'); }
  protected removeFile(file: DeletionFileHandle): void {
    const path = `/proc/self/fd/${file.parent}/${file.name}`;
    const current = lstatSync(path, { bigint: true }), pinned = fstatSync(file.handle, { bigint: true });
    if (!current.isFile() || current.dev !== pinned.dev || current.ino !== pinned.ino
      || current.size !== pinned.size || current.mtimeNs !== pinned.mtimeNs || current.ctimeNs !== pinned.ctimeNs
      || pinned.size !== file.verified.size || pinned.mtimeNs !== file.verified.mtimeNs || pinned.ctimeNs !== file.verified.ctimeNs) throw new Error('DELETION_ARTIFACT_CHANGED');
    unlinkSync(path); fsyncSync(file.parent);
  }
}
