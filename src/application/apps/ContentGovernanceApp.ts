/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：协调内容治理应用用例及其依赖的领域规则与端口。
 */
import type { ArtifactRef } from '../../domain/Domain.ts';

/** 定义内容命令的数据结构与类型约束。 */
export interface ContentCommand {
  /** 提供幂等键信息，供调用方读取或传入。 */
  idempotencyKey: string;
  /** 提供指纹信息，供调用方读取或传入。 */
  fingerprint: string;
  /** 提供actor信息，供调用方读取或传入。 */
  actor: string;
}

/** 定义内容治理端口的数据结构与类型约束。 */
export interface ContentGovernancePort {
  /** 初始化请求。 */
  initialize(): void;
  /** 读取知识血缘。 */
  getKnowledgeLineage(versionId: string): Record<string, unknown> | null;
  /** 读取知识差异。 */
  getKnowledgeDiff(versionId: string, againstVersionId: string): Promise<Record<string, unknown> | null>;
  /** 列出Evaluations。 */
  listEvaluations(filters?: Record<string, string>): Record<string, unknown>[];
  /** 读取评测。 */
  getEvaluation(evaluationId: string): Record<string, unknown> | null;
  /** 列出评测Artifacts。 */
  listEvaluationArtifacts(
    evaluationId: string,
    downloadsAuthorized: boolean,
  ): Record<string, unknown> | null;
  /** 读取评测工件。 */
  getEvaluationArtifact(
    evaluationId: string,
    artifactId: string,
  ): Promise<{ ref: ArtifactRef; bytes: Uint8Array } | null>;
  /** 列出评测Rules。 */
  listEvaluationRules(): Record<string, unknown>[];
  /** 读取评测Rule。 */
  getEvaluationRule(ruleId: string): Record<string, unknown> | null;
  /** 更新评测Rule。 */
  updateEvaluationRule(
    ruleId: string,
    input: Record<string, unknown>,
    command: ContentCommand,
  ): Record<string, unknown>;
  /** 列出Sources。 */
  listSources(filters?: Record<string, string>): Record<string, unknown>[];
  /** 读取源码。 */
  getSource(sourceId: string): Record<string, unknown> | null;
  /** 创建源码。 */
  createSource(
    input: Record<string, unknown>,
    command: ContentCommand,
  ): Promise<Record<string, unknown>>;
  /** 更新源码。 */
  updateSource(
    sourceId: string,
    input: Record<string, unknown>,
    command: ContentCommand,
  ): Promise<Record<string, unknown>>;
  /** 提供 refresh源码 对应的refresh源码操作。 */
  refreshSource(sourceId: string, command: ContentCommand): Promise<Record<string, unknown>>;
  /** 读取知识健康度。 */
  getKnowledgeHealth(window: string): Record<string, unknown>;
}

/** Application boundary for DEV-008 content, quality, and source governance use cases. */
/** 封装内容治理应用的对外操作与协作依赖。 */
export class ContentGovernanceApp {
  /** 提供端口信息，供调用方读取或传入。 */
  readonly port: ContentGovernancePort;

  /** 注入协作依赖并初始化实例状态。 */
  constructor(port: ContentGovernancePort) {
    this.port = port;
    this.port.initialize();
  }

  /** 读取知识血缘。 */
  getKnowledgeLineage(versionId: string) {
    return this.port.getKnowledgeLineage(versionId);
  }

  /** 读取知识差异。 */
  getKnowledgeDiff(versionId: string, againstVersionId: string) {
    return this.port.getKnowledgeDiff(versionId, againstVersionId);
  }

  /** 列出Evaluations。 */
  listEvaluations(filters: Record<string, string> = {}) {
    return this.port.listEvaluations(filters);
  }

  /** 读取评测。 */
  getEvaluation(evaluationId: string) {
    return this.port.getEvaluation(evaluationId);
  }

  /** 列出评测Artifacts。 */
  listEvaluationArtifacts(evaluationId: string, downloadsAuthorized: boolean) {
    return this.port.listEvaluationArtifacts(evaluationId, downloadsAuthorized);
  }

  /** 读取评测工件。 */
  getEvaluationArtifact(evaluationId: string, artifactId: string) {
    return this.port.getEvaluationArtifact(evaluationId, artifactId);
  }

  /** 列出评测Rules。 */
  listEvaluationRules() {
    return this.port.listEvaluationRules();
  }

  /** 读取评测Rule。 */
  getEvaluationRule(ruleId: string) {
    return this.port.getEvaluationRule(ruleId);
  }

  /** 更新评测Rule。 */
  updateEvaluationRule(ruleId: string, input: Record<string, unknown>, command: ContentCommand) {
    return this.port.updateEvaluationRule(ruleId, input, command);
  }

  /** 列出Sources。 */
  listSources(filters: Record<string, string> = {}) {
    return this.port.listSources(filters);
  }

  /** 读取源码。 */
  getSource(sourceId: string) {
    return this.port.getSource(sourceId);
  }

  /** 创建源码。 */
  createSource(input: Record<string, unknown>, command: ContentCommand) {
    return this.port.createSource(input, command);
  }

  /** 更新源码。 */
  updateSource(sourceId: string, input: Record<string, unknown>, command: ContentCommand) {
    return this.port.updateSource(sourceId, input, command);
  }

  /** 提供 refresh源码 对应的refresh源码操作。 */
  refreshSource(sourceId: string, command: ContentCommand) {
    return this.port.refreshSource(sourceId, command);
  }

  /** 读取知识健康度。 */
  getKnowledgeHealth(window: string) {
    return this.port.getKnowledgeHealth(window);
  }
}
