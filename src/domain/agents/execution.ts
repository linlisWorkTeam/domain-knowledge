import type { ArtifactRef } from '../index.ts';
import type { AgentCommand, AgentId } from './contracts.ts';

export const ROLE_EXECUTION_VERSION = 'domain-agents-v1';
export interface Material { ref: ArtifactRef; content: unknown }
export interface RoleInput<P> {
  payload: P;
  materials: Material[];
  sourcePaths: string[];
  publicInterfacePaths: string[];
  provenance: ArtifactRef[];
  moduleId: string;
}
export interface ModelRequest {
  role: AgentId;
  prompt: string;
  outputSchema: Record<string, unknown>;
  tools: readonly string[];
  readablePaths: string[];
}
/** Runtime owns transport/format retries; roles own business steps. */
export interface ModelExecutionPort {
  execute(request: ModelRequest, signal?: AbortSignal): Promise<Record<string, unknown>>;
  assertOutput(output: unknown, schema: Record<string, unknown>): void;
}
export interface ExecutionContext {
  model: ModelExecutionPort;
  command: AgentCommand;
  effectivePrompt: string;
  iteration: number;
  signal?: AbortSignal;
}
export interface PendingArtifact { key: string; content: string; mediaType: string }
export interface RoleResult<O> { output: O; payload: Record<string, unknown>; artifacts: PendingArtifact[] }
export function pending(key: string) { return { pendingArtifact: key }; }
export function assertActive(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('AGENT_CANCELLED');
}
export function requireMaterials(payload: object, materials: Material[], required: string[]): void {
  for (const field of required) {
    const value = (payload as Record<string, unknown>)[field];
    if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) {
      throw new Error(`AGENT_COMMAND_INPUT_MISSING: ${field}`);
    }
  }
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if ('artifactId' in value) {
      if (!materials.some(({ ref }) => ref.artifactId === value.artifactId)) {
        throw new Error('AGENT_MATERIAL_MISSING');
      }
      return;
    }
    Object.values(value).forEach(visit);
  };
  visit(payload);
}

/** Prompt visibility follows the role payload, never the caller's material bag. */
export function materialsFor(payload: object, materials: Material[]): Material[] {
  const ids = new Set<unknown>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if ('artifactId' in value) { ids.add(value.artifactId); return; }
    Object.values(value).forEach(visit);
  };
  visit(payload);
  return materials.filter(({ ref }) => ids.has(ref.artifactId));
}
