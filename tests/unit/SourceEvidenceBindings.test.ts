/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证摘要种类明确区分且仅对应冻结模块源文件。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCE_EVIDENCE_POLICY, sourceEvidenceBindings } from '../../src/domain/knowledge/SourceEvidenceBindings.ts';
import { createPublicationPreparationFixture } from '../helpers/PublicationPreparationFixture.ts';
test('source evidence distinguishes manifest identity from file content without changing legacy inputs', async () => {
  const { project } = await createPublicationPreparationFixture();
  assert.equal(sourceEvidenceBindings(undefined, project, 'module'), undefined);
  const value = sourceEvidenceBindings(SOURCE_EVIDENCE_POLICY, project, 'module')!;
  assert.equal(value.repositoryFileManifest.sourceDigest, project.sourceDigest);
  assert.equal(value.sourceFiles[0]!.artifactRef.sha256, project.sourceFiles[0]!.ref.sha256);
  assert.notEqual(value.repositoryFileManifest.sourceDigest, value.sourceFiles[0]!.artifactRef.sha256);
  value.sourceFiles[0]!.artifactRef.sha256 = 'changed';
  assert.notEqual(project.sourceFiles[0]!.ref.sha256, 'changed');
  assert.throws(() => sourceEvidenceBindings('future-policy', project, 'module'), /SOURCE_EVIDENCE_POLICY_INVALID/);
  assert.throws(() => sourceEvidenceBindings(SOURCE_EVIDENCE_POLICY, project, 'other-module'), /SOURCE_EVIDENCE_MODULE_INVALID/);
});
