/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验收 AC-AGENT-105 的总轮次上限、质量分支与恢复入口。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { agentScenario } from '../helpers/AgentScenario.ts';

for(const qualityFailure of [false,true]) test(`AC-AGENT-105: one total round stops after ${qualityFailure?'quality rejection':'evaluation failure'}`,async()=>{
  const env=await agentScenario({qualityFailure});
  try{
    const {handle,result}=await env.start(1);
    assert.equal(result.executionStatus,'STOPPED',result.error??'');assert.equal(result.route,'STOPPED');
    assert.equal(env.calls.filter(c=>c.role==='orchestrator').length,1);
    assert.equal(env.calls.filter(c=>c.role==='doc-gen').length,1);
    assert.equal(env.calls.some(c=>c.iteration>0),false);
    assert.equal(env.c.service.status().publications,0);
    const before=env.calls.length;
    await env.workflow.wait(handle.runId);assert.equal(env.calls.length,before);
  }finally{env.dispose();}
});

test('AC-AGENT-105: two total rounds allow a second-round pass',async()=>{
  const env=await agentScenario();
  try{const {result}=await env.start(2);assert.equal(result.route,'PASS',result.error??'');
    assert.deepEqual(env.calls.filter(c=>c.role==='orchestrator').map(c=>c.iteration),[0,1]);
  }finally{env.dispose();}
});

test('AC-AGENT-105: expired generation entry is rejected before any model work; same-round replay is idempotent',async()=>{
  const env=await agentScenario();
  try{
    await assert.rejects(env.stages.execute(env.input(1,1)),/WORKFLOW_ITERATION_LIMIT_EXCEEDED/);
    assert.equal(env.calls.length,0);
    const input=env.input(0,1);const planned=await env.stages.execute(input);
    Object.assign(input.context,planned.context);
    await env.stages.execute(input);
    assert.equal(env.calls.length,1);
  }finally{env.dispose();}
});
