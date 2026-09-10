/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证Markdown差异的行为、约束及失败场景。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { structuredMarkdownDiff } from '../../src/domain/services/knowledge/MarkdownDiff.ts';

test('Markdown diff keeps identical and empty documents unchanged', () => {
  for (const body of ['', '# 标题\n\n正文', 'one\ntwo\n']) {
    const result = structuredMarkdownDiff(body, body);
    assert.deepEqual(result.hunks, []);
    assert.deepEqual(result.changedSections, []);
    assert.equal(result.rangeValidation.validated, true);
  }
});

test('Markdown diff reports changed text with exact old and new line numbers', () => {
  const result = structuredMarkdownDiff('# 标题\n旧内容\n尾行', '# 标题\n新内容\n尾行');
  assert.deepEqual(result.changedSections, ['# 标题']);
  assert.deepEqual(result.hunks, [{
    oldStart: 1, oldCount: 3, newStart: 1, newCount: 3,
    lines: [
      { type: 'CONTEXT', oldLine: 1, newLine: 1, text: '# 标题' },
      { type: 'REMOVE', oldLine: 2, newLine: null, text: '旧内容' },
      { type: 'ADD', oldLine: null, newLine: 2, text: '新内容' },
      { type: 'CONTEXT', oldLine: 3, newLine: 3, text: '尾行' },
    ],
  }]);
});

test('Markdown diff normalizes CRLF and identifies changes before any heading', () => {
  assert.deepEqual(structuredMarkdownDiff('a\r\nb\r\n', 'a\nb\n').hunks, []);
  assert.deepEqual(structuredMarkdownDiff('old', 'new').changedSections, ['(document root)']);
});

test('Markdown diff separates distant edits and keeps their section attribution', () => {
  const middle = Array.from({ length: 12 }, (_, i) => `unchanged ${i}`).join('\n');
  const result = structuredMarkdownDiff(`## A\nold A\n${middle}\n## B\nold B`, `## A\nnew A\n${middle}\n## B\nnew B`);
  assert.equal(result.hunks.length, 2);
  assert.deepEqual(result.changedSections, ['## A', '## B']);
  for (const hunk of result.hunks) {
    assert.equal(hunk.oldCount, hunk.lines.filter((line) => line.oldLine !== null).length);
    assert.equal(hunk.newCount, hunk.lines.filter((line) => line.newLine !== null).length);
  }
});

test('Markdown diff represents insertion and deletion without inventing source lines', () => {
  const inserted = structuredMarkdownDiff('start\nend', 'start\ninserted\nend');
  assert.deepEqual(inserted.hunks[0]?.lines.filter((line) => line.type !== 'CONTEXT'), [
    { type: 'ADD', oldLine: null, newLine: 2, text: 'inserted' },
  ]);
  const deleted = structuredMarkdownDiff('start\nremoved\nend', 'start\nend');
  assert.deepEqual(deleted.hunks[0]?.lines.filter((line) => line.type !== 'CONTEXT'), [
    { type: 'REMOVE', oldLine: 2, newLine: null, text: 'removed' },
  ]);
});

test('Markdown diff uses bounded fallback for large inputs while retaining the actual change', () => {
  const lines = Array.from({ length: 2100 }, (_, i) => `line ${i}`);
  const changed = [...lines];
  changed[1050] = 'replacement';
  const result = structuredMarkdownDiff(lines.join('\n'), changed.join('\n'));
  assert.equal(result.rangeValidation.algorithm, 'BOUNDED_FALLBACK');
  assert.equal(result.rangeValidation.oldLines, 2100);
  assert.equal(result.rangeValidation.newLines, 2100);
  assert.deepEqual(result.hunks.flatMap((hunk) => hunk.lines).filter((line) => line.type !== 'CONTEXT'), [
    { type: 'REMOVE', oldLine: 1051, newLine: null, text: 'line 1050' },
    { type: 'ADD', oldLine: null, newLine: 1051, text: 'replacement' },
  ]);
});

test('Markdown diff rejects non-string input instead of fabricating a successful diff', () => {
  assert.throws(() => structuredMarkdownDiff(null as unknown as string, ''), TypeError);
  assert.throws(() => structuredMarkdownDiff('', {} as string), TypeError);
});
