import type { ArtifactRef } from '../index.ts';

export const AGENT_IDS = [
  'orchestrator', 'doc-gen', 'doc-worker', 'test-gen', 'code', 'check', 'review',
] as const;

export type AgentId = typeof AGENT_IDS[number];

export interface AgentCommand {
  schemaVersion: '1.0';
  commandId: string;
  runId: string;
  agentType: AgentId;
  generationKey: string;
  payload: Record<string, unknown>;
}

export interface AgentResult {
  schemaVersion: '1.0';
  commandId: string;
  commandRef: ArtifactRef;
  runId: string;
  agentType: AgentId;
  status: 'SUCCEEDED' | 'FAILED';
  outputRefs: ArtifactRef[];
  payload: Record<string, unknown>;
}
