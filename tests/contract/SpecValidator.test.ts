/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证Spec校验器的行为、约束及失败场景。
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { validateTraceabilityMatrix } from '../../scripts/TraceabilityValidator.ts';

const componentRoot = resolve(import.meta.dirname, '../..');

test('traceability validator rejects dangling evidence paths', () => {
  const trace = '| KF-SYS-999 | AC-TEST-999 | Implemented | `src/not-present.ts` | `tests/not-present.test.ts` |';
  assert.throws(() => validateTraceabilityMatrix(trace, componentRoot), /implementation path does not exist/);
});

test('traceability validator rejects implementation claims on planned rows', () => {
  const trace = '| NFR-999 | AC-TEST-999 | Planned | `src/domain/Domain.ts` | — |';
  assert.throws(() => validateTraceabilityMatrix(trace, componentRoot), /must not claim implementation or tests/);
});

test('reviewed documentation may have no permanent test evidence', () => {
  const trace = '| NFR-999 | AC-TEST-999 | Implemented | `AGENTS.md` | — |';
  assert.doesNotThrow(() => validateTraceabilityMatrix(trace, componentRoot));
});
