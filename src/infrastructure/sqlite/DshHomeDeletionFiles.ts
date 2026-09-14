/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：冻结DSH临时home中的文件及链接，清理只unlink叶子，不跟随依赖链接。
 */
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, openSync, readSync, readdirSync, readlinkSync, unlinkSync } from 'node:fs';
import type { BigIntStats } from 'node:fs';
import { resolve } from 'node:path';
import { sha256 } from '../../domain/Domain.ts';
import type { BatchDeletionPlan, DeletionNode } from '../../domain/workbench/BatchDeletion.ts';
import type { DeletionRecordInventory } from './SqliteDeletionInventory.ts';
const flags = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
const homePattern = /^[a-f0-9]{24}-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
interface Entry { path: string; kind: 'directory' | 'file' | 'link'; identity: string; digest: string; size: number }
interface Home { id: string; name: string; entries: Entry[]; ownedBy: string[] }
interface Witness { contract: 'dsh-home-files-v1'; scope: string; planId: string; homes: Home[] }
function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function same(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }
function identity(stat: BigIntStats, directory: boolean): string {
  return directory ? `${stat.dev}:${stat.ino}` : `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
}
export class DshHomeDeletionFiles {
  readonly contract = 'dsh-home-files-v1';
  readonly scope: string;
  private readonly root: string;
  constructor(root: string) {
    if (process.platform !== 'linux') throw new Error('DELETION_ARTIFACT_PLATFORM_UNSUPPORTED');
    this.root = resolve(root); const fd = openSync(this.root, flags);
    try { this.scope = sha256(`${this.root}:${identity(fstatSync(fd, { bigint: true }), true)}`); } finally { closeSync(fd); }
  }
  private openRoot(): number {
    const fd = openSync(this.root, flags);
    if (sha256(`${this.root}:${identity(fstatSync(fd, { bigint: true }), true)}`) !== this.scope) { closeSync(fd); throw new Error('DELETION_FILE_SCOPE_CHANGED'); }
    return fd;
  }
  private entry(parent: number, name: string, path: string): Entry {
    const filename = `/proc/self/fd/${parent}/${name}`, before = lstatSync(filename, { bigint: true });
    if (before.isDirectory()) return { path, kind: 'directory', identity: identity(before, true), digest: '', size: 0 };
    if (!before.isFile() && !before.isSymbolicLink()) throw new Error('DELETION_HOME_SPECIAL_FILE');
    if (before.size > 32n * 1024n * 1024n) throw new Error('DELETION_ARTIFACT_LIMIT');
    let digest: string;
    if (before.isSymbolicLink()) digest = sha256(readlinkSync(filename, { encoding: 'buffer' }));
    else {
      const fd = openSync(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        const opened = fstatSync(fd, { bigint: true });
        if (!opened.isFile() || identity(before, false) !== identity(opened, false)) throw new Error('DELETION_ARTIFACT_CHANGED');
        const bytes = Buffer.alloc(Number(before.size)); let offset = 0;
        while (offset < bytes.length) {
          const count = readSync(fd, bytes, offset, bytes.length - offset, offset);
          if (!count) throw new Error('DELETION_ARTIFACT_CHANGED'); offset += count;
        }
        if (readSync(fd, Buffer.alloc(1), 0, 1, offset)) throw new Error('DELETION_ARTIFACT_CHANGED');
        if (bytes.length !== Number(before.size) || identity(before, false) !== identity(fstatSync(fd, { bigint: true }), false)) throw new Error('DELETION_ARTIFACT_CHANGED');
        digest = sha256(bytes);
      } finally { closeSync(fd); }
    }
    if (identity(before, false) !== identity(lstatSync(filename, { bigint: true }), false)) throw new Error('DELETION_ARTIFACT_CHANGED');
    return { path, kind: before.isSymbolicLink() ? 'link' : 'file', identity: identity(before, false), digest, size: Number(before.size) };
  }
  private scan(name: string): Entry[] {
    if (!homePattern.test(name)) throw new Error('DELETION_HOME_INVALID');
    const root = this.openRoot(), result: Entry[] = []; let bytes = 0;
    const walk = (parent: number, leaf: string, path: string, depth: number) => {
      if (depth > 24 || result.length >= 100000) throw new Error('DELETION_INVENTORY_TOO_LARGE');
      const entry = this.entry(parent, leaf, path); result.push(entry); bytes += entry.size;
      if (bytes > 128 * 1024 * 1024) throw new Error('DELETION_ARTIFACT_LIMIT');
      if (entry.kind !== 'directory') return;
      const fd = openSync(`/proc/self/fd/${parent}/${leaf}`, flags);
      try {
        if (identity(fstatSync(fd, { bigint: true }), true) !== entry.identity) throw new Error('DELETION_ARTIFACT_CHANGED');
        const children = readdirSync(`/proc/self/fd/${fd}`).sort();
        if (!path && children.some(child => !['.anonymous-user-id', 'RoleTools.mjs', 'profiles', 'role-policy.json', 'sessions'].includes(child))) throw new Error('DELETION_HOME_LAYOUT_UNKNOWN');
        for (const child of children) {
          if (/[\\\0\r\n]/.test(child)) throw new Error('DELETION_FILE_PATH_INVALID');
          walk(fd, child, path ? `${path}/${child}` : child, depth + 1);
        }
        if (!same(children, readdirSync(`/proc/self/fd/${fd}`).sort())) throw new Error('DELETION_ARTIFACT_CHANGED');
      } finally { closeSync(fd); }
    };
    try { walk(root, name, '', 0); if (result[0]?.kind !== 'directory') throw new Error('DELETION_HOME_INVALID'); return result; }
    finally { closeSync(root); }
  }
  observe(audits: unknown[], inventory: DeletionRecordInventory): { homes: Home[]; nodes: DeletionNode[] } {
    if (audits.length > 100000) throw new Error('DELETION_INVENTORY_TOO_LARGE');
    const owners = new Map<string, string[]>();
    for (const record of inventory.records) {
      const key = record.table === 'runs' ? record.key.run_id : record.table === 'wb_stage_tasks' ? record.key.task_id : undefined;
      if (typeof key === 'string') owners.set(key, [...(owners.get(key) ?? []), record.id]);
    }
    const requests = new Map<string, { owners: Set<string>; unknown: boolean }>();
    for (const raw of audits) {
      const audit = object(raw); if (audit.provider !== 'deepseek-harness-sdk') continue;
      if (audit.schemaVersion !== '1.0' || typeof audit.idempotencyKey !== 'string' || !audit.idempotencyKey) throw new Error('DELETION_HOME_AUDIT_INVALID');
      const prefix = sha256(audit.idempotencyKey).slice(0, 24), request = requests.get(prefix) ?? { owners: new Set<string>(), unknown: false };
      const known = owners.get(String(object(audit.metadata).runId ?? ''));
      if (known?.length) for (const owner of known) request.owners.add(owner); else request.unknown = true;
      requests.set(prefix, request);
    }
    const fd = this.openRoot(); let names: string[];
    try { names = readdirSync(`/proc/self/fd/${fd}`).sort(); } finally { closeSync(fd); }
    const homes: Home[] = [], nodes: DeletionNode[] = []; let count = 0, total = 0;
    for (const name of names) {
      if (!homePattern.test(name)) continue;
      const request = requests.get(name.slice(0, 24)); if (!request?.owners.size) continue;
      const entries = this.scan(name), id = `dsh-homes/${sha256(JSON.stringify([this.scope, name]))}`;
      count += entries.length; const bytes = entries.reduce((sum, entry) => sum + entry.size, 0); total += bytes;
      if (count > 100000 || total > 128 * 1024 * 1024) throw new Error('DELETION_INVENTORY_TOO_LARGE');
      const ownedBy = [...request.owners].sort(); homes.push({ id, name, entries, ownedBy });
      nodes.push({ id, kind: 'artifact', revision: sha256(JSON.stringify(entries)), bytes, ownedBy, references: [] });
      if (request.unknown) nodes.push({ id: `dsh-home-unknown/${sha256(id)}`, kind: 'configuration', revision: sha256(id), ownedBy: [], references: [id] });
    }
    return { homes, nodes };
  }
  capture(plan: BatchDeletionPlan, homes: Home[]): Witness {
    const selected = homes.filter(home => plan.deleteIds.includes(home.id));
    const witness: Witness = { contract: this.contract, scope: this.scope, planId: plan.planId, homes: selected };
    this.validate(plan, witness);
    for (const home of selected) if (!same(home.entries, this.scan(home.name))) throw new Error('DELETION_ARTIFACT_CHANGED');
    return structuredClone(witness);
  }
  private validate(plan: BatchDeletionPlan, value: unknown): Witness {
    const witness = value as Witness;
    if (plan.schemaVersion !== 'batch-deletion-v2' || !witness || witness.contract !== this.contract || witness.scope !== this.scope || witness.planId !== plan.planId
      || !Array.isArray(witness.homes) || witness.homes.length > 100000
      || !same(witness.homes.map(home => home.id).sort(), plan.deleteIds.filter(id => id.startsWith('dsh-homes/')).sort())) throw new Error('DELETION_FILE_WITNESS_INVALID');
    let count = 0;
    for (const home of witness.homes) {
      if (!homePattern.test(home.name) || home.id !== `dsh-homes/${sha256(JSON.stringify([this.scope, home.name]))}` || !Array.isArray(home.entries)) throw new Error('DELETION_FILE_WITNESS_INVALID');
      count += home.entries.length;
      if (count > 100000 || new Set(home.entries.map(entry => entry.path)).size !== home.entries.length || home.entries[0]?.path !== '' || home.entries[0]?.kind !== 'directory') throw new Error('DELETION_FILE_WITNESS_INVALID');
      for (const entry of home.entries) if (typeof entry.path !== 'string' || entry.path && entry.path.split('/').some(part => !part || part === '.' || part === '..' || /[\\\0\r\n]/.test(part))
        || !['directory', 'file', 'link'].includes(entry.kind) || typeof entry.identity !== 'string' || !entry.identity
        || !Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > 32 * 1024 * 1024
        || (entry.kind === 'directory' ? entry.digest !== '' || entry.size !== 0 : !/^[a-f0-9]{64}$/.test(entry.digest))) throw new Error('DELETION_FILE_WITNESS_INVALID');
    }
    return witness;
  }
  private checkRemaining(home: Home): Entry[] {
    const current = this.scan(home.name), expected = new Map(home.entries.map(entry => [entry.path, entry]));
    for (const entry of current) if (!same(entry, expected.get(entry.path))) throw new Error('DELETION_ARTIFACT_CHANGED');
    const paths = new Set(current.map(entry => entry.path));
    if (home.entries.some(entry => entry.kind === 'directory' && !paths.has(entry.path))) throw new Error('DELETION_ARTIFACT_CHANGED');
    return current;
  }
  clean(plan: BatchDeletionPlan, value: unknown): void {
    const witness = this.validate(plan, value);
    for (const home of witness.homes) this.checkRemaining(home);
    for (const home of witness.homes) {
      const expected = new Map(home.entries.map(entry => [entry.path, entry]));
      for (const entry of home.entries.filter(entry => entry.kind !== 'directory')) {
        const handles = [this.openRoot()];
        try {
          const parts = entry.path.split('/'), leaf = parts.pop()!; let path = '';
          for (const [index, part] of [home.name, ...parts].entries()) {
            const fd = openSync(`/proc/self/fd/${handles.at(-1)!}/${part}`, flags); handles.push(fd);
            if (index !== 0) path = path ? `${path}/${part}` : part;
            if (identity(fstatSync(fd, { bigint: true }), true) !== expected.get(path)?.identity) throw new Error('DELETION_ARTIFACT_CHANGED');
          }
          const parent = handles.at(-1)!;
          try { if (!same(this.entry(parent, leaf, entry.path), entry)) throw new Error('DELETION_ARTIFACT_CHANGED'); }
          catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') { fsyncSync(parent); continue; } throw error; }
          unlinkSync(`/proc/self/fd/${parent}/${leaf}`); fsyncSync(parent);
        } finally { for (const fd of handles.reverse()) closeSync(fd); }
      }
      if (this.checkRemaining(home).some(entry => entry.kind !== 'directory')) throw new Error('DELETION_ARTIFACT_CHANGED');
    }
  }
}
