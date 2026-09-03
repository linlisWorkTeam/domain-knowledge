import assert from 'node:assert/strict';
import test from 'node:test';
import { createDomainKnowledgeInfrastructure } from '../../src/infrastructure/workflow/langgraph/index.ts';
import type {
  AgentId, WorkflowNodeProjection, WorkflowStageInput,
} from '../../src/application/ports/index.ts';

test('embedded LangGraph runs every fixed Agent and exposes node projections', async () => {
  const calls: WorkflowStageInput[] = [];
  const projections: WorkflowNodeProjection[] = [];
  const infrastructure = await createDomainKnowledgeInfrastructure({
    checkpoint: { kind: 'memory' },
    prompts: { getPromptAddon: (agentId) => agentId === 'doc-gen' ? 'Explain the boundary first.' : '' },
    observer: { record: (projection) => projections.push(structuredClone(projection)) },
    executor: {
      async execute(input) {
        calls.push(structuredClone({ ...input, signal: undefined }));
        if (input.nodeId === 'workflow_router') {
          return {
            detail: input.iteration === 0 ? 'iterate once' : 'ready',
            route: input.iteration === 0 ? 'ITERATE' : 'PASS',
          };
        }
        const worker = input.workerId ? `:${input.workerId}` : '';
        return { detail: `${input.nodeId} complete`, context: { [`seen:${input.nodeId}:${input.iteration}${worker}`]: true } };
      },
    },
  });
  const handle = await infrastructure.engine.start({
    runId: 'embedded-graph', maxIterations: 3, workerCount: 2,
  });
  const result = await infrastructure.engine.wait(handle.runId);

  assert.equal(result.executionStatus, 'COMPLETED');
  assert.equal(result.route, 'PASS');
  assert.equal(result.iteration, 1);
  const calledAgents = new Set(calls.map((call) => call.agentId).filter(Boolean));
  assert.deepEqual([...calledAgents].sort(), [
    'check', 'code', 'doc-gen', 'doc-worker', 'orchestrator', 'review', 'test-gen',
  ] satisfies AgentId[]);
  assert.match(calls.find((call) => call.agentId === 'doc-gen')?.prompt ?? '', /Explain the boundary first/);
  const firstDocGen = calls.find((call) => call.agentId === 'doc-gen' && call.iteration === 0);
  assert.equal(firstDocGen?.context['seen:doc_worker:0:worker-1'], true);
  assert.equal(firstDocGen?.context['seen:doc_worker:0:worker-2'], true);
  assert.ok(projections.some((projection) => projection.nodeId === 'doc_worker:worker-1'));
  assert.ok(projections.some((projection) => projection.nodeId === 'publication' && projection.status === 'COMPLETED'));
  assert.ok(projections.every((projection) => projection.runId === handle.runId));
  const running = projections.filter((projection) => projection.status === 'RUNNING');
  assert.ok(running.every((projection) => projection.readyAt !== null));
  assert.ok(running.every((projection) => (
    Date.parse(projection.readyAt ?? '') <= Date.parse(projection.startedAt ?? '')
  )));
  const firstFanOutReady = new Set(running.filter((projection) => (
    projection.iteration === 0
      && (projection.nodeId === 'test_gen' || projection.nodeId.startsWith('doc_worker:'))
  )).map((projection) => projection.readyAt));
  assert.equal(firstFanOutReady.size, 1, 'parallel siblings share the recorded scheduler-ready barrier');
  for (const completed of projections.filter((projection) => projection.status === 'COMPLETED')) {
    const started = running.find((projection) => (
      projection.nodeId === completed.nodeId
      && projection.iteration === completed.iteration
      && projection.attempt === completed.attempt
    ));
    assert.equal(completed.readyAt, started?.readyAt);
  }
});

test('embedded LangGraph cancellation wins over an aborted node invocation', async () => {
  let enteredNode!: () => void;
  const entered = new Promise<void>((resolve) => { enteredNode = resolve; });
  const infrastructure = await createDomainKnowledgeInfrastructure({
    checkpoint: { kind: 'memory' },
    prompts: { getPromptAddon: () => '' },
    observer: { record: () => undefined },
    executor: {
      async execute(input) {
        enteredNode();
        await new Promise<void>((_resolve, reject) => {
          input.signal?.addEventListener('abort', () => reject(new Error('cancelled by operator')), { once: true });
        });
        return { detail: 'unreachable' };
      },
    },
  });
  const handle = await infrastructure.engine.start({
    runId: 'cancelled-graph', maxIterations: 2, workerCount: 1,
  });
  await entered;
  await infrastructure.engine.cancel(handle.runId);

  assert.equal((await infrastructure.engine.status(handle.runId)).executionStatus, 'CANCELLED');
});

test('evaluation STOPPED route bypasses review and remains authoritative', async () => {
  const calls: string[] = [];
  const infrastructure = await createDomainKnowledgeInfrastructure({
    checkpoint: { kind: 'memory' },
    prompts: { getPromptAddon: () => '' },
    observer: { record: () => undefined },
    executor: {
      async execute(input) {
        calls.push(input.nodeId);
        if (input.nodeId === 'evaluation') return { detail: 'domain gate stopped', route: 'STOPPED' };
        if (input.nodeId === 'workflow_router') return { detail: 'keep domain decision', route: 'STOPPED' };
        return { detail: `${input.nodeId} complete` };
      },
    },
  });
  const handle = await infrastructure.engine.start({
    runId: 'stopped-by-domain-gate', maxIterations: 2, workerCount: 0,
  });
  const result = await infrastructure.engine.wait(handle.runId);

  assert.equal(result.executionStatus, 'STOPPED');
  assert.equal(result.route, 'STOPPED');
  assert.equal(calls.includes('review'), false);
  assert.equal(calls.filter((nodeId) => nodeId === 'workflow_router').length, 1);
});

