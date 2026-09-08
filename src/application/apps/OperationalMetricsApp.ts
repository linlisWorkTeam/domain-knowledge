/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：协调Operational指标应用用例及其依赖的领域规则与端口。
 */
import type { OperationalMetricsPort } from '../ports/ApplicationPorts.ts';

/** 定义指标窗口的数据结构与类型约束。 */
export type MetricsWindow = '24h' | '7d' | '30d';

/** 封装Operational指标应用的对外操作与协作依赖。 */
export class OperationalMetricsApp {
  /** 提供指标信息，供调用方读取或传入。 */
  readonly metrics: OperationalMetricsPort;

  /** 注入协作依赖并初始化实例状态。 */
  constructor(metrics: OperationalMetricsPort) {
    this.metrics = metrics;
  }

  /** 提供 runs 对应的runs操作。 */
  runs(window: string): Record<string, unknown> {
    return this.metrics.runs(this.window(window));
  }

  /** 提供 governance 对应的governance操作。 */
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
