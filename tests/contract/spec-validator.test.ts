import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { validateTraceabilityMatrix } from '../../specs/13-verification/traceability-validator.ts';

const componentRoot = resolve(import.meta.dirname, '../..');

test('traceability validator accepts the repository matrix', () => {
  const trace = readFileSync(resolve(componentRoot, 'specs/13-verification/traceability-matrix.md'), 'utf8');
  assert.doesNotThrow(() => validateTraceabilityMatrix(trace, componentRoot));
});

test('traceability validator rejects dangling evidence paths', () => {
  const trace = '| KF-SYS-999 | AC-TEST-999 | Implemented | `src/not-present.ts` | `tests/not-present.test.ts` |';
  assert.throws(() => validateTraceabilityMatrix(trace, componentRoot), /implementation path does not exist/);
});

test('traceability validator rejects implementation claims on planned rows', () => {
  const trace = '| NFR-999 | AC-TEST-999 | Planned | `src/domain/index.ts` | — |';
  assert.throws(() => validateTraceabilityMatrix(trace, componentRoot), /must not claim implementation or tests/);
});
