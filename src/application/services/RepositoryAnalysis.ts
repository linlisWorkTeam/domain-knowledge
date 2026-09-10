/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：固定仓库源码清单到 CAS，环境观测不污染可复用源码身份。
 */
import type { ArtifactStore } from '../ports/ApplicationPorts.ts';
import type { RepositoryAnalyzer } from '../ports/RepositoryAnalysisPorts.ts';
export class RepositoryAnalysisService {
  constructor(analyzer: RepositoryAnalyzer, artifacts: ArtifactStore) { this.analyzer = analyzer; this.artifacts = artifacts; }
  private readonly analyzer: RepositoryAnalyzer;
  private readonly artifacts: ArtifactStore;
  async analyze(directory: string, revision?: string, signal?: AbortSignal) {
    const report = await this.analyzer.analyze(directory, revision, signal);
    const { tools, resources, warnings, requestedRevision, ...manifest } = report;
    const manifestRef = await this.artifacts.put(Buffer.from(JSON.stringify(manifest)), 'application/json');
    return { ...report, manifestRef, inspectedAt: new Date().toISOString() };
  }
}
