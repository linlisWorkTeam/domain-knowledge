import {
  lstatSync, readFileSync, readdirSync, realpathSync, statSync,
} from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { artifactIdFor, sha256 } from '../../domain/index.ts';
import type { FlywheelRepository } from '../../application/ports/index.ts';

const ignoredDirectories = new Set(['.git', '.dsh', '.workpanel', '__pycache__', 'node_modules', 'dist', 'build', 'runtime', 'history']);
const ignoredFiles = new Set(['README.md', 'index.md', 'log.md']);

export interface SourceCandidate {
  path: string;
  sha256: string;
  size: number;
  modifiedAt: string;
}

export class SourceScanner {
  readonly repositoryRoot: string;
  readonly repository: FlywheelRepository;

  constructor(repositoryRoot: string, repository: FlywheelRepository) {
    this.repositoryRoot = realpathSync(repositoryRoot);
    this.repository = repository;
  }

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
