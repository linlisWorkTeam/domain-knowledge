/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验证失败阶段留证、限次恢复、成功阶段重放以及取消预算。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createComposition } from '../../src/interfaces/runner/Composition.ts';
import { RoleExecutionService } from '../../src/application/services/RoleExecution.ts';
import { JsonSchemaAgentContractValidator } from '../../src/infrastructure/agentAdapters/contracts/JsonSchemaAgentContractValidator.ts';
import { NODE_BY_AGENT } from '../../src/domain/workflow/AgentDefinitions.ts';
import { StageValidationIssue, validatedStage } from '../../src/domain/agents/StageValidation.ts';
import type { ModelRequest, RoleInput, StageAttempt } from '../../src/domain/agents/AgentExecution.ts';
import { roleExample } from '../helpers/RoleExample.ts';
import { createTestComposition } from '../helpers/Fixture.ts';

test('role stage: rejected attempts remain immutable and resume cannot reset the two-attempt limit', async () => {
  const composition = createTestComposition();
  try {
    const sample = roleExample<RoleInput<Record<string, unknown>>>('doc-worker');
    for (const material of sample.input.materials) await composition.service.putArtifact(Buffer.from(JSON.stringify(material.content)), material.ref.mediaType);
    const run = composition.service.createRun(sample.input.moduleId, 'stage-recovery');
    sample.context.command.runId = run.runId;
    sample.context.command.generationKey = `${run.runId}:worker:stage-recovery`;
    sample.output.facts[0].endLine = 500;
    const executor = new RoleExecutionService(composition.service,
      new JsonSchemaAgentContractValidator('docs/specs/schemas'), NODE_BY_AGENT);
    const request = { command: sample.context.command, nodeId: 'doc_worker', inputRefs: sample.input.provenance,
      input: sample.input, context: sample.context };
    await assert.rejects(executor.execute(request), /FACT_RANGE_INVALID/);
    const rejected = composition.repository.listEvents(run.runId).filter(({ payload }) => payload.kind === 'role-stage-attempt' && payload.status === 'REJECTED');
    assert.equal(rejected.length, 2);
    const bytes = await Promise.all(rejected.map(({ payload }) => composition.artifacts.get(payload.artifactRef as any)));
    for (const raw of bytes) assert.equal(JSON.parse(Buffer.from(raw).toString()).output.facts[0].endLine, 500);
    assert.equal(composition.repository.getCheckpoint(sample.context.command.generationKey)?.status, 'FAILED');
    sample.output.facts[0].endLine = 1;
    await assert.rejects(executor.execute(request), /STAGE_ATTEMPTS_EXHAUSTED/);
    assert.equal(sample.requests.length, 2);
    for (const event of rejected) assert.equal(await composition.artifacts.verify(event.payload.artifactRef as any), true);
    assert.equal(composition.service.status().publications, 0);
  } finally { composition.dispose(); }
});

test('role stage: resume reuses the accepted outline and starts only the remaining body attempt', async () => {
  const composition = createTestComposition();
  try {
    const sample = roleExample<RoleInput<Record<string, unknown>>>('doc-gen');
    delete sample.input.payload.baseKnowledgeRef; delete sample.input.payload.corrections;
    for (const material of sample.input.materials) await composition.service.putArtifact(Buffer.from(JSON.stringify(material.content)), material.ref.mediaType);
    const run = composition.service.createRun(sample.input.moduleId, 'stage-recovery');
    sample.context.command.runId = run.runId;
    sample.context.command.generationKey = `${run.runId}:docgen:stage-recovery`;
    const execute = sample.context.model.execute;
    const calls: string[] = [];
    sample.context.model.execute = async (request, signal) => {
      calls.push(request.stage!);
      if (request.stage === 'body') throw new Error('CONTROLLED_TRANSPORT_FAILURE');
      return execute(request, signal);
    };
    const executor = new RoleExecutionService(composition.service,
      new JsonSchemaAgentContractValidator('docs/specs/schemas'), NODE_BY_AGENT);
    const request = { command: sample.context.command, nodeId: 'doc_gen', inputRefs: sample.input.provenance,
      input: sample.input, context: sample.context };
    await assert.rejects(executor.execute(request), /CONTROLLED_TRANSPORT_FAILURE/);
    const ref = await executor.execute(request);
    assert.deepEqual(calls, ['outline', 'body', 'body:attempt-2']);
    const envelope = JSON.parse(Buffer.from(await composition.artifacts.get(ref)).toString());
    assert.equal(envelope.status, 'SUCCEEDED');
    assert.equal(composition.service.status().publications, 0);
    assert.deepEqual(await executor.execute(request), ref);
    assert.equal(calls.length, 3);
  } finally { composition.dispose(); }
});

test('role stage: timeout reaches the model signal, drains cleanup and prevents another attempt', async () => {
  const sample = roleExample<RoleInput<Record<string, unknown>>>('doc-worker');
  let calls = 0; let cleaned = false;
  const records: StageAttempt[] = [];
  sample.context.stageJournal = { read: async () => [], record: async (entry) => { records.push(structuredClone(entry)); } };
  sample.context.model.execute = async (_request, signal) => {
    calls++;
    return new Promise((_resolve, reject) => signal!.addEventListener('abort', () => { cleaned = true; reject(signal!.reason); }, { once: true }));
  };
  const request: ModelRequest & { stage: string } = { role: 'doc-worker', stage: 'extract', prompt: 'controlled', outputSchema: {}, readablePaths: [], tools: [] };
  await assert.rejects(validatedStage(sample.context, request, (raw) => raw, 15), /AGENT_STAGE_TIMEOUT/);
  assert.equal(cleaned, true); assert.equal(calls, 1);
  assert.deepEqual(records.map(({ status }) => status), ['STARTED', 'FAILED']);
  sample.context.stageJournal.read = async () => records;
  await assert.rejects(validatedStage(sample.context, request, (raw) => raw, 15), /AGENT_STAGE_TIMEOUT/);
  assert.equal(calls, 1);
});

