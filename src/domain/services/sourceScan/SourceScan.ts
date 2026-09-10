/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：发现待入库知识文件，执行目录范围校验、内容摘要去重和候选排序。
 */
import {
  lstatSync, readFileSync, readdirSync, realpathSync, statSync,
} from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { artifactIdFor, sha256 } from '../../Domain.ts';

const ignoredDirectories = new Set(['.git', '.dsh', '.workpanel', '__pycache__', 'node_modules', 'dist', 'build', 'runtime', 'history']);
const ignoredFiles = new Set(['README.md', 'index.md', 'log.md']);

/** 源码发现候选由本领域模块拥有，Application 仅重导出兼容类型。 */
/** 定义源码候选的数据结构与类型约束。 */
export interface KnowledgeDiscoveryCandidate {
  /** 提供路径信息，供调用方读取或传入。 */
  path: string;
  /** 提供SHA256信息，供调用方读取或传入。 */
  sha256: string;
  /** 提供大小信息，供调用方读取或传入。 */
  size: number;
  /** 提供modified时间信息，供调用方读取或传入。 */
  modifiedAt: string;
}

/** 定义知识发现端口的数据结构与类型约束。 */
export interface KnowledgeDiscoveryPort {
  /** 扫描请求。 */
  scan(configuredRoots: string[], maximum?: number): {
    candidates: KnowledgeDiscoveryCandidate[];
    total: number;
    truncated: boolean;
  };
}

/** 源码候选的兼容名称。 */
export type SourceCandidate = KnowledgeDiscoveryCandidate;

/** 扫描只需已提交正文的工件标识，不依赖完整 Application 仓库接口。 */
export interface SourceKnowledgeReader {
  /** 列出已入库知识，用于按正文摘要去重。 */
  listKnowledgeVersions(): { bodyRef: { artifactId: string } }[];
}


/** 封装源码Scanner的对外操作与协作依赖。 */
export class SourceScanner implements KnowledgeDiscoveryPort {
  /** 提供仓库根目录信息，供调用方读取或传入。 */
  readonly repositoryRoot: string;
  /** 提供仓库信息，供调用方读取或传入。 */
  readonly repository: SourceKnowledgeReader;

  /** 注入协作依赖并初始化实例状态。 */
  constructor(repositoryRoot: string, repository: SourceKnowledgeReader) {
    this.repositoryRoot = realpathSync(repositoryRoot);
    this.repository = repository;
  }

  /** 扫描请求。 */
  scan(configuredRoots: string[], maximum = 50): { candidates: SourceCandidate[]; total: number; truncated: boolean } {
    const committed = new Set(this.repository.listKnowledgeVersions().map((version) => version.bodyRef.artifactId));
    const candidates: SourceCandidate[] = [];
    for (const configured of configuredRoots) {
      const requested = isAbsolute(configured) ? configured : join(this.repositoryRoot, configured);
      let root: string;
      try {
        root = realpathSync(requested);
      } catch {
        continue;
      }
      const rel = relative(this.repositoryRoot, root);
      if (rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) {
        throw new Error(`SOURCE_ROOT_DENIED: ${configured}`);
      }
      this.walk(root, committed, candidates);
    }
    candidates.sort((left, right) => left.modifiedAt.localeCompare(right.modifiedAt) || left.path.localeCompare(right.path));
    return { candidates: candidates.slice(0, maximum), total: candidates.length, truncated: candidates.length > maximum };
  }

  private walk(directory: string, committed: Set<string>, candidates: SourceCandidate[]): void {
    for (const name of readdirSync(directory).sort()) {
      if (ignoredDirectories.has(name)) continue;
      const path = join(directory, name);
      const linkStat = lstatSync(path);
      if (linkStat.isSymbolicLink()) continue;
      if (linkStat.isDirectory()) {
        this.walk(path, committed, candidates);
        continue;
      }
      if (!linkStat.isFile() || !name.endsWith('.md') || ignoredFiles.has(name)) continue;
      const bytes = readFileSync(path);
      const digest = sha256(bytes);
      if (committed.has(artifactIdFor(digest))) continue;
      const info = statSync(path);
      candidates.push({
        path: relative(this.repositoryRoot, resolve(path)).replaceAll('\\', '/'),
        sha256: digest,
        size: info.size,
        modifiedAt: info.mtime.toISOString(),
      });
    }
  }
}
