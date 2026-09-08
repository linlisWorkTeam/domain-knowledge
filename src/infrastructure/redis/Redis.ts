/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：提供Redis的基础设施实现与外部系统接入。
 */
import { randomUUID } from 'node:crypto';
import { assertArtifactRef, assertInvariant } from '../../domain/Domain.ts';
import type {
  AgentContextSnapshot, AgentContextStore, RunningStateLease, RunningStateStore,
} from '../../application/ports/ApplicationPorts.ts';

const MAX_AGENT_CONTEXT_BYTES = 64 * 1024;
const AGENT_CONTEXT_KEYS = new Set(['iteration', 'attempt', 'inputRefs', 'outputRefs', 'route']);
const ARTIFACT_REF_KEYS = new Set(['artifactId', 'mediaType', 'sha256', 'size']);

/** 定义Redis命令客户端的数据结构与类型约束。 */
export interface RedisCommandClient {
  /** 读取请求。 */
  get(key: string): Promise<string | null>;
  /** 设置请求。 */
  set(
    key: string,
    value: string,
    options: { PX: number; NX?: boolean },
  ): Promise<string | null>;
  /** 提供 del 对应的del操作。 */
  del(key: string): Promise<number>;
  /** 提供 eval 对应的eval操作。 */
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

/** 封装Redis角色上下文存储的对外操作与协作依赖。 */
export class RedisAgentContextStore implements AgentContextStore {
  /** 提供client信息，供调用方读取或传入。 */
  readonly client: RedisCommandClient;
  /** 提供namespace信息，供调用方读取或传入。 */
  readonly namespace: string;

  /** 注入协作依赖并初始化实例状态。 */
  constructor(client: RedisCommandClient, namespace = 'domain-knowledge') {
    this.client = client;
    this.namespace = segment(namespace);
  }

  /** 读取请求。 */
  async get(runId: string, nodeId: string): Promise<AgentContextSnapshot | null> {
    const value = await this.client.get(this.key(runId, nodeId));
    if (value === null) return null;
    const parsed: unknown = JSON.parse(value);
    assertAgentContext(parsed);
    return parsed;
  }

  /** 设置请求。 */
  async set(runId: string, nodeId: string, context: AgentContextSnapshot, ttlMs: number): Promise<void> {
    positiveTtl(ttlMs);
    assertAgentContext(context);
    const serialized = JSON.stringify(context);
    assertInvariant(Buffer.byteLength(serialized, 'utf8') <= MAX_AGENT_CONTEXT_BYTES, 'redis agent context exceeds 64 KiB');
    await this.client.set(this.key(runId, nodeId), serialized, { PX: ttlMs });
  }

  /** 删除请求。 */
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

/** 封装RedisRunning状态存储的对外操作与协作依赖。 */
export class RedisRunningStateStore implements RunningStateStore {
  /** 提供client信息，供调用方读取或传入。 */
  readonly client: RedisCommandClient;
  /** 提供namespace信息，供调用方读取或传入。 */
  readonly namespace: string;
  /** 提供 时钟 对应的时钟操作。 */
  readonly clock: () => number;

  /** 注入协作依赖并初始化实例状态。 */
  constructor(
    client: RedisCommandClient,
    /** 提供 输入 对应的输入操作。 */
    input: { namespace?: string; clock?: () => number } = {},
  ) {
    this.client = client;
    this.namespace = segment(input.namespace ?? 'domain-knowledge');
    this.clock = input.clock ?? Date.now;
  }

  /** 提供 acquire 对应的acquire操作。 */
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

  /** 读取请求。 */
  async get(runId: string): Promise<RunningStateLease | null> {
    const value = await this.client.get(this.key(runId));
    if (value === null) return null;
    const lease = JSON.parse(value) as RunningStateLease;
    assertInvariant(lease.runId === runId, 'redis running state scope mismatch');
    assertInvariant(lease.ownerId.trim().length > 0, 'redis running state ownerId is required');
    assertInvariant(lease.leaseId.trim().length > 0, 'redis running state leaseId is required');
    return lease;
  }

  /** 释放请求。 */
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
