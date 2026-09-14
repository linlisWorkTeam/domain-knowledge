/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证重载族卡片身份、类型独立与仓库/模块边界。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { knowledgeUnits } from '../../src/domain/knowledge/KnowledgeUnits.ts';
import type { NativeDeclaration } from '../../src/domain/sourceScan/PublicInterface.ts';

test('overloads share one card, type layouts stay separate and qualified names prevent namespace collisions', () => {
  const declarations: NativeDeclaration[] = [
    { kind: 'CXXRecordDecl', name: 'a::Convert', members: [
      { kind: 'CXXMethodDecl', name: 'value', type: 'int (const char *)' },
      { kind: 'CXXMethodDecl', name: 'value', type: 'int (int)' },
    ] },
    { kind: 'FunctionDecl', name: 'b::value', type: 'int (int)' },
    { kind: 'EnumDecl', name: 'Status', values: [{ name: 'OK', value: '0' }] },
  ];
  const units = knowledgeUnits('repo-a', 'convert', declarations);
  assert.equal(units.length, 3);
  assert.equal(units.find((unit) => unit.symbol === 'a::Convert::value')?.declarations.length, 2);
  assert.equal(units.find((unit) => unit.symbol === 'a::Convert::value')?.supportingTypes[0]?.name, 'Status');
  const reordered = knowledgeUnits('repo-a', 'convert', [...declarations].reverse());
  assert.deepEqual(units.map((unit) => unit.cardId), reordered.map((unit) => unit.cardId));
  for (const other of [knowledgeUnits('repo-b', 'convert', declarations), knowledgeUnits('repo-a', 'other', declarations)]) {
    assert.ok(other.every((unit) => !units.some((original) => original.cardId === unit.cardId)));
  }
  const explicit = knowledgeUnits('repo-a', 'convert', [{ kind: 'CXXMethodDecl', name: 'a::Convert::value', type: 'int (int)' }]);
  assert.equal(explicit[0]?.cardId, units.find((unit) => unit.symbol === 'a::Convert::value')?.cardId);
});
