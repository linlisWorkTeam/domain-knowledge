/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证知识描述序列化、持久化索引与授权渐进读取。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import YAML from 'yaml';
import { renderKnowledgeDocument } from '../../src/domain/knowledge/KnowledgeDocument.ts';
import { createTestComposition, GOOD_BODY } from '../helpers/Fixture.ts';
import { KnowledgeQueryService } from '../../src/application/services/QueryService.ts';

test('framework escapes YAML metadata and rejects model-authored headers and empty keywords', () => {
  const document = { title: 'Title: special\n---', description: 'Summary # with YAML punctuation',
    keywords: ['C++', '业务'], body: GOOD_BODY };
  const rendered = renderKnowledgeDocument(document);
  const end = rendered.indexOf('\n---\n', 4);
  assert.deepEqual(YAML.parse(rendered.slice(4, end)), {
    title: document.title, description: document.description, keywords: document.keywords,
  });
  assert.ok(rendered.endsWith(GOOD_BODY));
  assert.throws(() => renderKnowledgeDocument({ ...document, body: '---\ntitle: fake\n---\nbody' }), /FRONTMATTER_DENIED/);
  for (const keywords of [[], [' '], ['a', 'a'], [' a']]) {
    assert.throws(() => renderKnowledgeDocument({ ...document, keywords }), /DESCRIPTION_INVALID/);
  }
});

test('version index updates per document revision without loading bodies or broadening authorization', async () => {
  const c = createTestComposition();
  try {
    const first = await c.service.ingestCandidate({ moduleId: 'indexed', body: GOOD_BODY, title: 'First',
      description: 'First summary', tags: ['alpha'], provenance: [{ path: 'source.ts' }] });
    const second = await c.service.ingestCandidate({ moduleId: 'indexed', body: GOOD_BODY + '\nRevision', title: 'Second',
      description: 'Second summary', tags: ['beta'], provenance: [{ path: 'source.ts' }] });
    let reads = 0;
    const original = c.artifacts.get.bind(c.artifacts);
    c.artifacts.get = async (ref) => { reads++; return original(ref); };
    const query = new KnowledgeQueryService(c.artifacts, c.repository);
    const allowed = [second.version.versionId];
    const descriptions = query.describe(allowed);
    assert.equal(reads, 0);
    assert.equal(descriptions.length, 1);
    assert.deepEqual(descriptions[0]!.keywords, ['beta']);
    assert.equal(descriptions[0]!.description, 'Second summary');
    assert.equal(descriptions[0]!.body, undefined);
    await assert.rejects(query.loadDocument(first.version.versionId, allowed), /DOCUMENT_DENIED/);
    assert.equal(reads, 0);
    assert.equal((await query.loadDocument(second.version.versionId, allowed))!.body, GOOD_BODY + '\nRevision');
    assert.equal(reads, 1);
  } finally { c.dispose(); }
});
