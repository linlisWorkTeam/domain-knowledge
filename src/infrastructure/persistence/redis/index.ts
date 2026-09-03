import { randomUUID } from 'node:crypto';
import { assertArtifactRef, assertInvariant } from '../../../domain/index.ts';
import type {
  AgentContextSnapshot, AgentContextStore, RunningStateLease, RunningStateStore,
} from '../../../application/ports/index.ts';

const MAX_AGENT_CONTEXT_BYTES = 64 * 1024;
const AGENT_CONTEXT_KEYS = new Set(['iteration', 'attempt', 'inputRefs', 'outputRefs', 'route']);
const ARTIFACT_REF_KEYS = new Set(['artifactId', 'mediaType', 'sha256', 'size']);

export interface RedisCommandClient {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    options: { PX: number; NX?: boolean },
  ): Promise<string | null>;
  del(key: string): Promise<number>;
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<number>;
}

function segment(value: string): string {
  assertInvariant(value.trim().length > 0, 'redis key segment is required');
  return encodeURIComponent(value);
}

function positiveTtl(ttlMs: number): void {
  assertInvariant(Number.isSafeInteger(ttlMs) && ttlMs > 0, 'redis ttlMs must be a positive integer');
}

function assertAgentContext(value: unknown): asserts value is AgentContextSnapshot {
  assertInvariant(value !== null && typeof value === 'object' && !Array.isArray(value), 'redis agent context must be an object');
  const context = value as Record<string, unknown>;
  assertInvariant(Object.keys(context).every((key) => AGENT_CONTEXT_KEYS.has(key)), 'redis agent context contains forbidden fields');
  assertInvariant(Number.isSafeInteger(context.iteration) && Number(context.iteration) >= 0, 'redis agent context iteration is invalid');
  assertInvariant(Number.isSafeInteger(context.attempt) && Number(context.attempt) >= 0, 'redis agent context attempt is invalid');
  assertInvariant(Array.isArray(context.inputRefs) && Array.isArray(context.outputRefs), 'redis agent context refs are invalid');
  for (const ref of [...context.inputRefs, ...context.outputRefs]) {
    assertInvariant(ref !== null && typeof ref === 'object' && !Array.isArray(ref), 'redis artifact ref must be an object');
    const keys = Object.keys(ref);
    assertInvariant(
      keys.length === ARTIFACT_REF_KEYS.size && keys.every((key) => ARTIFACT_REF_KEYS.has(key)),
      'redis artifact ref contains forbidden fields',
    );
    assertArtifactRef(ref as never);
  }
  assertInvariant(
    context.route === null || ['PASS', 'ITERATE', 'STOPPED', 'FAILED'].includes(String(context.route)),
    'redis agent context route is invalid',
  );
}

export class RedisAgentContextStore implements AgentContextStore {
  readonly client: RedisCommandClient;
  readonly namespace: string;

  constructor(client: RedisCommandClient, namespace = 'domain-knowledge') {
    this.client = client;
    this.namespace = segment(namespace);
  }

  async get(runId: string, nodeId: string): Promise<AgentContextSnapshot | null> {
    const value = await this.client.get(this.key(runId, nodeId));
    if (value === null) return null;
    const parsed: unknown = JSON.parse(value);
    assertAgentContext(parsed);
    return parsed;
  }

  async set(runId: string, nodeId: string, context: AgentContextSnapshot, ttlMs: number): Promise<void> {
    positiveTtl(ttlMs);
    assertAgentContext(context);
    const serialized = JSON.stringify(context);
    assertInvariant(Buffer.byteLength(serialized, 'utf8') <= MAX_AGENT_CONTEXT_BYTES, 'redis agent context exceeds 64 KiB');
    await this.client.set(this.key(runId, nodeId), serialized, { PX: ttlMs });
  }

  async delete(runId: string, nodeId: string): Promise<void> {
    await this.client.del(this.key(runId, nodeId));
  }

  private key(runId: string, nodeId: string): string {
    return `${this.namespace}:agent-context:${segment(runId)}:${segment(nodeId)}`;
  }
}

const RELEASE_LEASE_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if not current then return 0 end
local lease = cjson.decode(current)
if lease.ownerId ~= ARGV[1] or lease.leaseId ~= ARGV[2] then return 0 end
return redis.call('DEL', KEYS[1])
`.trim();

export class RedisRunningStateStore implements RunningStateStore {
  readonly client: RedisCommandClient;
  readonly namespace: string;
  readonly clock: () => number;

  constructor(
    client: RedisCommandClient,
    input: { namespace?: string; clock?: () => number } = {},
  ) {
    this.client = client;
    this.namespace = segment(input.namespace ?? 'domain-knowledge');
    this.clock = input.clock ?? Date.now;
  }

  async acquire(runId: string, ownerId: string, ttlMs: number): Promise<RunningStateLease | null> {
    positiveTtl(ttlMs);
    assertInvariant(ownerId.trim().length > 0, 'running state ownerId is required');
    const lease: RunningStateLease = {
      runId,
      ownerId,
      leaseId: randomUUID(),
      expiresAt: new Date(this.clock() + ttlMs).toISOString(),
    };
    const stored = await this.client.set(this.key(runId), JSON.stringify(lease), { PX: ttlMs, NX: true });
    return stored === null ? null : lease;
  }

  async get(runId: string): Promise<RunningStateLease | null> {
    const value = await this.client.get(this.key(runId));
    if (value === null) return null;
    const lease = JSON.parse(value) as RunningStateLease;
    assertInvariant(lease.runId === runId, 'redis running state scope mismatch');
    assertInvariant(lease.ownerId.trim().length > 0, 'redis running state ownerId is required');
    assertInvariant(lease.leaseId.trim().length > 0, 'redis running state leaseId is required');
    return lease;
  }

  async release(runId: string, ownerId: string, leaseId: string): Promise<boolean> {
    assertInvariant(ownerId.trim().length > 0, 'running state ownerId is required');
    assertInvariant(leaseId.trim().length > 0, 'running state leaseId is required');
    return await this.client.eval(RELEASE_LEASE_SCRIPT, {
      keys: [this.key(runId)],
      arguments: [ownerId, leaseId],
    }) === 1;
  }

  private key(runId: string): string {
    return `${this.namespace}:running-state:${segment(runId)}`;
  }
}