test('role stage: operator cancellation between rejection and feedback cannot launch a repair', async () => {
  const sample = roleExample<RoleInput<Record<string, unknown>>>('doc-worker');
  let calls = 0;
  sample.context.model.execute = async () => { calls++; return {}; };
  sample.context.model.assertOutput = () => {};
  sample.context.stageJournal = { read: async () => [], record: async ({ status }) => { if (status === 'REJECTED') sample.controller.abort(); } };
  await assert.rejects(validatedStage(sample.context, { role: 'doc-worker', stage: 'extract', prompt: 'controlled', outputSchema: {}, readablePaths: [], tools: [] },
    () => { throw new StageValidationIssue('CONTROLLED_INVALID_RANGE', 'facts[0]', 'Use the authorized range.'); }, 1000), /AGENT_CANCELLED/);
  assert.equal(calls, 1);
});

test('role stage: a killed checkpoint owner can be recovered before the stage deadline without resetting its attempt',
  { skip: process.platform !== 'linux' }, async () => {
    const runtimeDir = mkdtempSync(join(tmpdir(), 'stage-owner-recovery-'));
    let composition = createComposition({ runtimeDir });
    let child: ReturnType<typeof spawn> | undefined;
    try {
      const sample = roleExample<RoleInput<Record<string, unknown>>>('doc-worker');
      for (const material of sample.input.materials) await composition.service.putArtifact(Buffer.from(JSON.stringify(material.content)), material.ref.mediaType);
      const run = composition.service.createRun(sample.input.moduleId, 'crash-recovery');
      sample.context.command.runId = run.runId;
      sample.context.command.generationKey = `${run.runId}:worker:crash-recovery`;
      const commandRef = await composition.service.putArtifact(Buffer.from(JSON.stringify(sample.context.command, null, 2)), 'application/json');
      const inputRefs = [...new Map([...sample.input.provenance, commandRef].map((ref) => [ref.artifactId, ref])).values()]
        .sort((a, b) => a.artifactId.localeCompare(b.artifactId));
      composition.close();
      const script = `
        import { createComposition } from ${JSON.stringify(new URL('../../src/interfaces/runner/Composition.ts', import.meta.url).href)};
        import { createEvent } from ${JSON.stringify(new URL('../../src/domain/Domain.ts', import.meta.url).href)};
        const {runtimeDir,command,inputRefs} = JSON.parse(process.argv[1]);
        const c = createComposition({runtimeDir});
        c.repository.claimCheckpoint({runId:command.runId,nodeId:'doc_worker',generationKey:command.generationKey,
          status:'RUNNING',inputRefs,outputRefs:[],retryCount:0,updatedAt:new Date().toISOString()});
        const entry = {schemaVersion:'role-stage-v1',stage:'extract',attempt:1,startedAt:Date.now(),status:'STARTED'};
        const artifactRef = await c.artifacts.put(Buffer.from(JSON.stringify(entry)), 'application/json');
        c.repository.recordOperationalEvent(createEvent(command.runId,'ArtifactCommitted',{
          kind:'role-stage-attempt',generationKey:command.generationKey,stage:'extract',attempt:1,status:'STARTED',artifactRef
        },new Date().toISOString()));
        process.stdout.write('READY');
        setInterval(() => {}, 1000);
      `;
      child = spawn(process.execPath, ['--input-type=module', '-e', script,
        JSON.stringify({ runtimeDir, command: sample.context.command, inputRefs })], { stdio: ['ignore', 'pipe', 'pipe'] });
      await Promise.race([once(child.stdout!, 'data'), once(child, 'exit').then(() => { throw new Error('CONTROLLED_CHILD_EXITED_EARLY'); })]);
      composition = createComposition({ runtimeDir });
      const held = composition.repository.getCheckpoint(sample.context.command.generationKey)!;
      assert.throws(() => composition.repository.claimCheckpoint({ ...held, retryCount: 1, updatedAt: new Date().toISOString() }), /already running/);
      const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
      const executor = new RoleExecutionService(composition.service, new JsonSchemaAgentContractValidator('docs/specs/schemas'), NODE_BY_AGENT);
      await executor.execute({ command: sample.context.command, nodeId: 'doc_worker', inputRefs: sample.input.provenance, input: sample.input, context: sample.context });
      assert.deepEqual(sample.requests.map(({ stage }) => stage), ['extract:attempt-2']);
      assert.equal(composition.repository.getCheckpoint(sample.context.command.generationKey)?.status, 'COMMITTED');
      assert.equal(composition.repository.getCheckpoint(sample.context.command.generationKey)?.retryCount, 1);
    } finally { child?.kill('SIGKILL'); if (composition.repository.database.isOpen) composition.close(); rmSync(runtimeDir, { recursive: true, force: true }); }
  });
