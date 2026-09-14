/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：从父级材料提取 Worker 获准读取的文件，拒绝隐式传递其他正文。
 */
import type { Material } from '../../../AgentExecution.ts';

/** 未归属到明确路径的正文不进入子任务；模型可通过同一授权列表读取冻结工作区。 */
export function scopedWorkerSource(materials: Material[], allowedPaths: string[]) {
  const allowed = new Set(allowedPaths);
  const files = new Map<string, { path: string; content?: string; sha256?: string; size?: number }>();
  for (const material of materials) {
    if (!material.content || typeof material.content !== 'object') continue;
    const value = material.content as Record<string, unknown>;
    const candidates = Array.isArray(value.files) ? value.files : typeof value.path === 'string' ? [value] : [];
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object' || !allowed.has(candidate.path)) continue;
      const file = { path: String(candidate.path),
        ...(typeof candidate.content === 'string' ? { content: candidate.content } : {}),
        ...(typeof candidate.sha256 === 'string' ? { sha256: candidate.sha256 } : {}),
        ...(typeof candidate.size === 'number' ? { size: candidate.size } : {}) };
      const previous = files.get(file.path);
      if (previous && JSON.stringify(previous) !== JSON.stringify(file)) throw new Error('WORKER_SOURCE_CONFLICT');
      files.set(file.path, file);
    }
  }
  return { sourcePaths: [...allowed].sort(), files: [...files.values()].sort((a,b) => a.path.localeCompare(b.path)) };
}
