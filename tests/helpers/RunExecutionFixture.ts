/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：提供保留真实注册表、仅控制执行事实的失败状态验收夹具。
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createKnowledgeServer } from '../../src/interfaces/runner/Server.ts';
import type { WorkflowExecutionView } from '../../src/application/ports/ApplicationPorts.ts';

/** 不启动工作流或模型；API 与 UI 使用真实业务记录和可审计节点投影。 */
export async function createRunExecutionFixture() {
  const runtimeDir = mkdtempSync(join(tmpdir(), 'run-execution-view-'));
  const instance = createKnowledgeServer({ runtimeDir, writeToken: 'run-view-token' });
  const views = new Map<string, WorkflowExecutionView>();
  const ids: Record<'active' | 'cancelled' | 'incompatible' | 'expired' | 'failed' | 'untracked' | 'unavailable', string> = {} as never;
  for (const key of ['untracked', 'unavailable', 'active', 'cancelled', 'incompatible', 'expired', 'failed'] as const) {
    let run = instance.composition.apps.flywheel.createRun(`execution-${key}`, 'local-v1');
    for (const next of ['PLANNED', 'GENERATING'] as const) run = instance.composition.apps.flywheel.transition(run.runId, next);
    ids[key] = run.runId;
    await instance.composition.apps.orchestrator.runConfiguration.capture(run.runId);
    if (key === 'untracked' || key === 'unavailable') continue;
    views.set(run.runId, {
      runId: run.runId, executionStatus: key === 'active' ? 'RUNNING' : key === 'cancelled' ? 'CANCELLED' : 'FAILED',
      currentNode: 'doc_worker', iteration: 0, maxIterations: 3, route: key === 'active' || key === 'cancelled' ? null : 'FAILED',
      error: key === 'active' || key === 'cancelled' ? null : 'DOC_WORKER_SOURCE_EVIDENCE_INVALID: private-upstream-response',
      budget: { startedAt: '2026-09-09T00:00:00.000Z', deadlineAt: '2026-09-09T00:30:00.000Z', maxDurationMs: 1_800_000,
        remainingMs: key === 'expired' ? 0 : 900_000 },
    });
    if (key === 'cancelled') instance.composition.apps.flywheel.transition(run.runId, 'CANCELLED');
  }
  // 保留旧运行遗留的 RUNNING 节点：只有执行视图决定是否仍然活动。
  instance.composition.workflowObserver.record({
    runId: ids.cancelled, nodeId: 'test_gen', agentId: 'test-gen', status: 'RUNNING', iteration: 0, attempt: 1,
    detail: 'Historical projection retained for audit', error: null, readyAt: null,
    startedAt: '2026-09-09T00:00:00.000Z', completedAt: null, updatedAt: '2026-09-09T00:01:00.000Z',
  });
  const assertCompatible = instance.composition.apps.orchestrator.runConfiguration.assertCompatible.bind(instance.composition.apps.orchestrator.runConfiguration);
  instance.composition.apps.orchestrator.runConfiguration.assertCompatible = async (runId) => {
    if (runId === ids.incompatible) throw new Error('RUN_CONFIGURATION_INCOMPATIBLE: previous execution version');
    return assertCompatible(runId);
  };
  instance.composition.apps.orchestrator.status = async (runId) => {
    if (runId === ids.unavailable) throw new Error('PRIVATE_DATABASE_ERROR: private-connection-material');
    const view = views.get(runId);
    if (!view) throw new Error(`WORKFLOW_NOT_FOUND: ${runId}`);
    return structuredClone(view);
  };
  instance.composition.apps.orchestrator.resume = async (runId) => {
    const view = views.get(runId)!;
    views.set(runId, { ...view, executionStatus: 'RUNNING', route: null, error: null });
    return { runId, executionStatus: 'RUNNING' };
  };
  instance.composition.apps.orchestrator.cancel = async (runId) => {
    const view = views.get(runId)!;
    views.set(runId, { ...view, executionStatus: 'CANCELLED', route: null, error: null });
    instance.composition.apps.flywheel.transition(runId, 'CANCELLED');
  };
  return { instance, ids, views, async dispose() {
    instance.server.closeAllConnections();
    await new Promise<void>((resolveClose) => instance.server.close(() => resolveClose()));
    rmSync(runtimeDir, { recursive: true, force: true });
  } };
}
