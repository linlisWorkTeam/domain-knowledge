/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证知识阅读器的可读结构与不可信正文隔离。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error 浏览器原生 JS 模块没有 TypeScript 声明。
import { renderKnowledgeMarkdown } from '../../web/KnowledgeMarkdown.js';

test('knowledge reader: headings, prose, lists, fences and tables preserve readable content', () => {
  const result = renderKnowledgeMarkdown('# 接口\n\n**公开方法** `render()`\n\n- 空输入\n- 特殊字符\n\n```ts\nconst html = "<b>";\n```\n\n| 输入 | 输出 |\n| --- | --- |\n| 空 | 空 |');
  assert.deepEqual(result.headings, [{id:'knowledge-heading-0', text:'接口', level:1}]);
  assert.match(result.html, /<h2 id="knowledge-heading-0"/);
  assert.match(result.html, /<strong>公开方法<\/strong> <code>render\(\)<\/code>/);
  assert.match(result.html, /<ul><li>空输入<\/li><li>特殊字符<\/li><\/ul>/);
  assert.match(result.html, /&lt;b&gt;/);
  assert.match(result.html, /<th scope="col">输入<\/th>/);
  assert.match(result.html, /<td>空<\/td>/);
});

test('knowledge reader: model HTML, image and URL payloads never become active content', () => {
  const {html} = renderKnowledgeMarkdown('# <img src=x onerror=alert(1)>\n\n<script>alert(1)</script>\n\n[click](javascript:alert(1))\n![tracking](https://example.com/pixel)\n\n`<iframe>` **<svg onload=alert(1)>**');
  assert.doesNotMatch(html, /<(?:script|img|svg|iframe|a)\b/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img/);
});

test('knowledge reader: unfinished fences, CRLF and repeated headings preserve text', () => {
  const {html,headings} = renderKnowledgeMarkdown('## 同名\r\n## 同名\r\n\r\n~~~\r\n<b>\r\n## 代码标题');
  assert.equal(headings.length,2);
  assert.notEqual(headings[0].id,headings[1].id);
  assert.match(html, /<pre><code>&lt;b&gt;\n## 代码标题<\/code><\/pre>/);
  assert.equal(renderKnowledgeMarkdown('').html,'');
});
