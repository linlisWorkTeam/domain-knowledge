/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证公开接口比较忽略参数名字，但保留返回类型与公开布局差异。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { compareNativeInterfaces } from '../../src/domain/evaluation/NativeInterfaceComparison.ts';
const declaration = { kind: 'FunctionDecl', name: 'add', type: 'int (int, int)', parameters: [{ name: 'a', type: 'int' }, { name: 'b', type: 'int' }] };
test('interface matching tolerates parameter names without claiming behavioral verification', () => {
  const result = compareNativeInterfaces([declaration], [{ ...declaration, parameters: [{ name: 'left', type: 'int' }, { name: 'right', type: 'int' }] }]);
  assert.equal(result.compatible, true); assert.equal(result.ratio, 1); assert.equal(result.behaviorVerified, false);
});
test('missing signatures, changed return types and public layouts remain interface failures', () => {
  assert.equal(compareNativeInterfaces([declaration], []).compatible, false);
  assert.equal(compareNativeInterfaces([declaration], [{ ...declaration, type: 'long (int, int)' }]).compatible, false);
  const layout = { kind: 'RecordDecl', name: 'Token', fields: [{ name: 'position', type: 'int' }] };
  assert.equal(compareNativeInterfaces([layout], [{ ...layout, fields: [{ name: 'position', type: 'short' }] }]).compatible, false);
});
