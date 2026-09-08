/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证源码Scan的行为、约束及失败场景。
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { SourceScanner } from '../../src/domain/sourceScan/SourceScan.ts';
import { createTestComposition, GOOD_BODY } from '../helpers/Fixture.ts';

test('source scan is read-only, bounded, and deduplicates committed bodies', async () => {
  const fixture = createTestComposition();
  const sourceRoot = mkdtempSync(join(tmpdir(), 'wp-sources-'));
  try {
    const inbox = join(sourceRoot, 'knowledge', 'inbox');
    mkdirSync(inbox, { recursive: true });
    writeFileSync(join(inbox, 'candidate.md'), GOOD_BODY);
    const scanner = new SourceScanner(sourceRoot, fixture.repository);
    const first = scanner.scan(['knowledge/inbox'], 10);
    assert.equal(first.total, 1);
    assert.equal(first.candidates[0].path, 'knowledge/inbox/candidate.md');
    await fixture.service.ingestCandidate({
      moduleId: 'scanned-card', body: GOOD_BODY, title: 'Scanned Card',
      description: 'Source scanner deduplication fixture.',
      provenance: [{ path: 'knowledge/inbox/candidate.md', pinned: true }],
    });
    assert.equal(scanner.scan(['knowledge/inbox'], 10).total, 0);
  } finally {
    fixture.dispose();
    rmSync(sourceRoot, { recursive: true, force: true });
  }
});

test('source scan denies roots outside repository boundary', () => {
  const fixture = createTestComposition();
  const sourceRoot = mkdtempSync(join(tmpdir(), 'wp-sources-'));
  try {
    const scanner = new SourceScanner(sourceRoot, fixture.repository);
    assert.throws(() => scanner.scan([fixture.runtimeDir]), /SOURCE_ROOT_DENIED/);
  } finally {
    fixture.dispose();
    rmSync(sourceRoot, { recursive: true, force: true });
  }
});
