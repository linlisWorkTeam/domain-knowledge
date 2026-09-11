/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证源码身份与有限测试修复决策。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceIdentity, testValidationAction } from './TestSuitePolicy.ts';
test('source identity ignores manifest order and unrelated files but detects source changes', () => {
  const files = [{ path: 'a.cpp', sha256: 'a'.repeat(64) }, { path: 'README.md', sha256: 'b'.repeat(64) }];
  const key = sourceIdentity('m', ['a.cpp'], files);
  assert.equal(key, sourceIdentity('m', ['a.cpp'], files.slice().reverse()));
  files[1]!.sha256 = 'c'.repeat(64);
  assert.equal(key, sourceIdentity('m', ['a.cpp'], files));
  files[0]!.sha256 = 'd'.repeat(64);
  assert.notEqual(key, sourceIdentity('m', ['a.cpp'], files));
});
test('repair is bounded and never changes previously validated tests or environment failures', () => {
  const state = { passed: false, infrastructureFailure: false, reused: false, repairs: 0, maxRepairs: 1 };
  assert.equal(testValidationAction(state), 'REPAIR');
  assert.equal(testValidationAction({ ...state, repairs: 1 }), 'MANUAL');
  assert.equal(testValidationAction({ ...state, infrastructureFailure: true }), 'MANUAL');
  assert.equal(testValidationAction({ ...state, reused: true }), 'MANUAL');
  assert.equal(testValidationAction({ ...state, passed: true }), 'ACCEPT');
});
