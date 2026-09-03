import type { ArtifactRef } from '../../domain/index.ts';

export interface ContentCommand {
  idempotencyKey: string;
  fingerprint: string;
  actor: string;
}

export interface ContentGovernancePort {
  initialize(): void;
  getKnowledgeLineage(versionId: string): Record<string, unknown> | null;
  getKnowledgeDiff(versionId: string, againstVersionId: string): Promise<Record<string, unknown> | null>;
  listEvaluations(filters?: Record<string, string>): Record<string, unknown>[];
  getEvaluation(evaluationId: string): Record<string, unknown> | null;
  listEvaluationArtifacts(
    evaluationId: string,
    downloadsAuthorized: boolean,
  ): Record<string, unknown> | null;
  getEvaluationArtifact(
    evaluationId: string,
    artifactId: string,
  ): Promise<{ ref: ArtifactRef; bytes: Uint8Array } | null>;
  listEvaluationRules(): Record<string, unknown>[];
  getEvaluationRule(ruleId: string): Record<string, unknown> | null;
  updateEvaluationRule(
    ruleId: string,
    input: Record<string, unknown>,
    command: ContentCommand,
  ): Record<string, unknown>;
  listSources(filters?: Record<string, string>): Record<string, unknown>[];
  getSource(sourceId: string): Record<string, unknown> | null;
  createSource(
    input: Record<string, unknown>,
    command: ContentCommand,
  ): Promise<Record<string, unknown>>;
  updateSource(
    sourceId: string,
    input: Record<string, unknown>,
    command: ContentCommand,
  ): Promise<Record<string, unknown>>;
  refreshSource(sourceId: string, command: ContentCommand): Promise<Record<string, unknown>>;
  getKnowledgeHealth(window: string): Record<string, unknown>;
}

/** Application boundary for DEV-008 content, quality, and source governance use cases. */
export class ContentGovernanceApp {
  readonly port: ContentGovernancePort;

  constructor(port: ContentGovernancePort) {
    this.port = port;
    this.port.initialize();
  }

  getKnowledgeLineage(versionId: string) {
    return this.port.getKnowledgeLineage(versionId);
  }

  getKnowledgeDiff(versionId: string, againstVersionId: string) {
    return this.port.getKnowledgeDiff(versionId, againstVersionId);
  }

  listEvaluations(filters: Record<string, string> = {}) {
    return this.port.listEvaluations(filters);
  }

  getEvaluation(evaluationId: string) {
    return this.port.getEvaluation(evaluationId);
  }

  listEvaluationArtifacts(evaluationId: string, downloadsAuthorized: boolean) {
    return this.port.listEvaluationArtifacts(evaluationId, downloadsAuthorized);
  }

  getEvaluationArtifact(evaluationId: string, artifactId: string) {
    return this.port.getEvaluationArtifact(evaluationId, artifactId);
  }

  listEvaluationRules() {
    return this.port.listEvaluationRules();
  }

  getEvaluationRule(ruleId: string) {
    return this.port.getEvaluationRule(ruleId);
  }

  updateEvaluationRule(ruleId: string, input: Record<string, unknown>, command: ContentCommand) {
    return this.port.updateEvaluationRule(ruleId, input, command);
  }

  listSources(filters: Record<string, string> = {}) {
    return this.port.listSources(filters);
  }

  getSource(sourceId: string) {
    return this.port.getSource(sourceId);
  }

  createSource(input: Record<string, unknown>, command: ContentCommand) {
    return this.port.createSource(input, command);
  }

  updateSource(sourceId: string, input: Record<string, unknown>, command: ContentCommand) {
    return this.port.updateSource(sourceId, input, command);
  }

  refreshSource(sourceId: string, command: ContentCommand) {
    return this.port.refreshSource(sourceId, command);
  }

  getKnowledgeHealth(window: string) {
    return this.port.getKnowledgeHealth(window);
  }
}
