import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

type LockPackage = { resolved?: string };
type PackageLock = { packages?: Record<string, LockPackage> };

test('dependency lock uses immutable HTTPS package sources', () => {
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as PackageLock;
  const resolved = Object.entries(lock.packages ?? {})
    .flatMap(([name, entry]) => entry.resolved ? [[name, entry.resolved] as const] : []);

  assert.ok(resolved.length > 0, 'package-lock.json must contain resolved dependency URLs');
  for (const [name, url] of resolved) {
    assert.match(url, /^https:\/\//, `${name || '<root>'} must resolve over HTTPS: ${url}`);
    assert.doesNotMatch(url, /(?:\/refs\/heads\/|\/archive\/heads\/|[?&](?:branch|ref)=)/i,
      `${name || '<root>'} must not resolve from a moving branch: ${url}`);
  }
});
