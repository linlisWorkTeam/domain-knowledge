/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：从CAS导出独立发布目录，校验后原子改名，拒绝路径和符号链接替换。
 */
import { mkdirSync, mkdtempSync, lstatSync, readFileSync, writeFileSync, renameSync, rmSync, readdirSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { sha256 } from '../../domain/Domain.ts';
import { assertPublicationRecord, type PublicationRecord } from '../../domain/workbench/WorkbenchPublicationRecord.ts';
import type { ArtifactStore } from '../../application/ports/ApplicationPorts.ts';
import type { WorkbenchPublicationFiles } from '../../application/ports/WorkbenchPublicationPorts.ts';
export class LocalWorkbenchPublicationFiles implements WorkbenchPublicationFiles {
  readonly root: string;
  private readonly artifacts: Pick<ArtifactStore, 'get' | 'verify'>;
  constructor(root: string, artifacts: Pick<ArtifactStore, 'get' | 'verify'>) { this.root = resolve(root); this.artifacts = artifacts; mkdirSync(this.root, { recursive: true }); }
  private sync(path: string) { const descriptor = openSync(path, 'r'); try { fsyncSync(descriptor); } finally { closeSync(descriptor); } }
  private valid(directory: string, record: PublicationRecord): boolean {
    try {
      if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink()) return false;
      const paths: string[] = [];
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.isFile()) paths.push(entry.name);
        else if (entry.name === 'cards' && entry.isDirectory()) {
          for (const card of readdirSync(join(directory, 'cards'), { withFileTypes: true })) { if (!card.isFile()) return false; paths.push(`cards/${card.name}`); }
        } else return false;
      }
      if (JSON.stringify(paths.sort()) !== JSON.stringify(record.files.map(file => file.path).sort())) return false;
      return record.files.every(file => { const path = join(directory, file.path); const stat = lstatSync(path);
        return stat.isFile() && !stat.isSymbolicLink() && stat.size === file.ref.size && sha256(readFileSync(path)) === file.ref.sha256; });
    } catch { return false; }
  }
  async verify(record: PublicationRecord) { assertPublicationRecord(record); return this.valid(join(this.root, record.publicationId), record); }
  async publish(record: PublicationRecord) {
    assertPublicationRecord(record); if (await this.verify(record)) return;
    const target = join(this.root, record.publicationId);
    try { lstatSync(target); throw new Error('PUBLICATION_DIRECTORY_CONFLICT'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const staging = mkdtempSync(join(this.root, '.publication-'));
    try {
      for (const file of record.files) {
        if (!await this.artifacts.verify(file.ref)) throw new Error('PUBLICATION_ARTIFACT_CORRUPT');
        const bytes = await this.artifacts.get(file.ref);
        if (file.path.startsWith('cards/')) mkdirSync(join(staging, 'cards'), { recursive: true });
        writeFileSync(join(staging, file.path), bytes, { flag: 'wx', mode: 0o644 });
        this.sync(join(staging, file.path));
      }
      if (record.files.some(file => file.path.startsWith('cards/'))) this.sync(join(staging, 'cards'));
      this.sync(staging);
      if (!this.valid(staging, record)) throw new Error('PUBLICATION_FILES_INVALID');
      try { renameSync(staging, target); } catch (error) { if (!await this.verify(record)) throw error; }
      this.sync(this.root);
      if (!await this.verify(record)) throw new Error('PUBLICATION_FILES_INVALID');
    } finally { rmSync(staging, { recursive: true, force: true }); }
  }
}
