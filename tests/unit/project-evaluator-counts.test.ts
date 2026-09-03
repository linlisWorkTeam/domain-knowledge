import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTestCounts } from '../../src/infrastructure/evaluation/project/index.ts';

test('parses Cargo test totals', () => {
  assert.deepEqual(
    parseTestCounts('test result: ok. 12 passed; 2 failed; 0 ignored'),
    { passed: 12, total: 14, parsed: true },
  );
});

test('parses Jest test totals', () => {
  assert.deepEqual(
    parseTestCounts('Tests:       1 failed, 7 passed, 8 total'),
    { passed: 7, total: 8, parsed: true },
  );
});

test('does not invent tests for empty output', () => {
  assert.deepEqual(parseTestCounts(''), { passed: 0, total: 0, parsed: false });
});

test('does not treat syntax-check output as test evidence', () => {
  assert.deepEqual(
    parseTestCounts('Syntax check completed successfully'),
    { passed: 0, total: 0, parsed: false },
  );
});
