import { assertInvariant } from '../../../domain/index.ts';
import type {
  AgentContextStore, RunningStateLease, RunningStateStore,
} from '../../../application/ports/index.ts';

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

export class RedisAgentContextStore implements AgentContextStore {
  readonly client: RedisCommandClient;
  readonly namespace: string;

  constructor(client: RedisCommandClient, namespace = 'domain-knowledge') {
    this.client = client;
    this.namespace = segment(namespace);
  }

  async get(runId: string, nodeId: string): Promise<Record<string, unknown> | null> {
    const value = await this.client.get(this.key(runId, nodeId));
    if (value === null) return null;
    const parsed: unknown = JSON.parse(value);
    assertInvariant(parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed), 'redis agent context must be an object');
    return parsed as Record<string, unknown>;
  }

  async set(runId: string, nodeId: string, context: Record<string, unknown>, ttlMs: number): Promise<void> {
    positiveTtl(ttlMs);
    await this.client.set(this.key(runId, nodeId), JSON.stringify(context), { PX: ttlMs });
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
if lease.ownerId ~= ARGV[1] then return 0 end
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
    return lease;
  }

  async release(runId: string, ownerId: string): Promise<boolean> {
    assertInvariant(ownerId.trim().length > 0, 'running state ownerId is required');
    return await this.client.eval(RELEASE_LEASE_SCRIPT, {
      keys: [this.key(runId)],
      arguments: [ownerId],
    }) === 1;
  }

  private key(runId: string): string {
    return `${this.namespace}:running-state:${segment(runId)}`;
  }
}
