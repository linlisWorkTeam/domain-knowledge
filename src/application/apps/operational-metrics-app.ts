import type { OperationalMetricsPort } from '../ports/index.ts';

export type MetricsWindow = '24h' | '7d' | '30d';

export class OperationalMetricsApp {
  readonly metrics: OperationalMetricsPort;

  constructor(metrics: OperationalMetricsPort) {
    this.metrics = metrics;
  }

  runs(window: string): Record<string, unknown> {
    return this.metrics.runs(this.window(window));
  }

  governance(window: string): Record<string, unknown> {
    return this.metrics.governance(this.window(window));
  }

  private window(value: string): MetricsWindow {
    if (!['24h', '7d', '30d'].includes(value)) {
      throw new Error('METRICS_WINDOW_INVALID: window must be 24h, 7d, or 30d');
    }
    return value as MetricsWindow;
  }
}
