/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：记录不含响应内容的流式传输计数，区分停顿与持续输出。
 */
export class ProviderStreamDiagnostics {
  private readonly startedAt: number;
  private requests = 0;
  private firstHeadersMs: number | null = null;
  private firstDataMs: number | null = null;
  private lastDataMs: number | null = null;
  private responseBytes = 0;
  private dataFrames = 0;
  private contentUtf16Units = 0;
  private reasoningUtf16Units = 0;
  private readonly now: () => number;
  constructor(now: () => number = () => performance.now()) { this.now = now; this.startedAt = now(); }
  request() { this.requests++; }
  headers() { this.firstHeadersMs ??= Math.max(0, this.now() - this.startedAt); }
  data(bytes: number) {
    const elapsed = Math.max(0, this.now() - this.startedAt);
    this.firstDataMs ??= elapsed; this.lastDataMs = elapsed; this.responseBytes += bytes;
  }
  frame(value: unknown) {
    this.dataFrames++;
    if (!value || typeof value !== 'object' || !('choices' in value) || !Array.isArray(value.choices)) return;
    for (const choice of value.choices) {
      if (!choice || typeof choice !== 'object') continue;
      const delta = choice.delta;
      if (!delta || typeof delta !== 'object') continue;
      if (typeof delta.content === 'string') this.contentUtf16Units += delta.content.length;
      for (const field of ['reasoning_content', 'reasoning']) if (typeof delta[field] === 'string') this.reasoningUtf16Units += delta[field].length;
    }
  }
  snapshot() {
    return { schemaVersion: 'provider-stream-diagnostics-v1', scope: 'PROVIDER_RUN_CUMULATIVE', requests: this.requests,
      firstHeadersMs: this.firstHeadersMs, firstDataMs: this.firstDataMs, lastDataMs: this.lastDataMs,
      responseBytes: this.responseBytes, dataFrames: this.dataFrames, contentUtf16Units: this.contentUtf16Units,
      reasoningUtf16Units: this.reasoningUtf16Units };
  }
}
