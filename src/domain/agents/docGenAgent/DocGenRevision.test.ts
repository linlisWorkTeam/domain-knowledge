/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证 Markdown 定位不会被代码块标题或重复章节扩大。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { markdownSections, validateOutline, validateRevision } from './DocGenRevision.ts';

test('doc-gen revision: code fences do not create authorized H2 sections', () => {
  const base = '# Title\r\n\r\n## Real\r\n~~~md\r\n## Fake\r\n~~~\r\nold\r\n\r\n## Stable\r\nkeep\r\n';
  assert.deepEqual(markdownSections(base).map((section) => section.heading), ['Real', 'Stable']);
  assert.doesNotThrow(() => validateRevision(base, base.replace('old', 'new'), new Set(['Real'])));
  assert.throws(() => validateRevision(base, base.replace('keep', 'changed'), new Set(['Real'])), /CORRECTION_NOT_APPLIED|OUTSIDE_CORRECTION/);
});

test('doc-gen revision: multiple named H2 changes preserve all remaining bytes', () => {
  const base = '# Title\n\n## A\none\n\n## B\nkeep\n\n## C\nthree\n';
  const revised = base.replace('one', 'new one with extra lines\nnext').replace('three', 'new three');
  assert.doesNotThrow(() => validateRevision(base, revised, new Set(['A', 'C'])));
  assert.throws(() => validateRevision(base, revised.replace('keep', 'tampered'), new Set(['A', 'C'])), /OUTSIDE_CORRECTION/);
  assert.throws(() => validateRevision(base, revised.replace('## B', '## A'), new Set(['A', 'C'])), /OUTSIDE_CORRECTION/);
  assert.throws(() => validateRevision(base, revised.replace('# Title', '# Other'), new Set(['A', 'C'])), /OUTSIDE_CORRECTION/);
});

test('doc-gen outline: duplicate and multiline headings are rejected', () => {
  for (const headings of [['Same', 'Same'], ['Two\nlines'], ['## Already marked'], [' Space ']]) {
    assert.throws(() => validateOutline({ title: 'Title', description: 'Description', sections: headings.map((heading) => ({ heading, purpose: 'explain' })) }), /OUTLINE_INVALID/);
  }
});


test('doc-gen revision: indented H2 remains protected and a second H1 cannot expand its scope', () => {
  const base = '# Title\n\n## A\nold\n\n  ## B\nkeep\n';
  assert.deepEqual(markdownSections(base).map((section) => section.heading), ['A', 'B']);
  assert.throws(() => validateRevision(base, base.replace('old', 'new').replace('keep', 'tampered'), new Set(['A'])), /OUTSIDE_CORRECTION/);
  assert.throws(() => validateRevision(base, base.replace('old', '# Injected title\nnew'), new Set(['A'])), /DOCUMENT_HIERARCHY_INVALID/);
});
