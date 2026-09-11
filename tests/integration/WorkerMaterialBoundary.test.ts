/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验收 AC-AGENT-104 的 Worker 提示词、CAS 和真实工作区权限。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cppScenario } from '../helpers/CppScenario.ts';
import { createTestComposition } from '../helpers/Fixture.ts';
import { DocWorkerExecutionService } from '../../src/application/services/DocWorkerExecution.ts';
import { TrustedProjectEvaluator } from '../../src/infrastructure/evaluation/project/TrustedProjectEvaluator.ts';
import { LocalAgentWorkspace } from '../../src/domain/workspace/LocalAgentWorkspace.ts';
import { modelExecutionFactory } from '../../src/infrastructure/agentAdapters/ModelExecution.ts';
import { JsonSchemaAgentContractValidator } from '../../src/infrastructure/agentAdapters/contracts/JsonSchemaAgentContractValidator.ts';
import { ConcurrentTasks } from '../../src/infrastructure/agentAdapters/ConcurrentTasks.ts';
import { NODE_BY_AGENT } from '../../src/domain/workflow/AgentDefinitions.ts';
import type { AgentProvider } from '../../src/application/ports/ApplicationPorts.ts';
import type { ArtifactRef } from '../../src/domain/Domain.ts';

test('AC-AGENT-104: concurrent workers, retry and reuse cannot see sibling source through any material channel', async () => {
  const c = createTestComposition(), f = cppScenario();
  try {
    writeFileSync(join(f.scenario.repositoryRoot, 'src/module.cpp'), '// ONLY_FIRST_8123\nint calculate(){return 4;}');
    writeFileSync(join(f.scenario.repositoryRoot, 'src/second.cpp'), '// ONLY_SECOND_9281\nint second(){return 2;}');
    writeFileSync(join(f.scenario.repositoryRoot, 'src/public.h'), '// SHARED_INTERFACE_7751\nint calculate();');
    execFileSync('git', ['add', '.'], { cwd: f.scenario.repositoryRoot });
    execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'scoped source'], { cwd: f.scenario.repositoryRoot });
    f.scenario.sourcePaths.push('src/second.cpp'); f.scenario.publicInterfacePaths.push('src/public.h');
    const snapshot = await new TrustedProjectEvaluator(c.artifacts).inspect(f.scenario);
    const run = c.service.createRun('cpp-module', 'worker-scope'); await c.runConfiguration.capture(run.runId);
    const calls: Record<string, number> = {};
    const factory = modelExecutionFactory(new LocalAgentWorkspace({ workspaceRoot: join(c.runtimeDir, 'views'), allowedSourceRoots: [f.scenario.repositoryRoot] }));
    const provider: AgentProvider = { run: async (request) => {
      const assigned = request.command!.payload.assignedSourcePaths as string[];
      const first = assigned[0] === 'src/module.cpp';
      calls[assigned[0]!] = (calls[assigned[0]!] ?? 0) + 1;
      const own = first ? 'ONLY_FIRST_8123' : 'ONLY_SECOND_9281', other = first ? 'ONLY_SECOND_9281' : 'ONLY_FIRST_8123';
      assert.ok(request.prompt.includes(own)); assert.ok(request.prompt.includes('SHARED_INTERFACE_7751'));
      assert.equal(request.prompt.includes(other), false, 'sibling bytes must never enter the prompt');
      assert.ok(request.inputRefs?.length);
      for (const ref of request.inputRefs) assert.equal(Buffer.from(await c.artifacts.get(ref)).toString().includes(other), false);
      assert.ok(readFileSync(join(request.workspaceRoot!, assigned[0]!), 'utf8').includes(own));
      assert.equal(existsSync(join(request.workspaceRoot!, first ? 'src/second.cpp' : 'src/module.cpp')), false);
      assert.ok(existsSync(join(request.workspaceRoot!, 'src/public.h')));
      if (!first && calls[assigned[0]!] === 1) throw new Error('TRANSIENT_WORKER_FAILURE');
      return { workerId: first ? 'worker-1' : 'worker-2', fragment: 'An evidence-backed source fragment describing the assigned public behavior.', provenance: assigned,
        analysisScope: { moduleId: 'cpp-module', files: assigned, symbols: [] }, sourceEvidence: assigned.map(path => ({path,claim:'Assigned behavior'})), unresolvedQuestions: [] };
    } };
    const service = new DocWorkerExecutionService({ flywheel: c.service, nodeByAgent: NODE_BY_AGENT,
      contracts: new JsonSchemaAgentContractValidator('docs/specs/schemas'), prompts: c.runConfiguration, observer: { record: () => undefined }, tasks: new ConcurrentTasks(2),
      parent: { moduleId: 'cpp-module', sourcePaths: f.scenario.sourcePaths, publicInterfacePaths: f.scenario.publicInterfacePaths,
        payload: { moduleId:'cpp-module', sourceRefs:[snapshot.manifestRef], publicInterfaceRefs:[snapshot.manifestRef] }, provenance:[snapshot.manifestRef],
        materials:[{ref:snapshot.manifestRef,content:JSON.parse(Buffer.from(await c.artifacts.get(snapshot.manifestRef)).toString())}] },
      stage: { runId:run.runId,nodeId:'doc_gen',agentId:'doc-gen',iteration:0,attempt:1,maxIterations:2,workerCount:2,prompt:'scoped',context:{snapshot} },
      model: (command, stage) => factory({ provider,command,stage,scenario:f.scenario }),
    });
    const tasks=[{workerId:'worker-1',sourcePaths:['src/module.cpp']},{workerId:'worker-2',sourcePaths:['src/second.cpp']}];
    await assert.rejects(service.run(tasks), /TRANSIENT_WORKER_FAILURE/);
    const results=await service.run(tasks);
    const before={...calls}; service.dependencies.stage.iteration=1;
    assert.deepEqual(await service.run(tasks),results); assert.deepEqual(calls,before);
    for(const result of results){
      const envelope=JSON.parse(Buffer.from(await c.artifacts.get(result.resultRef)).toString());
      const command=JSON.parse(Buffer.from(await c.artifacts.get(envelope.commandRef)).toString());
      assert.ok((command.payload.sourceRefs as ArtifactRef[]).every(ref=>ref.artifactId!==snapshot.manifestRef.artifactId));
    }
  } finally { c.dispose(); f.cleanup(); }
});
