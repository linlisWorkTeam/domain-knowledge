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
    const [ownerId] = options.arguments;
    const value = this.values.get(key);
    if (!value || (JSON.parse(value) as { ownerId: string }).ownerId !== ownerId) return 0;
    this.values.delete(key);
    return 1;
  }
}

test('RedisAgentContextStore keeps transient context outside business persistence', async () => {
  const client = new FakeRedisClient();
  const store = new RedisAgentContextStore(client, 'test');
  await store.set('run/1', 'doc-gen', { iteration: 2, artifactId: 'sha256:test' }, 5_000);
  assert.deepEqual(await store.get('run/1', 'doc-gen'), { iteration: 2, artifactId: 'sha256:test' });
  await store.delete('run/1', 'doc-gen');
  assert.equal(await store.get('run/1', 'doc-gen'), null);
});

test('RedisRunningStateStore uses an owner lease and rejects competing release', async () => {
  const client = new FakeRedisClient();
  const store = new RedisRunningStateStore(client, {
    namespace: 'test', clock: () => Date.parse('2026-09-03T00:00:00.000Z'),
  });
  const lease = await store.acquire('run-1', 'worker-a', 10_000);
  assert.deepEqual(lease, {
    runId: 'run-1', ownerId: 'worker-a', expiresAt: '2026-09-03T00:00:10.000Z',
  });
  assert.equal(await store.acquire('run-1', 'worker-b', 10_000), null);
  assert.equal(await store.release('run-1', 'worker-b'), false);
  assert.equal(await store.release('run-1', 'worker-a'), true);
  assert.equal(await store.get('run-1'), null);
});
