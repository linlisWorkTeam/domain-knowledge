/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证有界规范化差异、C++范围和缺失/歧义的真实报告。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { compareNativeSources } from '../../src/domain/evaluation/NativeSourceComparison.ts';
const api = [{ kind: 'FunctionDecl', name: 'add', parameters: [{ name: 'a', type: 'int' }, { name: 'b', type: 'int' }] }];
const compared = (report: ReturnType<typeof compareNativeSources>) => { const value = report.functions[0]; assert.equal(value?.status, 'COMPARED'); return value; };
const file = (content: string) => [{ path: 'api.c', content }];
test('normalization preserves literals and identifiers while ignoring comments and whitespace', () => {
  const source = 'int add(int a, int b){ /* note */ return a+b; }';
  const same = compareNativeSources(file(source), file('int add(int a,int b) {return a + b;}'), api);
  assert.equal(same.functions[0]?.status, 'COMPARED'); assert.equal(compared(same).similarity, 1);
  const changed = compareNativeSources(file(source), file('int add(int a,int b) {return a-b;}'), api);
  assert.equal(compared(changed).distance, 1); assert.equal(changed.knowledgeErrorProven, false);
  const renamed = compareNativeSources(file(source), file('int add(int x,int y){return x+y;}'), api);
  assert.notEqual(compared(renamed).similarity, 1, 'identifier names are not silently normalized');
  const literal = 'int add(int a,int b){const char*s=R"tag(/*keep*/ \"quote\")tag";return a+b;}';
  const report = compareNativeSources(file(literal), file(literal.replace('/*keep*/', '/*changed*/')), api);
  assert.equal(compared(report).exact, false); assert.equal(compared(report).distance, 1);
});
test('scoped C++ overloads exclude unrelated classes and report unresolved definitions explicitly', () => {
  const declarations = [{ kind: 'CXXRecordDecl', name: 'Util', members: [{ kind: 'CXXMethodDecl', name: 'convert', parameters: [{ name: 'x', type: 'int' }] }, { kind: 'CXXMethodDecl', name: 'convert', parameters: [{ name: 'x', type: 'double' }] }] }];
  const reference = file('namespace ns { struct Util { static int convert(int x){return x;} static int convert(double x){return (int)x;} }; struct Other { int convert(int x){return 0;} }; }');
  const actual = file('namespace ns { int Util::convert(int value){return value;} int Util::convert(double value){return (int)value;} }');
  const report = compareNativeSources(reference, actual, declarations, 'ns::Util');
  assert.equal(report.requested, 2); assert.equal(report.compared, 2); assert.deepEqual(report.unresolved, []);
  const absent = compareNativeSources(reference, file('namespace ns { struct Other { int convert(int x){return x;} }; }'), declarations, 'ns::Util');
  assert.equal(absent.compared, 0); assert.equal(absent.functions[0]?.generatedMatches, 0);
  const duplicate = compareNativeSources(file('int add(int a,int b){return a+b;} int add(int a,int b){return a-b;}'), actual, api);
  assert.equal(duplicate.functions[0]?.status, 'UNRESOLVED'); assert.equal(duplicate.functions[0]?.referenceMatches, 2);
});

test('definition lookup accepts canonical builtin and qualifier spellings without erasing body tokens', () => {
  const declarations = [{ kind: 'FunctionDecl', name: 'convert', parameters: [{ name: 'x', type: 'unsigned int' }, { name: 'text', type: 'const char *' }] }];
  const report = compareNativeSources(file('int convert(unsigned x, char const* text){return x;}'), file('int convert(unsigned int x, const char* text){return x;}'), declarations);
  assert.equal(report.compared, 1); assert.equal(compared(report).exact, true);
});
