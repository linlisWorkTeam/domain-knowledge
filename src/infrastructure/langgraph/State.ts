/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：提供状态的基础设施实现与外部系统接入。
 */
import { Annotation } from '@langchain/langgraph';
import type { AgentId } from '../../application/ports/ApplicationPorts.ts';

/** 定义InfrastructureRoute的数据结构与类型约束。 */
export type InfrastructureRoute = import('../../domain/workflow/Workflow.ts').WorkflowRoute;
/** 定义Infrastructure执行状态的数据结构与类型约束。 */
export type InfrastructureExecutionStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'STOPPED' | 'CANCELLED';

const replace = <T>(_left: T, right: T): T => right;

function latestTimestamp(left: string, right: string): string {
  if (!left) return right;
  if (!right) return left;
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return right;
  return rightTime >= leftTime ? right : left;
}

/** 对外提供Infrastructure状态Annotation，作为调用方使用的统一约定。 */
export const InfrastructureStateAnnotation = Annotation.Root({
  runId: Annotation<string>({ reducer: replace, default: () => '' }),
  executionStatus: Annotation<InfrastructureExecutionStatus>({ reducer: replace, default: () => 'PENDING' }),
  currentNode: Annotation<string | null>({ reducer: replace, default: () => null }),
  iteration: Annotation<number>({ reducer: replace, default: () => 0 }),
  maxIterations: Annotation<number>({ reducer: replace, default: () => 3 }),
  workerCount: Annotation<number>({ reducer: replace, default: () => 0 }),
  route: Annotation<InfrastructureRoute | null>({ reducer: replace, default: () => null }),
  error: Annotation<string | null>({ reducer: replace, default: () => null }),
  context: Annotation<Record<string, unknown>>({
    reducer: (left, right) => ({ ...left, ...right }), default: () => ({}),
  }),
  attempts: Annotation<Record<string, number>>({
    reducer: (left, right) => ({ ...left, ...right }), default: () => ({}),
  }),
  /** Latest predecessor/barrier completion: the next super-step is eligible here. */
  readyAt: Annotation<string>({ reducer: latestTimestamp, default: () => '' }),
  activeAgent: Annotation<AgentId | null>({ reducer: replace, default: () => null }),
});

/** 定义Infrastructure状态的数据结构与类型约束。 */
export type InfrastructureState = typeof InfrastructureStateAnnotation.State;
/** 定义Infrastructure状态Update的数据结构与类型约束。 */
export type InfrastructureStateUpdate = typeof InfrastructureStateAnnotation.Update;
