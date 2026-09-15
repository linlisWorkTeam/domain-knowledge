/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证明确依赖诊断的提取、去重及容量约束。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeBuildIssues } from '../../src/infrastructure/evaluation/project/NativeBuildDiagnostics.ts';
test('compiler diagnostics report missing dependencies without guessing unrelated syntax failures', () => {
  assert.deepEqual(nativeBuildIssues("a.c:1:10: fatal error: 'vendor/api.h' file not found\na.c:1: fatal error: vendor/api.h: No such file or directory\n/usr/bin/ld: cannot find -lxml2: No such file or directory\nerror: expected ';'"), [
    { kind: 'MISSING_HEADER', name: 'vendor/api.h' }, { kind: 'MISSING_LIBRARY', name: '-lxml2' }
  ]);
  assert.deepEqual(nativeBuildIssues('error: unknown type name Vendor'), []);
  assert.equal(nativeBuildIssues(Array.from({ length: 30 }, (_, index) => `fatal error: '${index}.h' file not found`).join('\n')).length, 20);
});
