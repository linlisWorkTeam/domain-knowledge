/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：合并业务阶段与工作流执行事实，形成不会误报运行中的只读展示。
 */
import type { WorkflowExecutionView } from '../ports/ApplicationPorts.ts';

/** 执行事实与业务 state 分离；未知记录不得推断为正在运行。 */
export interface RunExecutionPresentation {
  executionStatus: WorkflowExecutionView['executionStatus'] | 'NOT_TRACKED' | 'UNAVAILABLE';
  executionFailure: { code: string; nodeId: string | null } | null;
  recovery: { canResume: boolean; reasonCode: string };
  isActive: boolean;
  canCancel: boolean;
}

/** 只使用安全错误码和节点定位；模型/服务原始错误保留在既有审计中，不转发到列表。 */
function failureCode(error: string | null): string {
  return /^([A-Z][A-Z0-9_]{1,79})(?::|$)/.exec(error ?? '')?.[1] ?? 'WORKFLOW_EXECUTION_FAILED';
}

/** 纯展示规则；不修改业务状态、不把陈旧节点投影当成活动进程。 */
export function presentRunExecution(
  businessState: string,
  view: WorkflowExecutionView | 'NOT_TRACKED' | 'UNAVAILABLE',
  configurationCompatible = false,
): RunExecutionPresentation {
  if (typeof view === 'string') return {
    executionStatus: view, executionFailure: null,
    recovery: { canResume: false, reasonCode: view === 'NOT_TRACKED' ? 'EXECUTION_NOT_TRACKED' : 'EXECUTION_UNAVAILABLE' },
    isActive: false, canCancel: false,
  };
  const businessTerminal = ['VERIFIED', 'LOW_CONFIDENCE', 'FAILED', 'CANCELLED'].includes(businessState);
  const failed = view.executionStatus === 'FAILED';
  const nodeId = view.currentNode && /^[a-z0-9:_-]{1,128}$/i.test(view.currentNode) ? view.currentNode : null;
  const reasonCode = !failed ? 'EXECUTION_NOT_FAILED'
    : businessTerminal ? 'BUSINESS_TERMINAL'
    : !view.budget ? 'BUDGET_UNAVAILABLE'
    : !Number.isFinite(view.budget.remainingMs) || view.budget.remainingMs <= 0 ? 'BUDGET_EXHAUSTED'
    : !nodeId ? 'FAILED_NODE_UNAVAILABLE'
    : !configurationCompatible ? 'RUN_CONFIGURATION_INCOMPATIBLE'
    : 'RECOVERABLE';
  return {
    executionStatus: view.executionStatus,
    executionFailure: failed ? { code: failureCode(view.error), nodeId } : null,
    recovery: { canResume: reasonCode === 'RECOVERABLE', reasonCode },
    isActive: view.executionStatus === 'RUNNING' && !businessTerminal,
    canCancel: view.executionStatus === 'RUNNING' && !businessTerminal,
  };
}
