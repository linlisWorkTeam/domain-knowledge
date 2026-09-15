/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证删除工件读取的目录边界、裸引用、缺失及大小/摘要检查。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createArtifactRef } from '../../src/domain/Domain.ts';
import { CasDeletionReader } from '../../src/infrastructure/sqlite/CasDeletionReader.ts';
test('bare CAS identities read only verified ordinary files and distinguish absence from invalid storage', async () => {
  const root = mkdtempSync(join(tmpdir(), 'deletion-reader-')), content = Buffer.from('preserved source');
  const ref = createArtifactRef(content, 'text/plain'), shard = join(root, 'sha256', ref.sha256.slice(0, 2)), path = join(shard, ref.sha256);
  try {
    const reader = new CasDeletionReader(root);
    assert.equal(await reader.read(ref.artifactId, 1024), null);
    mkdirSync(shard, { recursive: true }); writeFileSync(path, content);
    assert.deepEqual(await reader.read(ref.artifactId, 1024), content);
    await assert.rejects(reader.read(ref.artifactId, content.length - 1), /DELETION_ARTIFACT_LIMIT/);
    await assert.rejects(reader.read('sha256:../../outside', 1024), /DELETION_ARTIFACT_ID_INVALID/);
    writeFileSync(path, 'corrupt');
    await assert.rejects(reader.read(ref.artifactId, 1024), /DELETION_ARTIFACT_CORRUPT/);
    rmSync(path); mkdirSync(path);
    await assert.rejects(reader.read(ref.artifactId, 1024), /DELETION_ARTIFACT_NOT_REGULAR/);
    await assert.rejects(new CasDeletionReader(join(root, 'missing-root')).read(ref.artifactId, 1024));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('CAS leaf and intermediate symlinks are rejected even when target content has the correct digest', async () => {
  const root = mkdtempSync(join(tmpdir(), 'deletion-links-')), external = mkdtempSync(join(tmpdir(), 'deletion-external-'));
  const content = Buffer.from('external content'), ref = createArtifactRef(content, 'text/plain');
  const shard = join(root, 'sha256', ref.sha256.slice(0, 2)), path = join(shard, ref.sha256);
  try {
    mkdirSync(shard, { recursive: true }); writeFileSync(join(external, ref.sha256), content);
    symlinkSync(join(external, ref.sha256), path);
    const reader = new CasDeletionReader(root);
    await assert.rejects(reader.read(ref.artifactId, 1024), /DELETION_ARTIFACT_ACCESS_FAILED/);
    rmSync(shard, { recursive: true }); symlinkSync(external, shard);
    await assert.rejects(reader.read(ref.artifactId, 1024), /DELETION_ARTIFACT_ACCESS_FAILED/);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(external, { recursive: true, force: true }); }
});
