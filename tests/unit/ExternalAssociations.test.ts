/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：外部引用不从子串或未选择材料伪造关系，也不推断可替代性。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256 } from '../../src/domain/Domain.ts';
import { associateExternalMaterials } from '../../src/domain/association/ExternalAssociations.ts';
import type { AssociationCard } from '../../src/domain/association/CardAssociations.ts';

test('external references require a selected exact symbol and retain negative-context evidence without claiming equivalence', () => {
  const card: AssociationCard = { cardId: 'card', versionId: 'version', bodyDigest: 'body', body: '# Parse', symbol: 'parse', repositoryId: 'repo', sourceRevision: 'commit', applicability: 'Complete buffers' };
  const source = (text: string) => {
    const ref = { artifactId: 'fixture', sha256: sha256(text), mediaType: 'text/plain', size: Buffer.byteLength(text) };
    return { text, material: { materialId: `material-${ref.sha256}`, contractVersion: 'external-material-v1', sourceId: 'source', sourceRevision: `sha256:${ref.sha256}`, locator: 'guide.md', title: 'Guide', applicability: 'Incremental buffers', rawRef: ref, textRef: ref, capturedAt: 'fixed' } };
  };
  assert.deepEqual(associateExternalMaterials([card], []), []);
  assert.deepEqual(associateExternalMaterials([card], [source('parseExtra namespace::parse')]), []);
  const [relation] = associateExternalMaterials([card], [source('# Advice\nDo not use parse here.')]);
  assert.equal(relation?.evidence.line, 2);
  assert.equal(relation?.evidence.excerpt, 'Do not use parse here.');
  assert.equal(relation?.replacementVerified, false);
  assert.equal(relation?.materialApplicability, 'Incremental buffers');
  assert.equal(relation?.cardApplicability, 'Complete buffers');
  assert.deepEqual(associateExternalMaterials([{ ...card, symbol: 'ns::parse' }], [source('parse')]), []);
});