test('failed workflow resumes from the latest failed LangGraph checkpoint', async () => {
  const calls: string[] = [];
  const projections: WorkflowNodeProjection[] = [];
  let failCodeOnce = true;
  let clockTick = 0;
  const infrastructure = await createDomainKnowledgeInfrastructure({
    checkpoint: { kind: 'memory' },
    clock: () => new Date(Date.UTC(2026, 8, 4, 0, 0, clockTick++)).toISOString(),
    prompts: { getPromptAddon: () => '' },
    observer: { record: (projection) => projections.push(structuredClone(projection)) },
    executor: {
      async execute(input) {
        calls.push(input.nodeId);
        if (input.nodeId === 'code' && failCodeOnce) {
          failCodeOnce = false;
          throw new Error('transient agent failure');
        }
        if (input.nodeId === 'workflow_router') return { detail: 'ready', route: 'PASS' };
        return { detail: `${input.nodeId} complete` };
      },
    },
  });
  const handle = await infrastructure.engine.start({
    runId: 'resumable-graph', maxIterations: 2, workerCount: 0,
  });
  const failed = await infrastructure.engine.wait(handle.runId);

  assert.equal(failed.executionStatus, 'FAILED');
  assert.equal(failed.currentNode, 'code');
  assert.equal(calls.filter((node) => node === 'code').length, 1);

  const resumed = await infrastructure.engine.resume(handle.runId);
  assert.equal(resumed.executionStatus, 'RUNNING');
  const completed = await infrastructure.engine.wait(handle.runId);

  assert.equal(completed.executionStatus, 'COMPLETED');
  assert.equal(completed.route, 'PASS');
  assert.equal(calls.filter((node) => node === 'code').length, 2);
  assert.ok(projections.some((projection) => projection.nodeId === 'code' && projection.status === 'FAILED'));
  assert.ok(projections.some((projection) => projection.nodeId === 'code' && projection.status === 'COMPLETED'));
  const failedCode = projections.find((projection) => (
    projection.nodeId === 'code' && projection.status === 'FAILED'
  ));
  const resumedCode = projections.filter((projection) => (
    projection.nodeId === 'code' && projection.status === 'RUNNING'
  )).at(-1);
  assert.ok(Date.parse(resumedCode?.readyAt ?? '') >= Date.parse(failedCode?.completedAt ?? ''),
    'resume records a new enqueue time instead of retaining the old predecessor barrier');
});

test('parallel sibling completion cannot hide a recoverable node failure', async () => {
  let failOracleOnce = true;
  const calls: string[] = [];
  const infrastructure = await createDomainKnowledgeInfrastructure({
    checkpoint: { kind: 'memory' },
    prompts: { getPromptAddon: () => '' },
    observer: { record: () => undefined },
    executor: {
      async execute(input) {
        calls.push(input.nodeId);
        if (input.nodeId === 'oracle_validation' && failOracleOnce) {
          failOracleOnce = false;
          throw new Error('transient oracle toolchain failure');
        }
        if (input.nodeId === 'code') await new Promise((resolve) => setTimeout(resolve, 30));
        if (input.nodeId === 'workflow_router') return { detail: 'ready', route: 'PASS' };
        return { detail: `${input.nodeId} complete` };
      },
    },
  });
  const handle = await infrastructure.engine.start({
    runId: 'parallel-resumable-graph', maxIterations: 2, workerCount: 0,
  });
  const failed = await infrastructure.engine.wait(handle.runId);

  assert.equal(failed.executionStatus, 'FAILED');
  assert.equal(failed.route, 'FAILED');
  assert.match(failed.error ?? '', /oracle toolchain/);

  await infrastructure.engine.resume(handle.runId);
  const completed = await infrastructure.engine.wait(handle.runId);
  assert.equal(completed.executionStatus, 'COMPLETED');
  assert.equal(completed.route, 'PASS');
  assert.equal(calls.filter((node) => node === 'oracle_validation').length, 2);
});

test('candidate quality iteration skips code generation for the rejected iteration', async () => {
  const calls: Array<{ nodeId: string; iteration: number }> = [];
  const infrastructure = await createDomainKnowledgeInfrastructure({
    checkpoint: { kind: 'memory' },
    prompts: { getPromptAddon: () => '' },
    observer: { record: () => undefined },
    executor: {
      async execute(input) {
        calls.push({ nodeId: input.nodeId, iteration: input.iteration });
        if (input.nodeId === 'candidate_knowledge' && input.iteration === 0) {
          return { detail: 'quality rejected', route: 'ITERATE' };
        }
        if (input.nodeId === 'workflow_router') {
          return { detail: 'route', route: input.iteration === 0 ? 'ITERATE' : 'PASS' };
        }
        return { detail: `${input.nodeId} complete` };
      },
    },
  });
  const handle = await infrastructure.engine.start({
    runId: 'quality-iteration-graph', maxIterations: 2, workerCount: 0,
  });
  const completed = await infrastructure.engine.wait(handle.runId);

  assert.equal(completed.executionStatus, 'COMPLETED');
  assert.equal(calls.some((call) => call.nodeId === 'code' && call.iteration === 0), false);
  assert.equal(calls.some((call) => call.nodeId === 'code' && call.iteration === 1), true);
});
