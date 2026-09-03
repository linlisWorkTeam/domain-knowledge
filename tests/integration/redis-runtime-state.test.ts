import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RedisAgentContextStore, RedisRunningStateStore, type RedisCommandClient,
} from '../../src/infrastructure/persistence/redis/index.ts';

class FakeRedisClient implements RedisCommandClient {
  readonly values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string, options: { PX: number; NX?: boolean }): Promise<string | null> {
    assert.ok(options.PX > 0);
    if (options.NX && this.values.has(key)) return null;
    this.values.set(key, value);
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return this.values.delete(key) ? 1 : 0;
  }

  async eval(_script: string, options: { keys: string[]; arguments: string[] }): Promise<number> {
    const [key] = options.keys;
    const [ownerId, leaseId] = options.arguments;
    const value = this.values.get(key);
    const lease = value ? JSON.parse(value) as { ownerId: string; leaseId: string } : null;
    if (!lease || lease.ownerId !== ownerId || lease.leaseId !== leaseId) return 0;
    this.values.delete(key);
    return 1;
  }
}

test('RedisAgentContextStore keeps transient context outside business persistence', async () => {
  const client = new FakeRedisClient();
  const store = new RedisAgentContextStore(client, 'test');
  const context = { iteration: 2, attempt: 1, inputRefs: [], outputRefs: [], route: null };
  await store.set('run/1', 'doc-gen', context, 5_000);
  assert.deepEqual(await store.get('run/1', 'doc-gen'), context);
  await store.delete('run/1', 'doc-gen');
  assert.equal(await store.get('run/1', 'doc-gen'), null);
});

test('RedisAgentContextStore rejects business payloads and oversized context', async () => {
  const store = new RedisAgentContextStore(new FakeRedisClient(), 'test');
  await assert.rejects(
    store.set('run-1', 'doc-gen', {
      iteration: 0, attempt: 0, inputRefs: [], outputRefs: [], route: null, prompt: 'secret',
    } as never, 5_000),
    /forbidden fields/,
  );
  const ref = { artifactId: `sha256:${'a'.repeat(64)}`, sha256: 'a'.repeat(64), mediaType: 'text/plain', size: 1 };
  await assert.rejects(
    store.set('run-1', 'doc-gen', {
      iteration: 0, attempt: 0, inputRefs: [{ ...ref, prompt: 'secret' } as never], outputRefs: [], route: null,
    }, 5_000),
    /artifact ref contains forbidden fields/,
  );
  await assert.rejects(
    store.set('run-1', 'doc-gen', {
      iteration: 0, attempt: 0, inputRefs: Array.from({ length: 500 }, () => ref), outputRefs: [], route: null,
    }, 5_000),
    /exceeds 64 KiB/,
  );
});

test('RedisRunningStateStore uses an owner lease and rejects competing release', async () => {
  const client = new FakeRedisClient();
  const store = new RedisRunningStateStore(client, {
    namespace: 'test', clock: () => Date.parse('2026-09-03T00:00:00.000Z'),
  });
  const lease = await store.acquire('run-1', 'worker-a', 10_000);
  assert.equal(lease?.runId, 'run-1');
  assert.equal(lease?.ownerId, 'worker-a');
  assert.equal(lease?.expiresAt, '2026-09-03T00:00:10.000Z');
  assert.match(lease?.leaseId ?? '', /^[0-9a-f-]{36}$/);
  assert.equal(await store.acquire('run-1', 'worker-b', 10_000), null);
  assert.equal(await store.release('run-1', 'worker-b', lease?.leaseId ?? ''), false);
  assert.equal(await store.release('run-1', 'worker-a', lease?.leaseId ?? ''), true);
  assert.equal(await store.get('run-1'), null);
});

test('RedisRunningStateStore rejects a stale release after the same owner reacquires', async () => {
  const client = new FakeRedisClient();
  const store = new RedisRunningStateStore(client, { namespace: 'test' });
  const stale = await store.acquire('run-1', 'worker-a', 10_000);
  assert.ok(stale);
  client.values.clear(); // Simulate Redis TTL expiry.
  const current = await store.acquire('run-1', 'worker-a', 10_000);
  assert.ok(current);
  assert.notEqual(current.leaseId, stale.leaseId);
  assert.equal(await store.release('run-1', stale.ownerId, stale.leaseId), false);
  assert.equal(await store.release('run-1', current.ownerId, current.leaseId), true);
});
