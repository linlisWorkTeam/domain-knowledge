/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证完整函数/声明提取与语法噪声、歧义和越界处理。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { extractEvidence } from './CheckEvidence.ts';
const at = (startLine: number, endLine = startLine, kind: 'function' | 'declaration' = 'function') => ({ path: 'Module.cpp', startLine, endLine, kind });
test('Extraction expands an interior statement to the full function preserving literal braces and cleanup', () => {
  const source = '// comment\nint calculate(int x)\n{\n  const char *s = "} ... {"; // }\n  if (x) { x++; }\n  /* } */\n  return x;\n}\nint other() { return 8; }\n';
  const e = extractEvidence(at(5), source);
  assert.equal(e.startLine, 2); assert.equal(e.endLine, 8);
  assert.equal(e.content, source.split('\n').slice(1, 8).join('\n'));
  assert.throws(() => extractEvidence(at(5, 9), source), /CHECK_LOCATION_INVALID/);
});
test('Extraction supports C++ namespaces, methods, raw strings and multiline declarations/macros', () => {
  const source = 'namespace n {\nint f() {\n const char *s=R"tag(\" } {)tag";\n return 1;\n}\n}\ntypedef struct Item {\n int value;\n} Item;\n#define M(x) \\\n ((x) + 1)\n';
  assert.equal(extractEvidence(at(3), source).content, source.split('\n').slice(1,5).join('\n'));
  assert.equal(extractEvidence(at(8,8,'declaration'), source).content, 'typedef struct Item {\n int value;\n} Item;');
  assert.equal(extractEvidence(at(7,9,'declaration'), source).content, 'typedef struct Item {\n int value;\n} Item;');
  assert.match(extractEvidence(at(10,11,'declaration'), source).content, /#define M/);
  assert.match(extractEvidence(at(3), 'class C {\npublic:\n int f() const { return 1; }\n};').content, /int f\(\) const/);
});
test('Extraction never accepts invalid, unmatched or ambiguous locations', () => {
  for (const location of [at(0),at(2,1),at(99),at(1.5)]) assert.throws(() => extractEvidence(location,'int f() { return 1; }'), /CHECK_LOCATION_INVALID/);
  assert.throws(() => extractEvidence(at(1),'int f() { return 1;'), /CHECK_SOURCE_BOUNDARY_INVALID/);
  assert.throws(() => extractEvidence(at(1),'int longer_function() { return 123; } int g() { return 2; }'), /CHECK_LOCATION_INVALID/);
});

test('Extraction refuses constructor initializer lists instead of returning a suffix as a function', () => {
  for (const signature of ['C::C() : x{1}, y(2)', 'C::C() noexcept : x{1}, y(2)', 'C::C() : x(1), y(2)']) {
    const source = `${signature} {\n do_work();\n}`;
    assert.throws(() => extractEvidence(at(2), source), /CHECK_SOURCE_BOUNDARY_INVALID/);
  }
});

test('Extraction expands template members to the complete enclosing type declaration', () => {
  for (const prefix of ['template<typename T>', 'template<typename T = Box<int>>']) {
    const source = `${prefix}\nstruct Box {\n T value;\n int flag;\n};`;
    assert.equal(extractEvidence(at(3, 3, 'declaration'), source).content, source);
  }
});

test('Extraction refuses indistinguishable same-line declarations and accepts unique line ranges', () => {
  assert.throws(() => extractEvidence(at(1, 1, 'declaration'), 'int very_long_name = 1; int b = 2;'), /CHECK_LOCATION_INVALID/);
  const source = 'int very_long_name = 1;\nint b = 2;';
  assert.equal(extractEvidence(at(2, 2, 'declaration'), source).content, 'int b = 2;');
});
