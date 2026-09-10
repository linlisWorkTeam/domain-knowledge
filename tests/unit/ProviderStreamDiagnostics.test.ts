/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证流式诊断只保留计数，且没有流量时不伪造时间或用量。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ProviderStreamDiagnostics } from '../../src/infrastructure/agentAdapters/deepSeekHarness/ProviderStreamDiagnostics.ts';
test('stream diagnostics preserve silence, activity and multiple requests without retaining content', () => {
  let now = 100; const diagnostics = new ProviderStreamDiagnostics(() => now);
  assert.equal(diagnostics.snapshot().firstDataMs, null);
  diagnostics.request(); now = 120; diagnostics.headers(); now = 130; diagnostics.data(100);
  diagnostics.frame({ choices: [{ delta: { reasoning_content: 'private thoughts', content: 'answer' } }] });
  const first = diagnostics.snapshot();
  diagnostics.request(); now = 200; diagnostics.headers(); now = 210; diagnostics.data(50);
  diagnostics.frame({ choices: [{ delta: { content: '😀' } }] });
  diagnostics.frame({ usage: { prompt_tokens: 999 } });
  const latest = diagnostics.snapshot();
  assert.equal(latest.requests, 2); assert.equal(latest.firstHeadersMs, 20); assert.equal(latest.firstDataMs, 30); assert.equal(latest.lastDataMs, 110);
  assert.equal(latest.responseBytes, 150); assert.equal(latest.dataFrames, 3);
  assert.equal(latest.contentUtf16Units, 8); assert.equal(latest.reasoningUtf16Units, 16);
  assert.equal(first.lastDataMs, 30); assert.equal(first.responseBytes, 100);
  assert.doesNotMatch(JSON.stringify(latest), /private thoughts|answer|999|tokens/);
});
