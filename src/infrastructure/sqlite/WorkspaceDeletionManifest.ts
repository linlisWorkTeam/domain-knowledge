/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：从审计归属和角色工作区清单提取可清理文件，未知归属保留。
 */
import { isAbsolute, relative, resolve } from 'node:path';
import { sha256 } from '../../domain/Domain.ts';
import type { DeletionNode } from '../../domain/workbench/BatchDeletion.ts';
import type { DeletionRecordInventory } from './SqliteDeletionInventory.ts';
import type { PublishedDeletionFile } from './PublishedDeletionManifest.ts';
import { CasDeletionReader } from './CasDeletionReader.ts';
class ManifestReader extends CasDeletionReader {
  manifest(path: string): Buffer | null { return this.inspectRelative(path.split('/'), 1024 * 1024, file => file.bytes); }
  audit(path: string): Buffer | null { return this.inspectRelative(path.split('/'), 16 * 1024 * 1024, file => file.bytes); }
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
/** audits必须来自服务端受保护的审计文件；roots不得从其中的workspaceRoot自动扩展。 */
export function workspaceDeletionManifest(input: {
  roots: Record<string, string>; audits: unknown[]; inventory: DeletionRecordInventory;
}): { files: PublishedDeletionFile[]; protectedNodes: DeletionNode[] } {
  if (input.audits.length > 100000) throw new Error('DELETION_INVENTORY_TOO_LARGE');
  const owners = new Map<string, string[]>();
  for (const record of input.inventory.records) {
    const key = record.table === 'runs' ? record.key.run_id : record.table === 'wb_stage_tasks' ? record.key.task_id : undefined;
    if (typeof key === 'string') owners.set(key, [...(owners.get(key) ?? []), record.id]);
  }
  const workspaces = new Map<string, { root: string; path: string; owners: Set<string>; unknown: boolean }>();
  for (const value of input.audits) {
    const audit = object(value); if (typeof audit.workspaceRoot !== 'string') continue;
    if (!['deepseek-harness-sdk', 'deepseek-harness-headless'].includes(String(audit.provider)) || audit.schemaVersion !== '1.0') throw new Error('DELETION_WORKSPACE_AUDIT_UNSUPPORTED');
    const matches = Object.entries(input.roots).filter(([, root]) => {
      const path = relative(resolve(root), audit.workspaceRoot as string);
      return isAbsolute(audit.workspaceRoot as string) && /^(?:[a-f0-9]{32}|stage-materials\/[a-f0-9]{64})$/.test(path);
    });
    if (matches.length !== 1) throw new Error('DELETION_WORKSPACE_ROOT_UNAUTHORIZED');
    const [root, directory] = matches[0]!, path = relative(resolve(directory), audit.workspaceRoot);
    if (path.startsWith('stage-materials/') && (typeof audit.idempotencyKey !== 'string' || path !== `stage-materials/${sha256(audit.idempotencyKey)}`)) throw new Error('DELETION_WORKSPACE_IDENTITY_INVALID');
    const identity = JSON.stringify([root, path]);
    const workspace = workspaces.get(identity) ?? { root, path, owners: new Set<string>(), unknown: false };
    const known = owners.get(String(object(audit.metadata).runId ?? ''));
    if (known?.length) for (const owner of known) workspace.owners.add(owner); else workspace.unknown = true;
    workspaces.set(identity, workspace);
  }
  const files: PublishedDeletionFile[] = [], protectedNodes: DeletionNode[] = [];
  for (const [identity, workspace] of workspaces) {
    // 完全没有当前执行所有者的旧审计不触碰目录，也不妨碍其他批次预览。
    if (!workspace.owners.size) continue;
    const manifestPath = `${workspace.path}/.flywheel-workspace.json`;
    const bytes = new ManifestReader(input.roots[workspace.root]!).manifest(manifestPath);
    if (!bytes) throw new Error('DELETION_WORKSPACE_MANIFEST_MISSING');
    let value: Record<string, unknown>;
    try { value = object(JSON.parse(bytes.toString('utf8'))); } catch { throw new Error('DELETION_WORKSPACE_MANIFEST_INVALID'); }
    if (value.schemaVersion !== '1.0' || typeof value.role !== 'string' || !Array.isArray(value.files)
      || !Array.isArray(value.readablePaths) || value.files.length > 20000
      || value.readablePaths.length !== value.files.length) throw new Error('DELETION_WORKSPACE_MANIFEST_INVALID');
    if (workspace.path.startsWith('stage-materials/') && value.files.length) throw new Error('DELETION_WORKSPACE_MANIFEST_INVALID');
    const readablePaths = value.readablePaths;
    const entries = value.files.map(entry => object(entry)), paths = entries.map(entry => entry.path);
    if (new Set(paths).size !== paths.length || paths.some((path, index) => typeof path !== 'string' || readablePaths[index] !== path)) throw new Error('DELETION_WORKSPACE_MANIFEST_INVALID');
    const own = [...workspace.owners].sort(), ids: string[] = [];
    const add = (path: string, digest: string, size: number) => {
      if (!path || path.split('/').some(part => !part || part === '.' || part === '..' || /[\\\0\r\n]/.test(part))
        || !/^[a-f0-9]{64}$/.test(digest) || !Number.isSafeInteger(size) || size < 0 || size > 32 * 1024 * 1024) throw new Error('DELETION_WORKSPACE_MANIFEST_INVALID');
      if (files.length >= 100000) throw new Error('DELETION_INVENTORY_TOO_LARGE');
      const id = `published-files/${sha256(JSON.stringify([workspace.root, path]))}`; ids.push(id);
      files.push({ id, root: workspace.root, path, sha256: digest, size, ownedBy: own });
    };
    for (const entry of entries) {
      if (typeof entry.path !== 'string' || entry.path === '.flywheel-workspace.json' || typeof entry.sha256 !== 'string' || typeof entry.bytes !== 'number') throw new Error('DELETION_WORKSPACE_MANIFEST_INVALID');
      add(`${workspace.path}/${entry.path}`, entry.sha256, entry.bytes);
    }
    add(manifestPath, sha256(bytes), bytes.length);
    if (workspace.unknown) protectedNodes.push({ id: `workspace-unknown/${sha256(identity)}`, kind: 'configuration',
      revision: sha256(JSON.stringify(ids)), ownedBy: [], references: ids });
  }
  if (files.length > 100000) throw new Error('DELETION_INVENTORY_TOO_LARGE');
  return { files, protectedNodes };
}

/** 只读取公共Composition实际写入的两个审计文件；缺失允许，损坏/超限不当作空审计。 */
export function readWorkspaceAudits(runtimeRoot: string): unknown[] {
  const reader = new ManifestReader(runtimeRoot), records: unknown[] = [];
  for (const path of ['demo/agent-runs.jsonl', 'workbench-audit/model.jsonl']) {
    const bytes = reader.audit(path); if (!bytes) continue;
    for (const line of bytes.toString('utf8').split('\n')) {
      if (!line.trim()) continue;
      if (records.length >= 100000) throw new Error('DELETION_INVENTORY_TOO_LARGE');
      try {
        const record: unknown = JSON.parse(line);
        if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('invalid');
        records.push(record);
      } catch { throw new Error('DELETION_WORKSPACE_AUDIT_INVALID'); }
    }
  }
  return records;
}
