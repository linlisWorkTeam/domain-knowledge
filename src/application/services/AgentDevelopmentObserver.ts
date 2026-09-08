/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：协调角色Development观察器用例及其依赖的领域规则与端口。
 */
import type { WorkflowObserver, WorkflowStageExecutor, WorkflowStageInput, WorkflowStageResult } from '../ports/ApplicationPorts.ts';

/** 单角色执行也记录节点状态，供 Console 和审计读取；这里不创建 LangGraph。 */
export async function executeDevelopmentStage(
  input: WorkflowStageInput, executor: WorkflowStageExecutor, observer: WorkflowObserver,
): Promise<WorkflowStageResult> {
  const startedAt = new Date().toISOString();
  const record = (status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED', error: string | null = null) => {
    const now = new Date().toISOString();
    observer.record({ runId: input.runId, nodeId: input.nodeId, agentId: input.agentId,
      iteration: input.iteration, attempt: input.attempt, status, readyAt: startedAt, startedAt,
      completedAt: status === 'RUNNING' ? null : now, updatedAt: now,
      detail: 'Agent development example; publication not evaluated', error });
  };
  record('RUNNING');
  try {
    if (input.signal?.aborted) throw new Error('AGENT_CANCELLED');
    const result = await executor.execute(input);
    if (input.signal?.aborted) throw new Error('AGENT_CANCELLED');
    record('COMPLETED');
    return result;
  } catch (error) {
    record(input.signal?.aborted ? 'CANCELLED' : 'FAILED', error instanceof Error ? error.message : 'AGENT_EXAMPLE_FAILED');
    throw error;
  }
}
